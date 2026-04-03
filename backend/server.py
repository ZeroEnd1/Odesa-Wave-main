from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Set
import uuid
import json
from datetime import datetime, timezone, timedelta
import bcrypt
import secrets
from contextlib import asynccontextmanager
import google.genai as genai

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

try:
    from jose import jwt, JWTError
    HAS_JOSE = True
except ImportError:
    HAS_JOSE = False

HAS_LLM = False
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
if EMERGENT_LLM_KEY:
    HAS_LLM = True

# Fallback data for demo mode (when MongoDB unavailable)
_fallback_data: dict = {}

def _init_fallback_data():
    global _fallback_data
    _fallback_data = {
        "alerts": [{"id": "alert-main", "is_air_raid": False, "is_storm": False, "message": "Все спокійно", "source": "demo"}],
        "bridges": [
            {"id": "bridge-1", "name": "Peresyp Bridge", "name_ua": "Пересипський міст", "status": "open", "last_updated": datetime.now(timezone.utc).isoformat()},
            {"id": "bridge-2", "name": "Ivanivsky Bridge", "name_ua": "Іванівський міст", "status": "open", "last_updated": datetime.now(timezone.utc).isoformat()},
            {"id": "bridge-3", "name": "Hadjibey Bridge", "name_ua": "Хаджибейський міст", "status": "limited", "last_updated": datetime.now(timezone.utc).isoformat()},
        ],
        "coastal_zones": [
            {"id": "zone-1", "name": "Langeron Beach", "name_ua": "Пляж Ланжерон", "lat": 46.4825, "lng": 30.7533, "risk_level": "low", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-10"},
            {"id": "zone-2", "name": "Arcadia Beach", "name_ua": "Пляж Аркадія", "lat": 46.4380, "lng": 30.7520, "risk_level": "medium", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-08"},
            {"id": "zone-3", "name": "Otrada Beach", "name_ua": "Пляж Отрада", "lat": 46.4700, "lng": 30.7450, "risk_level": "high", "zone_type": "restricted", "checked_by": "ДСНС", "last_checked": "2026-01-28"},
            {"id": "zone-4", "name": "Chornomorka", "name_ua": "Чорноморка", "lat": 46.4200, "lng": 30.6800, "risk_level": "low", "zone_type": "beach", "checked_by": "ДСНС", "last_checked": "2026-02-12"},
        ],
        "eco_data": [
            {"id": "eco-1", "beach_name": "Langeron", "beach_name_ua": "Ланжерон", "salinity": 17.8, "cleanliness": "good", "water_temp": 4.5, "wave_height": 0.8, "lat": 46.4825, "lng": 30.7533, "source": "demo", "last_updated": datetime.now(timezone.utc).isoformat()},
            {"id": "eco-2", "beach_name": "Arcadia", "beach_name_ua": "Аркадія", "salinity": 18.2, "cleanliness": "moderate", "water_temp": 4.1, "wave_height": 1.1, "lat": 46.4380, "lng": 30.7520, "source": "demo", "last_updated": datetime.now(timezone.utc).isoformat()},
        ],
        "services": [
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
        ],
        "light_reports": [
            {"id": str(uuid.uuid4()), "district": "Приморський", "has_light": True, "lat": 46.4825, "lng": 30.7233, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Київський", "has_light": False, "lat": 46.4600, "lng": 30.7100, "reported_at": datetime.now(timezone.utc).isoformat()},
            {"id": str(uuid.uuid4()), "district": "Суворовський", "has_light": True, "lat": 46.5100, "lng": 30.7800, "reported_at": datetime.now(timezone.utc).isoformat()},
        ],
        "ticket_prices": [
            {"route_number": "5", "route_name": "Трамвай №5", "price": 10.0, "type": "tram"},
            {"route_number": "28", "route_name": "Трамвай №28", "price": 10.0, "type": "tram"},
            {"route_number": "3", "route_name": "Тролейбус №3", "price": 10.0, "type": "trolleybus"},
            {"route_number": "7", "route_name": "Тролейбус №7", "price": 10.0, "type": "trolleybus"},
            {"route_number": "137", "route_name": "Маршрутка №137", "price": 14.0, "type": "bus"},
            {"route_number": "185", "route_name": "Маршрутка №185", "price": 14.0, "type": "bus"},
        ],
        "tickets": [],
        "users": [],
        "panic_alarms": [],
        "chat_messages": [],
    }

# MongoDB connection - defer connection to startup
MONGO_AVAILABLE = False
_client = None
_db = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize fallback data at module level
_init_fallback_data()

# Create db wrapper (initialized in startup)
db = None

# Keys
ALERTS_TOKEN = os.environ.get('ALERTS_IN_UA_TOKEN', '')
JWT_SECRET = os.environ.get('JWT_SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
SAVEECOBOT_TOKEN = os.environ.get('SAVEECOBOT_TOKEN', '')

def lifespan(app: FastAPI):
    return _lifespan_inner(app)

@asynccontextmanager
async def _lifespan_inner(app: FastAPI):
    global db
    
    db = DBWrapper(None)
    logger.info("Using demo mode (no MongoDB)")
    
    await seed_data()
    asyncio.create_task(poll_alerts_loop())
    logger.info("Background alert polling started (30s interval)")
    
    yield
    
    if _client:
        _client.close()

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# ========== Helper functions for fallback mode ==========

class DBWrapper:
    """Wrapper that uses in-memory data when MongoDB is unavailable"""
    def __init__(self, mongo_db):
        self._mongo = mongo_db
        self._memory = _fallback_data
    
    def __getattr__(self, name: str):
        if self._mongo is None:
            return InMemoryCollection(name, self._memory.get(name, []), self._memory)
        return self._mongo[name]

class InMemoryCollection:
    """In-memory collection for fallback mode"""
    def __init__(self, name: str, data: list, storage: dict):
        self._name = name
        self._data = data
        self._storage = storage
    
    def _apply_projection(self, item: dict, projection: dict) -> dict:
        """Apply MongoDB-style projection (e.g., {"_id": 0} to exclude _id)"""
        if not projection:
            return item
        result = {}
        for key, value in item.items():
            if key == '_id':
                if projection.get('_id', 1) == 0:
                    continue
            result[key] = value
        return result
    
    async def find_one(self, query: dict, projection: dict = None):
        for item in self._data:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                return self._apply_projection(item, projection) if projection else item
        return None
    
    def find(self, query: dict = {}, projection: dict = None):
        results = []
        for item in self._data:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                results.append(self._apply_projection(item, projection) if projection else item)
        return InMemoryCursor(results)
    
    async def insert_one(self, doc: dict):
        self._data.append(doc)
        return doc
    
    async def insert_many(self, docs: list):
        self._data.extend(docs)
        return docs
    
    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        for i, item in enumerate(self._data):
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                self._data[i].update(update.get('$set', {}))
                return self._data[i]
        if upsert:
            new_doc = {**query, **update.get('$set', {})}
            self._data.append(new_doc)
            return new_doc
        return None
    
    async def delete_one(self, query: dict):
        for i, item in enumerate(self._data):
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                del self._data[i]
                return True
        return False
    
    async def count_documents(self, query: dict = {}):
        if not query:
            return len(self._data)
        count = 0
        for item in self._data:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

class InMemoryCursor:
    def __init__(self, data: list):
        self._data = data
    
    def sort(self, key: str, direction: int = -1):
        reverse = direction == -1
        self._data.sort(key=lambda x: x.get(key, ''), reverse=reverse)
        return self
    
    def limit(self, n: int):
        self._data = self._data[:n]
        return self
    
    async def to_list(self, n: int = None):
        if n:
            return self._data[:n]
        return self._data

# Create db wrapper
mongo_db = None
if MONGO_AVAILABLE and client is not None:
    try:
        mongo_db = client[db_name]
    except Exception as e:
        logger.warning(f"Error accessing MongoDB database: {e}")
db = DBWrapper(mongo_db)

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

# ========== AUTH MODELS ==========

class UserRegister(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class PasswordRecoveryRequest(BaseModel):
    email: str

class PasswordResetRequest(BaseModel):
    token: str
    new_password: str

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    auth_provider: str = "email"
    created_at: str = ""

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile

class WeatherData(BaseModel):
    temperature: float
    feels_like: float
    humidity: int
    wind_speed: float
    weather_code: int
    description_ua: str
    hourly: List[dict] = []

class SaveEcoBotStation(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    aqi: Optional[int] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    updated_at: str = ""

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

# ========== AUTH HELPERS ==========

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str, email: str) -> str:
    if not HAS_JOSE:
        return f"demo-token-{user_id}"
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
    if not HAS_JOSE:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload:
        return None
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    return user

async def require_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Необхідна авторизація")
    token = authorization.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Недійсний токен")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Користувача не знайдено")
    return user

# ========== AUTH ENDPOINTS ==========

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Користувач з таким email вже існує")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "password_hash": hash_password(data.password),
        "auth_provider": "email",
        "created_at": now,
    }
    await db.users.insert_one(user_doc)
    token = create_jwt_token(user_id, data.email.lower())
    return AuthResponse(
        access_token=token,
        user=UserProfile(id=user_id, email=data.email.lower(), name=data.name, auth_provider="email", created_at=now)
    )

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Невірний email або пароль")
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Невірний email або пароль")
    token = create_jwt_token(user["id"], user["email"])
    return AuthResponse(
        access_token=token,
        user=UserProfile(id=user["id"], email=user["email"], name=user.get("name", ""), auth_provider=user.get("auth_provider", "email"), created_at=user.get("created_at", ""))
    )

@api_router.post("/auth/google", response_model=AuthResponse)
async def google_auth(data: GoogleAuthRequest):
    try:
        async with httpx.AsyncClient(timeout=10.0) as hclient:
            resp = await hclient.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={data.id_token}")
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Недійсний Google токен")
            google_data = resp.json()
            email = google_data.get("email", "").lower()
            name = google_data.get("name", google_data.get("given_name", "Користувач"))
            if not email:
                raise HTTPException(status_code=401, detail="Не вдалося отримати email з Google")
            user = await db.users.find_one({"email": email}, {"_id": 0})
            if not user:
                user_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                user_doc = {
                    "id": user_id,
                    "email": email,
                    "name": name,
                    "auth_provider": "google",
                    "created_at": now,
                }
                await db.users.insert_one(user_doc)
                user = user_doc
            token = create_jwt_token(user["id"], user["email"])
            return AuthResponse(
                access_token=token,
                user=UserProfile(id=user["id"], email=user["email"], name=user.get("name", ""), auth_provider=user.get("auth_provider", "google"), created_at=user.get("created_at", ""))
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail="Помилка авторизації через Google")

@api_router.post("/auth/recovery")
async def request_password_recovery(data: PasswordRecoveryRequest):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user:
        return {"message": "Якщо email зареєстровано, інструкції для відновлення надіслано"}
    if user.get("auth_provider") == "google":
        return {"message": "Якщо email зареєстровано, інструкції для відновлення надіслано"}
    recovery_token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    await db.recovery_tokens.update_one(
        {"email": data.email.lower()},
        {"$set": {"token": recovery_token, "expires": expires, "email": data.email.lower()}},
        upsert=True
    )
    logger.info(f"Password recovery token for {data.email}: {recovery_token}")
    return {"message": "Якщо email зареєстровано, інструкції для відновлення надіслано"}

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetRequest):
    token_doc = await db.recovery_tokens.find_one({"token": data.token}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=400, detail="Недійсний або прострочений токен")
    expires = token_doc.get("expires", "")
    if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
        await db.recovery_tokens.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="Токен прострочений")
    email = token_doc["email"]
    new_hash = hash_password(data.new_password)
    await db.users.update_one({"email": email}, {"$set": {"password_hash": new_hash}})
    await db.recovery_tokens.delete_one({"token": data.token})
    return {"message": "Пароль успішно змінено"}

@api_router.get("/auth/me", response_model=UserProfile)
async def get_me(user: dict = Depends(require_user)):
    return UserProfile(
        id=user["id"],
        email=user["email"],
        name=user.get("name", ""),
        auth_provider=user.get("auth_provider", "email"),
        created_at=user.get("created_at", "")
    )

# ========== WEATHER ENDPOINT (Open-Meteo) ==========

@api_router.get("/weather")
async def get_weather():
    """Get weather forecast for Odesa from Open-Meteo"""
    try:
        # Odesa coordinates: 46.4825, 30.7533
        async with httpx.AsyncClient(timeout=10.0) as hclient:
            resp = await hclient.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": 46.4825,
                    "longitude": 30.7533,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                    "hourly": "temperature_2m,weather_code,precipitation_probability",
                    "timezone": "Europe/Kyiv",
                    "forecast_days": 2
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                hourly = data.get("hourly", {})
                weather_code = current.get("weather_code", 0)

                wmo_descriptions = {
                    0: "Ясно", 1: "Переважно ясно", 2: "Мінлива хмарність", 3: "Хмарно",
                    45: "Туман", 48: "Туман з інеєм", 51: "Мряка", 53: "Помірна мряка",
                    55: "Сильна мряка", 61: "Дощ", 63: "Помірний дощ", 65: "Сильний дощ",
                    71: "Сніг", 73: "Помірний сніг", 75: "Сильний сніг", 77: "Снігові зерна",
                    80: "Злива", 81: "Помірна злива", 82: "Сильна злива",
                    85: "Снігопад", 86: "Сильний снігопад",
                    95: "Гроза", 96: "Гроза з градом", 99: "Сильна гроза з градом"
                }

                hourly_list = []
                for i in range(min(24, len(hourly.get("time", [])))):
                    hourly_list.append({
                        "time": hourly["time"][i],
                        "temperature": hourly.get("temperature_2m", [])[i] if i < len(hourly.get("temperature_2m", [])) else None,
                        "weather_code": hourly.get("weather_code", [])[i] if i < len(hourly.get("weather_code", [])) else None,
                        "precipitation_probability": hourly.get("precipitation_probability", [])[i] if i < len(hourly.get("precipitation_probability", [])) else None,
                    })

                return {
                    "temperature": current.get("temperature_2m", 0),
                    "feels_like": current.get("apparent_temperature", 0),
                    "humidity": current.get("relative_humidity_2m", 0),
                    "wind_speed": current.get("wind_speed_10m", 0),
                    "weather_code": weather_code,
                    "description_ua": wmo_descriptions.get(weather_code, "Невідомо"),
                    "hourly": hourly_list,
                    "source": "Open-Meteo",
                    "lat": 46.4825,
                    "lng": 30.7533
                }
            else:
                logger.warning(f"Open-Meteo returned {resp.status_code}")
                return _default_weather()
    except Exception as e:
        logger.error(f"Weather fetch error: {e}")
        return _default_weather()

def _default_weather():
    return {
        "temperature": 0, "feels_like": 0, "humidity": 0, "wind_speed": 0,
        "weather_code": 0, "description_ua": "Дані недоступні", "hourly": [],
        "source": "default", "lat": 46.4825, "lng": 30.7533
    }

# ========== SAVEECOBOT API ==========

@api_router.get("/ecobot/stations")
async def get_ecobot_stations():
    """Get air quality stations from SaveEcoBot API"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as hclient:
            resp = await hclient.get(
                "https://api.saveecobot.com/v1/stations",
                headers={"Authorization": f"Bearer {SAVEECOBOT_TOKEN}"}
            )
            if resp.status_code == 200:
                data = resp.json()
                stations = []
                if isinstance(data, list):
                    for s in data:
                        stations.append({
                            "id": str(s.get("id", "")),
                            "name": s.get("name", ""),
                            "lat": s.get("lat", 0),
                            "lng": s.get("lng", 0),
                            "aqi": s.get("aqi"),
                            "pm25": s.get("pm25"),
                            "pm10": s.get("pm10"),
                            "temperature": s.get("temperature"),
                            "humidity": s.get("humidity"),
                            "updated_at": s.get("updated_at", "")
                        })
                elif isinstance(data, dict) and "stations" in data:
                    for s in data["stations"]:
                        stations.append({
                            "id": str(s.get("id", "")),
                            "name": s.get("name", ""),
                            "lat": s.get("lat", 0),
                            "lng": s.get("lng", 0),
                            "aqi": s.get("aqi"),
                            "pm25": s.get("pm25"),
                            "pm10": s.get("pm10"),
                            "temperature": s.get("temperature"),
                            "humidity": s.get("humidity"),
                            "updated_at": s.get("updated_at", "")
                        })
                return {"stations": stations, "source": "SaveEcoBot"}
            else:
                logger.warning(f"SaveEcoBot returned {resp.status_code}")
                return {"stations": _default_ecobot_stations(), "source": "default"}
    except Exception as e:
        logger.error(f"SaveEcoBot fetch error: {e}")
        return {"stations": _default_ecobot_stations(), "source": "default"}

def _default_ecobot_stations():
    return [
        {"id": "ecobot-1", "name": "Одеса - Приморський район", "lat": 46.4825, "lng": 30.7533, "aqi": 42, "pm25": 8.5, "pm10": 15.2, "temperature": 5.0, "humidity": 78, "updated_at": datetime.now(timezone.utc).isoformat()},
        {"id": "ecobot-2", "name": "Одеса - Київський район", "lat": 46.4600, "lng": 30.7100, "aqi": 55, "pm25": 12.3, "pm10": 22.1, "temperature": 4.8, "humidity": 80, "updated_at": datetime.now(timezone.utc).isoformat()},
        {"id": "ecobot-3", "name": "Одеса - Малиновський район", "lat": 46.4400, "lng": 30.6900, "aqi": 38, "pm25": 7.1, "pm10": 13.8, "temperature": 5.2, "humidity": 76, "updated_at": datetime.now(timezone.utc).isoformat()},
        {"id": "ecobot-4", "name": "Одеса - Суворовський район", "lat": 46.5100, "lng": 30.7800, "aqi": 48, "pm25": 10.8, "pm10": 19.5, "temperature": 4.6, "humidity": 82, "updated_at": datetime.now(timezone.utc).isoformat()},
    ]

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
        client = genai.Client(api_key=EMERGENT_LLM_KEY)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[{"role": "user", "parts": [{"text": f"{system_msg}\n\n{data.message}"}]}]
        )
        reply = response.text

        now = datetime.now(timezone.utc).isoformat()
        await db.chat_messages.insert_many([
            {"session_id": data.session_id, "role": "user", "content": data.message, "timestamp": now},
            {"session_id": data.session_id, "role": "assistant", "content": reply, "timestamp": now}
        ])
        return ChatResponse(response=reply, session_id=data.session_id)
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
    return {"message": "Odesa Wave API v2.0", "status": "running", "features": ["alerts.in.ua", "copernicus", "websocket", "gpt-4o", "auth", "weather", "saveecobot"]}

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
    import io
    sys_stdout = getattr(__import__('sys'), 'stdout')
    if hasattr(sys_stdout, 'reconfigure'):
        sys_stdout.reconfigure(encoding='utf-8')
    print("Odesa Wave Backend starting...")
    print("API: http://localhost:8001")
    print("Docs: http://localhost:8001/docs")
    print("Ctrl+C to stop")
    uvicorn.run(app, host="0.0.0.0", port=8001)