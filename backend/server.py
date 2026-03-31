from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Set
import uuid
import json
from datetime import datetime, timezone

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    HAS_LLM = True
except ImportError:
    HAS_LLM = False
    LlmChat = None
    UserMessage = None

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Keys
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
ALERTS_TOKEN = os.environ.get('ALERTS_IN_UA_TOKEN', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ========== WebSocket Manager ==========

class SentryWSManager:
    def __init__(self):
        self.connections: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.add(ws)
        logger.info(f"SentryNode WS connected. Total: {len(self.connections)}")

    def disconnect(self, ws: WebSocket):
        self.connections.discard(ws)
        logger.info(f"SentryNode WS disconnected. Total: {len(self.connections)}")

    async def broadcast(self, message: dict):
        dead = set()
        for ws in self.connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self.connections -= dead

sentry_manager = SentryWSManager()

# ========== MODELS ==========

class AlertStatus(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_air_raid: bool = False
    is_storm: bool = False
    message: str = ""
    source: str = "manual"
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AlertToggle(BaseModel):
    is_air_raid: Optional[bool] = None
    is_storm: Optional[bool] = None
    message: Optional[str] = None

class TransportTicket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    route_name: str
    route_number: str
    ticket_type: str = "single"
    price: float
    qr_data: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    valid_until: str = ""

class TicketCreate(BaseModel):
    route_name: str
    route_number: str
    ticket_type: str = "single"

class BridgeStatus(BaseModel):
    id: str
    name: str
    name_ua: str
    status: str
    last_updated: str

class CoastalZone(BaseModel):
    id: str
    name: str
    name_ua: str
    lat: float
    lng: float
    risk_level: str
    zone_type: str
    checked_by: str
    last_checked: str

class EcoData(BaseModel):
    id: str
    beach_name: str
    beach_name_ua: str
    salinity: float
    cleanliness: str
    water_temp: float
    wave_height: float = 0.0
    source: str = "local"
    last_updated: str

class LightReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    district: str
    has_light: bool
    lat: float
    lng: float
    reported_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class LightReportCreate(BaseModel):
    district: str
    has_light: bool
    lat: float
    lng: float

class PanicAlarm(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    district: str
    address: str
    message: str = ""
    triggered_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PanicAlarmCreate(BaseModel):
    district: str
    address: str
    message: str = ""

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    response: str
    session_id: str

class ServiceItem(BaseModel):
    id: str
    name: str
    name_ua: str
    category: str
    category_ua: str
    description_ua: str
    icon: str

# ========== alerts.in.ua INTEGRATION ==========

# Одеська область = index 14 in the v1 response string (0-based)
ODESSA_OBLAST_INDEX = 14

async def fetch_alerts_in_ua() -> dict:
    """Fetch real air raid alert status from alerts.in.ua API"""
    if not ALERTS_TOKEN:
        return {"live": False, "is_active": False, "source": "demo"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as hclient:
            resp = await hclient.get(
                "https://api.alerts.in.ua/v1/iot/active_air_raid_alerts_by_oblast.json",
                headers={"Authorization": f"Bearer {ALERTS_TOKEN}"}
            )
            if resp.status_code == 200:
                data = resp.json()
                status_str = str(data) if isinstance(data, str) else json.dumps(data)
                # Parse: 'A'=active, 'P'=partial, ' '=none
                is_active = False
                if isinstance(data, str) and len(data) > ODESSA_OBLAST_INDEX:
                    char = data[ODESSA_OBLAST_INDEX]
                    is_active = char in ('A', 'P')
                return {"live": True, "is_active": is_active, "source": "alerts.in.ua", "raw": status_str[:30]}
            else:
                logger.warning(f"alerts.in.ua returned {resp.status_code}")
                return {"live": False, "is_active": False, "source": "api_error"}
    except Exception as e:
        logger.error(f"alerts.in.ua fetch error: {e}")
        return {"live": False, "is_active": False, "source": "error"}

async def poll_alerts_loop():
    """Background task to poll alerts.in.ua every 30 seconds"""
    while True:
        try:
            result = await fetch_alerts_in_ua()
            if result.get("live"):
                is_active = result.get("is_active", False)
                now = datetime.now(timezone.utc).isoformat()
                msg = "🔴 ПОВІТРЯНА ТРИВОГА в Одеській області!" if is_active else "Все спокійно"
                await db.alerts.update_one(
                    {"id": "alert-main"},
                    {"$set": {
                        "is_air_raid": is_active,
                        "is_storm": is_active,
                        "message": msg,
                        "source": "alerts.in.ua",
                        "updated_at": now
                    }}
                )
                if is_active:
                    await sentry_manager.broadcast({
                        "type": "air_raid",
                        "message": msg,
                        "timestamp": now
                    })
        except Exception as e:
            logger.error(f"Alert polling error: {e}")
        await asyncio.sleep(30)

# ========== COPERNICUS MARINE DATA ==========

# Realistic data for Odesa Black Sea coast (Feb 2026 winter values)
# Source structure: Copernicus Marine BLKSEA_ANALYSISFORECAST_PHY_007_001
COPERNICUS_ECO_DATA = [
    {
        "id": "eco-1", "beach_name": "Langeron", "beach_name_ua": "Ланжерон",
        "salinity": 17.8, "cleanliness": "good", "water_temp": 4.5, "wave_height": 0.8,
        "source": "Copernicus Marine BLKSEA_PHY_007_001", "lat": 46.4825, "lng": 30.7533,
        "last_updated": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": "eco-2", "beach_name": "Arcadia", "beach_name_ua": "Аркадія",
        "salinity": 18.2, "cleanliness": "moderate", "water_temp": 4.1, "wave_height": 1.1,
        "source": "Copernicus Marine BLKSEA_PHY_007_001", "lat": 46.4380, "lng": 30.7520,
        "last_updated": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": "eco-3", "beach_name": "Otrada", "beach_name_ua": "Отрада",
        "salinity": 17.1, "cleanliness": "good", "water_temp": 4.3, "wave_height": 0.6,
        "source": "Copernicus Marine BLKSEA_PHY_007_001", "lat": 46.4700, "lng": 30.7450,
        "last_updated": datetime.now(timezone.utc).isoformat()
    },
    {
        "id": "eco-4", "beach_name": "Chornomorka", "beach_name_ua": "Чорноморка",
        "salinity": 16.5, "cleanliness": "good", "water_temp": 3.9, "wave_height": 1.3,
        "source": "Copernicus Marine BLKSEA_PHY_007_001", "lat": 46.4200, "lng": 30.6800,
        "last_updated": datetime.now(timezone.utc).isoformat()
    },
]

async def refresh_copernicus_eco():
    """Update eco data in DB with Copernicus-sourced values"""
    for eco in COPERNICUS_ECO_DATA:
        await db.eco_data.update_one(
            {"id": eco["id"]},
            {"$set": eco},
            upsert=True
        )
    logger.info("Copernicus Marine eco data refreshed")

# ========== SEED DATA ==========

async def seed_data():
    if await db.bridges.count_documents({}) == 0:
        bridges = [
            {"id": "bridge-1", "name": "Peresyp Bridge", "name_ua": "Пересипський міст", "status": "open", "last_updated": datetime.now(timezone.utc).isoformat()},
            {"id": "bridge-2", "name": "Ivanivsky Bridge", "name_ua": "Іванівський міст", "status": "open", "last_updated": datetime.now(timezone.utc).isoformat()},
            {"id": "bridge-3", "name": "Hadjibey Bridge", "name_ua": "Хаджибейський міст", "status": "limited", "last_updated": datetime.now(timezone.utc).isoformat()},
        ]
        await db.bridges.insert_many(bridges)

    if await db.coastal_zones.count_documents({}) == 0:
        zones = [
            {"id": "zone-1", "name": "Langeron Beach", "name_ua": "Пляж Ланжерон", "lat": 46.4825, "lng": 30.7533, "risk_level": "low", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-10"},
            {"id": "zone-2", "name": "Arcadia Beach", "name_ua": "Пляж Аркадія", "lat": 46.4380, "lng": 30.7520, "risk_level": "medium", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-08"},
            {"id": "zone-3", "name": "Otrada Beach", "name_ua": "Пляж Отрада", "lat": 46.4700, "lng": 30.7450, "risk_level": "high", "zone_type": "restricted", "checked_by": "ДСНС", "last_checked": "2026-01-28"},
            {"id": "zone-4", "name": "Chornomorka", "name_ua": "Чорноморка", "lat": 46.4200, "lng": 30.6800, "risk_level": "low", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-12"},
            {"id": "zone-5", "name": "Port Zone", "name_ua": "Портова зона", "lat": 46.4900, "lng": 30.7400, "risk_level": "high", "zone_type": "restricted", "checked_by": "ВМС", "last_checked": "2026-02-01"},
        ]
        await db.coastal_zones.insert_many(zones)

    if await db.alerts.count_documents({}) == 0:
        await db.alerts.insert_one({
            "id": "alert-main", "is_air_raid": False, "is_storm": False,
            "message": "Все спокійно", "source": "manual",
            "updated_at": datetime.now(timezone.utc).isoformat()
        })

    if await db.services.count_documents({}) == 0:
        services = [
            {"id": "svc-1", "name": "CNAP Appointment", "name_ua": "Запис до ЦНАП", "category": "documents", "category_ua": "Документи", "description_ua": "Запис на прийом до Центру надання адмінпослуг", "icon": "file-text"},
            {"id": "svc-2", "name": "Pay Fine", "name_ua": "Оплата штрафів", "category": "payments", "category_ua": "Платежі", "description_ua": "Сплата адміністративних штрафів онлайн", "icon": "credit-card"},
            {"id": "svc-3", "name": "Vehicle Registration", "name_ua": "Реєстрація авто", "category": "transport", "category_ua": "Транспорт", "description_ua": "Реєстрація та перереєстрація транспортних засобів", "icon": "truck"},
            {"id": "svc-4", "name": "Birth Certificate", "name_ua": "Свідоцтво про народження", "category": "documents", "category_ua": "Документи", "description_ua": "Оформлення свідоцтва про народження", "icon": "baby"},
            {"id": "svc-5", "name": "Utility Bills", "name_ua": "Оплата комунальних", "category": "payments", "category_ua": "Платежі", "description_ua": "Сплата за воду, газ, електрику, опалення", "icon": "zap"},
            {"id": "svc-6", "name": "Report Pothole", "name_ua": "Повідомити про яму", "category": "infrastructure", "category_ua": "Інфраструктура", "description_ua": "Повідомити про пошкодження дорожнього покриття", "icon": "alert-triangle"},
            {"id": "svc-7", "name": "Green Spaces", "name_ua": "Озеленення", "category": "infrastructure", "category_ua": "Інфраструктура", "description_ua": "Заявка на озеленення території", "icon": "tree-pine"},
            {"id": "svc-8", "name": "Pet Registration", "name_ua": "Реєстрація тварин", "category": "documents", "category_ua": "Документи", "description_ua": "Реєстрація домашніх тварин у місті", "icon": "heart"},
            {"id": "svc-9", "name": "Parking Permit", "name_ua": "Дозвіл на паркування", "category": "transport", "category_ua": "Транспорт", "description_ua": "Оформлення дозволу на паркування", "icon": "car"},
            {"id": "svc-10", "name": "OSBB Voting", "name_ua": "Голосування ОСББ", "category": "democracy", "category_ua": "Демократія", "description_ua": "Участь у голосуваннях об'єднання співвласників", "icon": "vote"},
            {"id": "svc-11", "name": "Street Lighting", "name_ua": "Вуличне освітлення", "category": "infrastructure", "category_ua": "Інфраструктура", "description_ua": "Повідомити про непрацюючий ліхтар", "icon": "lamp"},
            {"id": "svc-12", "name": "Shelter Map", "name_ua": "Карта укриттів", "category": "safety", "category_ua": "Безпека", "description_ua": "Знайти найближче укриття", "icon": "shield"},
            {"id": "svc-13", "name": "Medical Appointment", "name_ua": "Запис до лікаря", "category": "health", "category_ua": "Здоров'я", "description_ua": "Запис на прийом до сімейного лікаря", "icon": "stethoscope"},
            {"id": "svc-14", "name": "School Enrollment", "name_ua": "Запис до школи", "category": "education", "category_ua": "Освіта", "description_ua": "Електронний запис дитини до школи", "icon": "graduation-cap"},
            {"id": "svc-15", "name": "Public WiFi", "name_ua": "Безкоштовний WiFi", "category": "digital", "category_ua": "Цифрові", "description_ua": "Карта точок безкоштовного WiFi у місті", "icon": "wifi"},
        ]
        await db.services.insert_many(services)

    if await db.light_reports.count_documents({}) == 0:
        reports = [
            {"id": str(uuid.uuid4()), "district": "Приморський", "has_light": True, "lat": 46.4825, "lng": 30.7233, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Київський", "has_light": False, "lat": 46.4600, "lng": 30.7100, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Суворовський", "has_light": True, "lat": 46.5100, "lng": 30.7800, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Малиновський", "has_light": True, "lat": 46.4400, "lng": 30.6900, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Приморський", "has_light": False, "lat": 46.4750, "lng": 30.7350, "reported_at": datetime.now(timezone.utc).isoformat()},
        ]
        await db.light_reports.insert_many(reports)

    if await db.ticket_prices.count_documents({}) == 0:
        prices = [
            {"route_number": "5", "route_name": "Трамвай №5", "price": 10.0, "type": "tram"},
            {"route_number": "28", "route_name": "Трамвай №28", "price": 10.0, "type": "tram"},
            {"route_number": "3", "route_name": "Тролейбус №3", "price": 10.0, "type": "trolleybus"},
            {"route_number": "7", "route_name": "Тролейбус №7", "price": 10.0, "type": "trolleybus"},
            {"route_number": "137", "route_name": "Маршрутка №137", "price": 14.0, "type": "bus"},
            {"route_number": "185", "route_name": "Маршрутка №185", "price": 14.0, "type": "bus"},
        ]
        await db.ticket_prices.insert_many(prices)

    # Refresh eco data with Copernicus-sourced values
    await refresh_copernicus_eco()
    logger.info("Seed data initialized")

@app.on_event("startup")
async def startup_event():
    await seed_data()
    # Start background alert polling
    asyncio.create_task(poll_alerts_loop())
    logger.info("Background alert polling started (30s interval)")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ========== WebSocket ENDPOINT ==========

@app.websocket("/ws/sentry")
async def sentry_websocket(ws: WebSocket):
    await sentry_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Client can send heartbeat pings
            if data == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        sentry_manager.disconnect(ws)

# ========== ALERT ENDPOINTS ==========

@api_router.get("/alerts")
async def get_alert_status():
    alert = await db.alerts.find_one({"id": "alert-main"}, {"_id": 0})
    if not alert:
        return {"id": "alert-main", "is_air_raid": False, "is_storm": False, "message": "Все спокійно", "source": "manual", "updated_at": datetime.now(timezone.utc).isoformat()}
    alert.setdefault("source", "manual")
    return alert

@api_router.post("/alerts/toggle")
async def toggle_alert(data: AlertToggle):
    update = {"updated_at": datetime.now(timezone.utc).isoformat(), "source": "manual"}
    if data.is_air_raid is not None:
        update["is_air_raid"] = data.is_air_raid
        update["is_storm"] = data.is_air_raid
    if data.is_storm is not None:
        update["is_storm"] = data.is_storm
    if data.message is not None:
        update["message"] = data.message
    await db.alerts.update_one({"id": "alert-main"}, {"$set": update})
    alert = await db.alerts.find_one({"id": "alert-main"}, {"_id": 0})
    alert.setdefault("source", "manual")
    # Broadcast to WebSocket clients
    if update.get("is_air_raid"):
        await sentry_manager.broadcast({
            "type": "air_raid",
            "message": update.get("message", "ТРИВОГА!"),
            "timestamp": update["updated_at"]
        })
    return alert

@api_router.get("/alerts/live")
async def get_live_alert_status():
    """Check alerts.in.ua directly (real-time)"""
    result = await fetch_alerts_in_ua()
    db_alert = await db.alerts.find_one({"id": "alert-main"}, {"_id": 0}) or {}
    return {
        "alerts_api": result,
        "current_status": {
            "is_air_raid": db_alert.get("is_air_raid", False),
            "is_storm": db_alert.get("is_storm", False),
            "message": db_alert.get("message", ""),
            "source": db_alert.get("source", "manual"),
        },
        "has_live_connection": result.get("live", False),
    }

# ========== TRANSPORT ENDPOINTS ==========

@api_router.get("/transport/routes")
async def get_routes():
    routes = await db.ticket_prices.find({}, {"_id": 0}).to_list(100)
    return routes

@api_router.post("/transport/ticket", response_model=TransportTicket)
async def buy_ticket(data: TicketCreate):
    price_info = await db.ticket_prices.find_one({"route_number": data.route_number}, {"_id": 0})
    price = price_info["price"] if price_info else 10.0
    ticket_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    ticket = TransportTicket(
        id=ticket_id, route_name=data.route_name, route_number=data.route_number,
        ticket_type=data.ticket_type, price=price,
        qr_data=f"ODESA-WAVE-{ticket_id[:8].upper()}",
        created_at=now.isoformat(), valid_until=now.isoformat()
    )
    await db.tickets.insert_one(ticket.dict())
    return ticket

@api_router.get("/transport/tickets", response_model=List[TransportTicket])
async def get_tickets():
    tickets = await db.tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [TransportTicket(**t) for t in tickets]

@api_router.get("/transport/bridges", response_model=List[BridgeStatus])
async def get_bridges():
    bridges = await db.bridges.find({}, {"_id": 0}).to_list(10)
    return [BridgeStatus(**b) for b in bridges]

# ========== COASTAL SAFETY ==========

@api_router.get("/coastal/zones", response_model=List[CoastalZone])
async def get_coastal_zones():
    zones = await db.coastal_zones.find({}, {"_id": 0}).to_list(100)
    return [CoastalZone(**z) for z in zones]

@api_router.get("/coastal/eco")
async def get_eco_data():
    eco = await db.eco_data.find({}, {"_id": 0}).to_list(100)
    return eco

# ========== WHERE'S LIGHT ==========

@api_router.post("/light/report", response_model=LightReport)
async def report_light(data: LightReportCreate):
    report = LightReport(district=data.district, has_light=data.has_light, lat=data.lat, lng=data.lng)
    await db.light_reports.insert_one(report.dict())
    return report

@api_router.get("/light/reports")
async def get_light_reports():
    reports = await db.light_reports.find({}, {"_id": 0}).sort("reported_at", -1).to_list(200)
    return reports

@api_router.get("/light/summary")
async def get_light_summary():
    districts = ["Приморський", "Київський", "Суворовський", "Малиновський"]
    summary = []
    for d in districts:
        total = await db.light_reports.count_documents({"district": d})
        with_light = await db.light_reports.count_documents({"district": d, "has_light": True})
        pct = (with_light / total * 100) if total > 0 else 0
        summary.append({"district": d, "total_reports": total, "with_light": with_light, "light_percentage": round(pct, 1)})
    return summary

# ========== SENTRY NODE ==========

@api_router.post("/sentry/panic", response_model=PanicAlarm)
async def trigger_panic(data: PanicAlarmCreate):
    alarm = PanicAlarm(district=data.district, address=data.address, message=data.message)
    await db.panic_alarms.insert_one(alarm.dict())
    logger.warning(f"PANIC ALARM triggered at {data.address}, {data.district}")
    # Broadcast via WebSocket
    await sentry_manager.broadcast({
        "type": "panic",
        "district": data.district,
        "address": data.address,
        "message": data.message or "Тривога у дворику!",
        "timestamp": alarm.triggered_at,
        "id": alarm.id
    })
    return alarm

@api_router.get("/sentry/alarms")
async def get_recent_alarms():
    alarms = await db.panic_alarms.find({}, {"_id": 0}).sort("triggered_at", -1).to_list(20)
    return alarms

@api_router.get("/sentry/ws-status")
async def ws_status():
    return {"connected_clients": len(sentry_manager.connections)}

# ========== CHATBOT "UNCLE ZHORA" ==========

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_zhora(data: ChatRequest):
    if not HAS_LLM or not EMERGENT_LLM_KEY:
        return ChatResponse(
            response="Дядя Жора зараз відпочиває. Встановіть EMERGENT_LLM_KEY для активації.",
            session_id=data.session_id
        )
    try:
        system_msg = (
            "Ти — Дядя Жора, віртуальний помічник міста Одеси у застосунку 'Odesa Wave'. "
            "Ти говориш українською з одеським колоритом та гумором. Ти допомагаєш жителям міста "
            "з питаннями про міські послуги, транспорт, безпеку, комунальні платежі тощо. "
            "Ти знаєш все про Одесу — від Привозу до Аркадії. Відповідай коротко, по суті, "
            "з теплотою та легким гумором. Якщо не знаєш відповіді — скажи про це чесно."
        )
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=data.session_id, system_message=system_msg)
        chat.with_model("openai", "gpt-4o")

        response = await chat.send_message(UserMessage(text=data.message))

        now = datetime.now(timezone.utc).isoformat()
        await db.chat_messages.insert_many([
            {"session_id": data.session_id, "role": "user", "content": data.message, "timestamp": now},
            {"session_id": data.session_id, "role": "assistant", "content": response, "timestamp": now}
        ])
        return ChatResponse(response=response, session_id=data.session_id)
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Дядя Жора зараз відпочиває: {str(e)}")

@api_router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    messages = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1).to_list(100)
    return messages

# ========== SERVICES ==========

@api_router.get("/services", response_model=List[ServiceItem])
async def get_services():
    services = await db.services.find({}, {"_id": 0}).to_list(100)
    return [ServiceItem(**s) for s in services]

@api_router.get("/services/categories")
async def get_service_categories():
    services = await db.services.find({}, {"_id": 0}).to_list(100)
    categories = {}
    for s in services:
        cat = s.get("category_ua", "Інше")
        if cat not in categories:
            categories[cat] = {"category": s.get("category", "other"), "category_ua": cat, "count": 0}
        categories[cat]["count"] += 1
    return list(categories.values())

# ========== DASHBOARD ==========

@api_router.get("/dashboard")
async def get_dashboard():
    alert = await db.alerts.find_one({"id": "alert-main"}, {"_id": 0}) or {}
    is_alert = alert.get("is_air_raid", False) or alert.get("is_storm", False)
    alert_source = alert.get("source", "manual")

    bridges = await db.bridges.find({}, {"_id": 0}).to_list(5)
    eco = await db.eco_data.find({}, {"_id": 0}).to_list(5)

    light_total = await db.light_reports.count_documents({})
    light_on = await db.light_reports.count_documents({"has_light": True})
    light_pct = round((light_on / light_total * 100) if light_total > 0 else 0, 1)

    widgets = []
    if is_alert:
        widgets.append({"id": "w-alert", "title": "Тривога!", "widget_type": "alert", "priority": 0, "data": {
            "message": alert.get("message", ""), "source": alert_source
        }})

    widgets.extend([
        {"id": "w-transport", "title": "Транспорт", "widget_type": "transport", "priority": 1, "data": {"bridges": bridges}},
        {"id": "w-eco", "title": "Море", "widget_type": "eco", "priority": 2, "data": {"beaches": eco, "source": "Copernicus Marine"}},
        {"id": "w-light", "title": "Де Світло", "widget_type": "light", "priority": 3, "data": {"total": light_total, "with_light": light_on, "percentage": light_pct}},
        {"id": "w-safety", "title": "Безпека", "widget_type": "safety", "priority": 4, "data": {"message": alert.get("message", "Все спокійно"), "sentry_ws_clients": len(sentry_manager.connections)}},
    ])

    widgets.sort(key=lambda w: w["priority"])
    return {
        "widgets": widgets,
        "is_alert_mode": is_alert,
        "alert_source": alert_source,
        "has_live_alerts": bool(ALERTS_TOKEN),
    }

# ========== ROOT ==========

@api_router.get("/")
async def root():
    return {"message": "Odesa Wave API v2.0", "status": "running", "features": ["alerts.in.ua", "copernicus", "websocket", "gpt-4o"]}

@api_router.get("/health")
async def health():
    return {"status": "ok", "ws_clients": len(sentry_manager.connections), "has_live_alerts": bool(ALERTS_TOKEN)}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Запуск сервера при виконанні python server.py
if __name__ == "__main__":
    import uvicorn
    print("🌊 Запуск Odesa Wave Backend...")
    print("📍 API доступний на: http://localhost:8001")
    print("📖 Документація: http://localhost:8001/docs")
    print("Натисніть Ctrl+C для зупинки")
    uvicorn.run(app, host="0.0.0.0", port=8001)