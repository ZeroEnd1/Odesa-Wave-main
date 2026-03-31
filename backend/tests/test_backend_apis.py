import pytest
import requests
import os
import time

# Test root and health endpoints
class TestHealthEndpoints:
    """Health check and root endpoint tests"""

    def test_root_endpoint(self, api_client, base_url):
        """Test GET /api/ returns v2.0 with features array"""
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "message" in data
        assert "status" in data
        assert data["status"] == "running"
        
        # V2.0 specific checks
        assert "v2.0" in data["message"], f"Expected 'v2.0' in message, got: {data['message']}"
        assert "features" in data, "Expected 'features' array in response"
        assert isinstance(data["features"], list), "Features should be a list"
        
        # Check for v2.0 features
        features = data["features"]
        assert "alerts.in.ua" in features, f"Expected 'alerts.in.ua' in features, got: {features}"
        assert "copernicus" in features, f"Expected 'copernicus' in features, got: {features}"
        assert "websocket" in features, f"Expected 'websocket' in features, got: {features}"
        assert "gpt-4o" in features, f"Expected 'gpt-4o' in features, got: {features}"
        
        print(f"✓ Root endpoint v2.0 working: {data['message']}, features: {features}")

    def test_health_endpoint(self, api_client, base_url):
        """Test GET /api/health"""
        response = api_client.get(f"{base_url}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✓ Health endpoint working")

# Test dashboard endpoint
class TestDashboard:
    """Dashboard endpoint tests"""

    def test_dashboard_returns_widgets(self, api_client, base_url):
        """Test GET /api/dashboard returns widgets array with v2.0 fields"""
        response = api_client.get(f"{base_url}/api/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "widgets" in data
        assert isinstance(data["widgets"], list)
        assert len(data["widgets"]) >= 4, "Expected at least 4 widgets"
        
        # Check widget types
        widget_types = [w["widget_type"] for w in data["widgets"]]
        assert "transport" in widget_types
        assert "eco" in widget_types
        assert "light" in widget_types
        assert "safety" in widget_types
        
        # V2.0 specific checks
        assert "alert_source" in data, "Expected 'alert_source' field in dashboard response"
        assert "has_live_alerts" in data, "Expected 'has_live_alerts' field in dashboard response"
        assert isinstance(data["has_live_alerts"], bool), "has_live_alerts should be boolean"
        
        print(f"✓ Dashboard has {len(data['widgets'])} widgets: {widget_types}")
        print(f"✓ Dashboard v2.0 fields: alert_source={data['alert_source']}, has_live_alerts={data['has_live_alerts']}")

# Test alert endpoints
class TestAlerts:
    """Alert status and toggle tests"""

    def test_get_alert_status(self, api_client, base_url):
        """Test GET /api/alerts returns alert status"""
        response = api_client.get(f"{base_url}/api/alerts")
        assert response.status_code == 200
        data = response.json()
        assert "is_air_raid" in data
        assert "is_storm" in data
        assert "message" in data
        assert isinstance(data["is_air_raid"], bool)
        assert isinstance(data["is_storm"], bool)
        print(f"✓ Alert status: air_raid={data['is_air_raid']}, storm={data['is_storm']}")

    def test_toggle_alert_storm_mode(self, api_client, base_url):
        """Test POST /api/alerts/toggle toggles storm mode"""
        # Toggle storm on
        response = api_client.post(f"{base_url}/api/alerts/toggle", json={"is_storm": True})
        assert response.status_code == 200
        data = response.json()
        assert data["is_storm"] == True
        print("✓ Storm mode toggled ON")
        
        # Verify with GET
        get_response = api_client.get(f"{base_url}/api/alerts")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["is_storm"] == True
        print("✓ Storm mode verified via GET")
        
        # Toggle storm off
        response = api_client.post(f"{base_url}/api/alerts/toggle", json={"is_storm": False})
        assert response.status_code == 200
        data = response.json()
        assert data["is_storm"] == False
        print("✓ Storm mode toggled OFF")
    
    def test_toggle_alert_syncs_air_raid_and_storm(self, api_client, base_url):
        """Test POST /api/alerts/toggle syncs is_air_raid and is_storm together (v2.0)"""
        # When is_air_raid is set to True, is_storm should also be True
        response = api_client.post(f"{base_url}/api/alerts/toggle", json={"is_air_raid": True})
        assert response.status_code == 200
        data = response.json()
        assert data["is_air_raid"] == True, "is_air_raid should be True"
        assert data["is_storm"] == True, "is_storm should be synced to True when is_air_raid is True"
        print("✓ is_air_raid=True syncs is_storm=True")
        
        # Verify with GET
        get_response = api_client.get(f"{base_url}/api/alerts")
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["is_air_raid"] == True
        assert get_data["is_storm"] == True
        print("✓ Sync verified via GET")
        
        # Toggle air_raid off
        response = api_client.post(f"{base_url}/api/alerts/toggle", json={"is_air_raid": False})
        assert response.status_code == 200
        data = response.json()
        assert data["is_air_raid"] == False
        assert data["is_storm"] == False, "is_storm should be synced to False when is_air_raid is False"
        print("✓ is_air_raid=False syncs is_storm=False")
    
    def test_get_live_alert_status(self, api_client, base_url):
        """Test GET /api/alerts/live returns live alert status (v2.0)"""
        response = api_client.get(f"{base_url}/api/alerts/live")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "alerts_api" in data, "Expected 'alerts_api' field"
        assert "current_status" in data, "Expected 'current_status' field"
        assert "has_live_connection" in data, "Expected 'has_live_connection' field"
        
        # Check alerts_api structure
        alerts_api = data["alerts_api"]
        assert "live" in alerts_api, "Expected 'live' field in alerts_api"
        assert "source" in alerts_api, "Expected 'source' field in alerts_api"
        
        # Check has_live_connection is boolean
        assert isinstance(data["has_live_connection"], bool), "has_live_connection should be boolean"
        
        print(f"✓ Live alert status: has_live_connection={data['has_live_connection']}, source={alerts_api.get('source')}")
        print(f"✓ alerts_api status: {alerts_api}")

# Test transport endpoints
class TestTransport:
    """Transport routes, tickets, and bridges tests"""

    def test_get_routes(self, api_client, base_url):
        """Test GET /api/transport/routes returns 6 routes"""
        response = api_client.get(f"{base_url}/api/transport/routes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 6, f"Expected 6 routes, got {len(data)}"
        
        # Verify route structure
        for route in data:
            assert "route_number" in route
            assert "route_name" in route
            assert "price" in route
            assert "type" in route
        print(f"✓ Found {len(data)} transport routes")

    def test_buy_ticket_and_verify(self, api_client, base_url):
        """Test POST /api/transport/ticket creates ticket with QR data"""
        ticket_data = {
            "route_name": "Трамвай №5",
            "route_number": "5",
            "ticket_type": "single"
        }
        response = api_client.post(f"{base_url}/api/transport/ticket", json=ticket_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify ticket structure
        assert "id" in data
        assert "qr_data" in data
        assert "price" in data
        assert data["route_name"] == ticket_data["route_name"]
        assert data["route_number"] == ticket_data["route_number"]
        assert data["qr_data"].startswith("ODESA-WAVE-")
        print(f"✓ Ticket created: {data['qr_data']}, price: {data['price']} грн")
        
        # Verify ticket appears in list
        tickets_response = api_client.get(f"{base_url}/api/transport/tickets")
        assert tickets_response.status_code == 200
        tickets = tickets_response.json()
        assert len(tickets) > 0
        ticket_ids = [t["id"] for t in tickets]
        assert data["id"] in ticket_ids
        print(f"✓ Ticket verified in tickets list ({len(tickets)} total tickets)")

    def test_get_bridges(self, api_client, base_url):
        """Test GET /api/transport/bridges returns bridge statuses"""
        response = api_client.get(f"{base_url}/api/transport/bridges")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3, f"Expected at least 3 bridges, got {len(data)}"
        
        # Verify bridge structure
        for bridge in data:
            assert "id" in bridge
            assert "name_ua" in bridge
            assert "status" in bridge
            assert bridge["status"] in ["open", "limited", "closed"]
        print(f"✓ Found {len(data)} bridges")

# Test coastal safety endpoints
class TestCoastalSafety:
    """Coastal zones and eco monitoring tests"""

    def test_get_coastal_zones(self, api_client, base_url):
        """Test GET /api/coastal/zones returns coastal zones"""
        response = api_client.get(f"{base_url}/api/coastal/zones")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5, f"Expected at least 5 zones, got {len(data)}"
        
        # Verify zone structure
        for zone in data:
            assert "id" in zone
            assert "name_ua" in zone
            assert "risk_level" in zone
            assert "zone_type" in zone
            assert zone["risk_level"] in ["low", "medium", "high"]
        print(f"✓ Found {len(data)} coastal zones")

    def test_get_eco_data(self, api_client, base_url):
        """Test GET /api/coastal/eco returns eco monitoring data with Copernicus Marine source (v2.0)"""
        response = api_client.get(f"{base_url}/api/coastal/eco")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3, f"Expected at least 3 eco records, got {len(data)}"
        
        # Verify eco data structure
        for eco in data:
            assert "beach_name_ua" in eco
            assert "salinity" in eco
            assert "cleanliness" in eco
            assert "water_temp" in eco
            assert isinstance(eco["salinity"], (int, float))
            assert isinstance(eco["water_temp"], (int, float))
            
            # V2.0 Copernicus Marine specific checks
            assert "source" in eco, f"Expected 'source' field in eco data for {eco.get('beach_name_ua')}"
            assert "Copernicus Marine" in eco["source"], f"Expected 'Copernicus Marine' in source, got: {eco['source']}"
            assert "wave_height" in eco, f"Expected 'wave_height' field in eco data"
            assert isinstance(eco["wave_height"], (int, float)), "wave_height should be numeric"
            assert "lat" in eco, f"Expected 'lat' field in eco data"
            assert "lng" in eco, f"Expected 'lng' field in eco data"
            assert isinstance(eco["lat"], (int, float)), "lat should be numeric"
            assert isinstance(eco["lng"], (int, float)), "lng should be numeric"
        
        print(f"✓ Found {len(data)} eco monitoring records with Copernicus Marine data")
        print(f"✓ Sample eco data: {data[0]['beach_name_ua']} - wave_height={data[0]['wave_height']}m, source={data[0]['source'][:30]}...")

# Test light reporting endpoints
class TestLightReporting:
    """Where's Light crowdsourcing tests"""

    def test_create_light_report_and_verify(self, api_client, base_url):
        """Test POST /api/light/report creates light report"""
        report_data = {
            "district": "TEST_Приморський",
            "has_light": True,
            "lat": 46.4825,
            "lng": 30.7233
        }
        response = api_client.post(f"{base_url}/api/light/report", json=report_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify report structure
        assert "id" in data
        assert data["district"] == report_data["district"]
        assert data["has_light"] == report_data["has_light"]
        print(f"✓ Light report created: {data['district']}, has_light={data['has_light']}")
        
        # Verify report appears in list
        reports_response = api_client.get(f"{base_url}/api/light/reports")
        assert reports_response.status_code == 200
        reports = reports_response.json()
        report_ids = [r["id"] for r in reports]
        assert data["id"] in report_ids
        print(f"✓ Light report verified in reports list ({len(reports)} total reports)")

    def test_get_light_reports(self, api_client, base_url):
        """Test GET /api/light/reports returns light reports"""
        response = api_client.get(f"{base_url}/api/light/reports")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Found {len(data)} light reports")

    def test_get_light_summary(self, api_client, base_url):
        """Test GET /api/light/summary returns district-level summary"""
        response = api_client.get(f"{base_url}/api/light/summary")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 4, f"Expected at least 4 districts, got {len(data)}"
        
        # Verify summary structure
        for district in data:
            assert "district" in district
            assert "total_reports" in district
            assert "with_light" in district
            assert "light_percentage" in district
            assert isinstance(district["light_percentage"], (int, float))
        print(f"✓ Light summary for {len(data)} districts")

# Test panic alarm endpoint
class TestPanicAlarm:
    """SentryNode panic alarm tests"""

    def test_trigger_panic_alarm(self, api_client, base_url):
        """Test POST /api/sentry/panic creates panic alarm and broadcasts via WebSocket (v2.0)"""
        panic_data = {
            "district": "TEST_Приморський",
            "address": "TEST_вул. Дерибасівська, 1",
            "message": "Test panic alarm"
        }
        response = api_client.post(f"{base_url}/api/sentry/panic", json=panic_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify panic alarm structure
        assert "id" in data
        assert data["district"] == panic_data["district"]
        assert data["address"] == panic_data["address"]
        assert "triggered_at" in data
        print(f"✓ Panic alarm triggered: {data['address']}")
        print(f"✓ Panic alarm ID: {data['id']} (broadcasts to WebSocket clients)")
    
    def test_get_ws_status(self, api_client, base_url):
        """Test GET /api/sentry/ws-status returns WebSocket connection count (v2.0)"""
        response = api_client.get(f"{base_url}/api/sentry/ws-status")
        assert response.status_code == 200
        data = response.json()
        
        # Verify ws-status structure
        assert "connected_clients" in data, "Expected 'connected_clients' field"
        assert isinstance(data["connected_clients"], int), "connected_clients should be integer"
        assert data["connected_clients"] >= 0, "connected_clients should be non-negative"
        
        print(f"✓ WebSocket status: {data['connected_clients']} connected clients")

# Test services endpoint
class TestServices:
    """Municipal services tests"""

    def test_get_services(self, api_client, base_url):
        """Test GET /api/services returns 15 services"""
        response = api_client.get(f"{base_url}/api/services")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 15, f"Expected 15 services, got {len(data)}"
        
        # Verify service structure
        for service in data:
            assert "id" in service
            assert "name_ua" in service
            assert "category" in service
            assert "category_ua" in service
            assert "description_ua" in service
            assert "icon" in service
        print(f"✓ Found {len(data)} municipal services")

# Test chatbot endpoint
class TestChatbot:
    """Uncle Zhora chatbot tests (GPT-4o - v2.0)"""

    def test_chat_with_uncle_zhora(self, api_client, base_url):
        """Test POST /api/chat sends message to Uncle Zhora using GPT-4o (v2.0)"""
        chat_data = {
            "session_id": "test-session-" + str(int(time.time())),
            "message": "Привіт! Як справи?"
        }
        response = api_client.post(f"{base_url}/api/chat", json=chat_data)
        assert response.status_code == 200
        data = response.json()
        
        # Verify chat response structure
        assert "response" in data
        assert "session_id" in data
        assert data["session_id"] == chat_data["session_id"]
        assert len(data["response"]) > 0
        print(f"✓ Uncle Zhora (GPT-4o) responded: {data['response'][:100]}...")
