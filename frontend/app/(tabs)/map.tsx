import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch {}
}

export default function MapScreen() {
  const { colors, isStorm } = useTheme();
  const [zones, setZones] = useState<any[]>([]);
  const [ecoData, setEcoData] = useState<any[]>([]);
  const [lightReports, setLightReports] = useState<any[]>([]);
  const [ecoBotStations, setEcoBotStations] = useState<any[]>([]);
  const [activeLayer, setActiveLayer] = useState<'safety' | 'eco' | 'light' | 'air' | 'osm'>('safety');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const webViewRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [z, e, l, eb] = await Promise.all([
        api.get('/coastal/zones', false).catch(() => []),
        api.get('/coastal/eco', true).catch(() => []),
        api.get('/light/reports', true).catch(() => []),
        api.get('/ecobot/stations', true).catch(() => ({ stations: [] })),
      ]);
      setZones(Array.isArray(z) ? z : []);
      setEcoData(Array.isArray(e) ? e : []);
      setLightReports(Array.isArray(l) ? l : []);
      setEcoBotStations(eb?.stations || []);
    } catch (err) {
      console.error('Map data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return '#FF3B30';
      case 'medium': return '#FF9F0A';
      case 'low': return '#34C759';
      default: return '#888';
    }
  };

  const getAqiColor = (aqi: number | null) => {
    if (!aqi) return '#888';
    if (aqi <= 50) return '#34C759';
    if (aqi <= 100) return '#FF9F0A';
    if (aqi <= 150) return '#FF6B35';
    return '#FF3B30';
  };

  const getAqiLabel = (aqi: number | null) => {
    if (!aqi) return 'Невідомо';
    if (aqi <= 50) return 'Добре';
    if (aqi <= 100) return 'Помірне';
    if (aqi <= 150) return 'Нездорове';
    return 'Небезпечне';
  };

  const latToY = (lat: number) => Math.max(0, Math.min(180, (46.52 - lat) / 0.12 * 180));
  const lngToX = (lng: number) => Math.max(0, Math.min(280, (lng - 30.65) / 0.12 * 280));

  const getLeafletHtml = () => {
    const zoneMarkers = zones.map(z => {
      const color = getRiskColor(z.risk_level);
      return `L.circleMarker([${z.lat}, ${z.lng}], {radius: 10, color: '${color}', fillColor: '${color}', fillOpacity: 0.6, weight: 2})
        .bindPopup('<b>${z.name_ua}</b><br>${z.zone_type === 'restricted' ? 'Заборонена зона' : 'Пляж'}<br>Ризик: ${z.risk_level}');`;
    }).join('\n');

    const ecoMarkers = ecoData.map(e => {
      return `L.marker([${e.lat || 46.4825}, ${e.lng || 30.7533}], {icon: L.divIcon({className: 'eco-icon', html: '<div style="background:#0EA5E9;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">${e.water_temp}°</div>'})})
        .bindPopup('<b>${e.beach_name_ua}</b><br>Темп: ${e.water_temp}°C<br>Солоність: ${e.salinity}‰');`;
    }).join('\n');

    const lightMarkers = lightReports.slice(0, 50).map((r: any) => {
      const color = r.has_light ? '#FFD500' : '#FF3B30';
      return `L.circleMarker([${r.lat}, ${r.lng}], {radius: 6, color: '${color}', fillColor: '${color}', fillOpacity: 0.8, weight: 1})
        .bindPopup('${r.district}: ${r.has_light ? 'Є світло' : 'Немає світла'}');`;
    }).join('\n');

    const airMarkers = ecoBotStations.map((s: any) => {
      const color = getAqiColor(s.aqi);
      return `L.marker([${s.lat}, ${s.lng}], {icon: L.divIcon({className: 'air-icon', html: '<div style="background:${color};color:#fff;border-radius:8px;padding:3px 6px;font-size:10px;font-weight:bold;white-space:nowrap;">AQI ${s.aqi || '—'}</div>'})})
        .bindPopup('<b>${s.name}</b><br>AQI: ${s.aqi || '—'}<br>PM2.5: ${s.pm25 || '—'} μg/m³<br>PM10: ${s.pm10 || '—'} μg/m³');`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; }
  html, body, #map { width: 100%; height: 100%; }
  .eco-icon, .air-icon { background: transparent !important; border: none !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true }).setView([46.4825, 30.7533], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  // Safety markers
  ${zoneMarkers}

  // Eco markers
  ${ecoMarkers}

  // Light markers
  ${lightMarkers}

  // Air quality markers
  ${airMarkers}

  // Layer groups
  var safetyGroup = L.layerGroup([${zones.map((_, i) => `safety${i}`).join(',')}]).addTo(map);
</script>
</body>
</html>`;
  };

  const renderSafetyLayer = () => (
    <View style={styles.layerContent}>
      <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>Узбережжя Одеси</Text>
      <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>Статус перевірки ДСНС • Оновлюється щоденно</Text>

      {/* Visual Map */}
      <View style={[styles.mapContainer, { backgroundColor: isStorm ? '#0A1628' : '#E3F2FD', borderColor: colors.border }]}>
        <View style={[styles.seaArea, { backgroundColor: isStorm ? '#0D2137' : '#BBDEFB' }]}>
          <Text style={[styles.seaLabel, { color: isStorm ? '#1565C0' : '#1976D2' }]}>ЧОРНЕ МОРЕ</Text>
        </View>
        <View style={[styles.coastline, { backgroundColor: isStorm ? '#FFD500' : '#FFC107' }]} />
        <View style={[styles.landArea, { backgroundColor: isStorm ? '#1A2332' : '#E8F5E9' }]}>
          <Text style={[styles.landLabel, { color: isStorm ? '#4CAF50' : '#388E3C' }]}>ОДЕСА</Text>
        </View>
        {zones.map((z) => (
          <View
            key={z.id}
            style={[
              styles.zoneMarker,
              {
                backgroundColor: getRiskColor(z.risk_level) + '30',
                borderColor: getRiskColor(z.risk_level),
                top: latToY(z.lat),
                left: lngToX(z.lng),
              }
            ]}
          >
            <View style={[styles.zonePulse, { backgroundColor: getRiskColor(z.risk_level) }]} />
          </View>
        ))}
        <View style={styles.mapLegend}>
          {[{ c: '#34C759', l: 'Безпечно' }, { c: '#FF9F0A', l: 'Увага' }, { c: '#FF3B30', l: 'Небезпечно' }].map((i) => (
            <View key={i.l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: i.c }]} />
              <Text style={[styles.legendText, { color: isStorm ? '#A0AEC0' : '#666' }]}>{i.l}</Text>
            </View>
          ))}
        </View>
      </View>

      {zones.map((z) => (
        <View key={z.id} testID={`zone-${z.id}`} style={[styles.zoneCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.riskIndicator, { backgroundColor: getRiskColor(z.risk_level) }]} />
          <View style={styles.zoneInfo}>
            <Text style={[styles.zoneName, { color: colors.textPrimary }]}>{z.name_ua}</Text>
            <Text style={[styles.zoneDetail, { color: colors.textSecondary }]}>
              {z.zone_type === 'restricted' ? '🚫 Заборонена зона' : '🏖 Пляж'} • {z.checked_by} • {z.last_checked}
            </Text>
            <Text style={[styles.zoneCoords, { color: colors.textSecondary }]}>
              📍 {z.lat.toFixed(4)}°N, {z.lng.toFixed(4)}°E
            </Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: getRiskColor(z.risk_level) + '15' }]}>
            <Text style={[styles.riskText, { color: getRiskColor(z.risk_level) }]}>
              {z.risk_level === 'high' ? 'Високий' : z.risk_level === 'medium' ? 'Середній' : 'Низький'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderEcoLayer = () => (
    <View style={styles.layerContent}>
      <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>Еко-моніторинг</Text>
      <View style={styles.sourceRow}>
        <Ionicons name="globe" size={14} color={colors.textSecondary} />
        <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>
          Copernicus Marine BLKSEA_PHY_007_001
        </Text>
      </View>

      {ecoData.map((e) => (
        <View key={e.id} testID={`eco-${e.id}`} style={[styles.ecoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.ecoHeader}>
            <Ionicons name="water" size={20} color="#0EA5E9" />
            <Text style={[styles.ecoTitle, { color: colors.textPrimary }]}>{e.beach_name_ua}</Text>
            {e.source && <Text style={[styles.sourceSmall, { color: colors.textSecondary }]}>📡</Text>}
          </View>
          {e.lat && (
            <Text style={[styles.ecoCoords, { color: colors.textSecondary }]}>
              {e.lat?.toFixed(4)}°N, {e.lng?.toFixed(4)}°E
            </Text>
          )}
          <View style={styles.ecoStats}>
            <View style={styles.ecoStat}>
              <Ionicons name="thermometer" size={18} color="#FF6B35" />
              <Text style={[styles.ecoStatValue, { color: colors.primary }]}>{e.water_temp}°C</Text>
              <Text style={[styles.ecoStatLabel, { color: colors.textSecondary }]}>Темп.</Text>
            </View>
            <View style={styles.ecoStat}>
              <Ionicons name="beaker" size={18} color="#8B5CF6" />
              <Text style={[styles.ecoStatValue, { color: colors.primary }]}>{e.salinity}‰</Text>
              <Text style={[styles.ecoStatLabel, { color: colors.textSecondary }]}>Солоність</Text>
            </View>
            {e.wave_height !== undefined && e.wave_height > 0 && (
              <View style={styles.ecoStat}>
                <Ionicons name="water" size={18} color="#0EA5E9" />
                <Text style={[styles.ecoStatValue, { color: colors.primary }]}>{e.wave_height}м</Text>
                <Text style={[styles.ecoStatLabel, { color: colors.textSecondary }]}>Хвилі</Text>
              </View>
            )}
            <View style={styles.ecoStat}>
              <View style={[styles.cleanlinessBadge, { backgroundColor: e.cleanliness === 'good' ? '#34C759' + '20' : '#FF9F0A' + '20' }]}>
                <Text style={{ color: e.cleanliness === 'good' ? '#34C759' : '#FF9F0A', fontSize: 12, fontWeight: '600' }}>
                  {e.cleanliness === 'good' ? '✓ Чисто' : '⚠ Помірно'}
                </Text>
              </View>
              <Text style={[styles.ecoStatLabel, { color: colors.textSecondary }]}>Чистота</Text>
            </View>
          </View>
        </View>
      ))}

      <View style={[styles.attributionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
        <Text style={[styles.attributionText, { color: colors.textSecondary }]}>
          Дані: Copernicus Marine Environment Monitoring Service (CMEMS). Модель: BLKSEA_ANALYSISFORECAST_PHY_007_001.
        </Text>
      </View>
    </View>
  );

  const renderLightLayer = () => {
    const withLight = lightReports.filter(r => r.has_light).length;
    const total = lightReports.length;
    const pct = total > 0 ? Math.round(withLight / total * 100) : 0;

    return (
      <View style={styles.layerContent}>
        <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>Де Світло</Text>
        <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>Краудсорсингова карта • {total} звітів</Text>

        <View style={[styles.heatmapContainer, { backgroundColor: '#0D1117', borderColor: colors.border }]}>
          {[0.25, 0.5, 0.75].map((p) => (
            <View key={`h${p}`} style={[styles.gridLine, { top: `${p * 100}%` }]} />
          ))}
          {[0.25, 0.5, 0.75].map((p) => (
            <View key={`v${p}`} style={[styles.gridLineV, { left: `${p * 100}%` }]} />
          ))}
          {lightReports.map((r, i) => (
            <View
              key={r.id || i}
              style={[
                styles.lightDot,
                {
                  backgroundColor: r.has_light ? '#FFD500' : '#FF3B30',
                  opacity: r.has_light ? 0.95 : 0.6,
                  top: latToY(r.lat),
                  left: lngToX(r.lng),
                  width: r.has_light ? 28 : 18,
                  height: r.has_light ? 28 : 18,
                  borderRadius: r.has_light ? 14 : 9,
                  shadowColor: r.has_light ? '#FFD500' : '#FF3B30',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: r.has_light ? 15 : 8,
                }
              ]}
            />
          ))}
          <View style={styles.heatmapOverlay}>
            <Text style={styles.heatmapPct}>{pct}%</Text>
            <Text style={styles.heatmapLabel}>міста зі світлом</Text>
          </View>
          <View style={styles.heatmapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFD500' }]} />
              <Text style={{ color: '#A0AEC0', fontSize: 10 }}>Є світло</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={{ color: '#A0AEC0', fontSize: 10 }}>Немає</Text>
            </View>
          </View>
        </View>

        {lightReports.map((r, i) => (
          <View key={r.id || i} testID={`light-report-${i}`} style={[styles.lightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={r.has_light ? 'bulb' : 'bulb-outline'} size={22} color={r.has_light ? '#FFD500' : '#888'} />
            <View style={styles.lightInfo}>
              <Text style={[styles.lightDistrict, { color: colors.textPrimary }]}>{r.district}</Text>
              <Text style={[styles.lightCoords, { color: colors.textSecondary }]}>
                {r.lat?.toFixed(3)}°N, {r.lng?.toFixed(3)}°E
              </Text>
            </View>
            <View style={[styles.lightStatusBadge, { backgroundColor: r.has_light ? '#34C759' + '15' : '#FF3B30' + '15' }]}>
              <Text style={{ color: r.has_light ? '#34C759' : '#FF3B30', fontSize: 12, fontWeight: '600' }}>
                {r.has_light ? 'Є' : 'Немає'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderAirLayer = () => (
    <View style={styles.layerContent}>
      <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>Якість повітря</Text>
      <View style={styles.sourceRow}>
        <Ionicons name="leaf" size={14} color={colors.textSecondary} />
        <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>
          SaveEcoBot • PM2.5 / PM10 / AQI
        </Text>
      </View>

      {ecoBotStations.map((s: any) => (
        <View key={s.id} style={[styles.airCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.airIndicator, { backgroundColor: getAqiColor(s.aqi) }]} />
          <View style={styles.airInfo}>
            <Text style={[styles.airName, { color: colors.textPrimary }]}>{s.name}</Text>
            <Text style={[styles.airCoords, { color: colors.textSecondary }]}>
              {s.lat?.toFixed(4)}°N, {s.lng?.toFixed(4)}°E
            </Text>
            <View style={styles.airStats}>
              {s.pm25 !== null && s.pm25 !== undefined && (
                <View style={styles.airStat}>
                  <Text style={[styles.airStatValue, { color: colors.primary }]}>{s.pm25}</Text>
                  <Text style={[styles.airStatLabel, { color: colors.textSecondary }]}>PM2.5</Text>
                </View>
              )}
              {s.pm10 !== null && s.pm10 !== undefined && (
                <View style={styles.airStat}>
                  <Text style={[styles.airStatValue, { color: colors.primary }]}>{s.pm10}</Text>
                  <Text style={[styles.airStatLabel, { color: colors.textSecondary }]}>PM10</Text>
                </View>
              )}
            </View>
          </View>
          <View style={[styles.aqiBadge, { backgroundColor: getAqiColor(s.aqi) + '15' }]}>
            <Text style={[styles.aqiValue, { color: getAqiColor(s.aqi) }]}>{s.aqi || '—'}</Text>
            <Text style={[styles.aqiLabel, { color: getAqiColor(s.aqi) }]}>{getAqiLabel(s.aqi)}</Text>
          </View>
        </View>
      ))}

      <View style={[styles.attributionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
        <Text style={[styles.attributionText, { color: colors.textSecondary }]}>
          Дані: SaveEcoBot API. Індекс якості повітря (AQI) розраховується на основі концентрації забруднюючих речовин.
        </Text>
      </View>
    </View>
  );

  const renderOSMLayer = () => {
    const html = getLeafletHtml();

    return (
      <View style={styles.layerContent}>
        <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>OpenStreetMap</Text>
        <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>Інтерактивна карта Одеси</Text>
        <View style={[styles.osmContainer, { borderColor: colors.border }]}>
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={html}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="OpenStreetMap"
            />
          ) : WebView ? (
            <WebView
              ref={webViewRef}
              source={{ html }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
            />
          ) : (
            <View style={[styles.webViewLoading, { position: 'relative' }]}>
              <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>react-native-webview не встановлено</Text>
            </View>
          )}
        </View>
        <View style={[styles.osmLegend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.osmLegendTitle, { color: colors.textPrimary }]}>Шари на карті:</Text>
          <View style={styles.osmLegendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={[styles.osmLegendText, { color: colors.textSecondary }]}>Зони безпеки</Text>
          </View>
          <View style={styles.osmLegendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#0EA5E9' }]} />
            <Text style={[styles.osmLegendText, { color: colors.textSecondary }]}>Еко-дані (температура води)</Text>
          </View>
          <View style={styles.osmLegendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#FFD500' }]} />
            <Text style={[styles.osmLegendText, { color: colors.textSecondary }]}>Освітлення</Text>
          </View>
          <View style={styles.osmLegendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
            <Text style={[styles.osmLegendText, { color: colors.textSecondary }]}>Станції якості повітря</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const layers = [
    { key: 'safety', icon: 'shield', label: 'Безпека' },
    { key: 'eco', icon: 'water', label: 'Еко' },
    { key: 'light', icon: 'bulb', label: 'Світло' },
    { key: 'air', icon: 'leaf', label: 'Повітря' },
    { key: 'osm', icon: 'map', label: 'Карта' },
  ] as const;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="map-screen">
      <View style={[styles.layerTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {layers.map((layer) => (
            <TouchableOpacity
              key={layer.key}
              testID={`layer-tab-${layer.key}`}
              onPress={() => setActiveLayer(layer.key)}
              style={[styles.layerTab, activeLayer === layer.key && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
            >
              <Ionicons
                name={layer.icon}
                size={18}
                color={activeLayer === layer.key ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.layerTabText, { color: activeLayer === layer.key ? colors.primary : colors.textSecondary }]}>
                {layer.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {activeLayer === 'safety' && renderSafetyLayer()}
        {activeLayer === 'eco' && renderEcoLayer()}
        {activeLayer === 'light' && renderLightLayer()}
        {activeLayer === 'air' && renderAirLayer()}
        {activeLayer === 'osm' && renderOSMLayer()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  layerTabs: { flexDirection: 'row', padding: 12, borderBottomWidth: 1 },
  tabsScroll: { gap: 8, paddingRight: 16 },
  layerTab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  layerTabText: { fontSize: 14, fontWeight: '600' },
  layerContent: { gap: 12 },
  layerTitle: { fontSize: 24, fontWeight: '800' },
  layerSubtitle: { fontSize: 14, marginBottom: 4 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  // Map
  mapContainer: { height: 220, borderRadius: 20, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  seaArea: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', justifyContent: 'center', alignItems: 'center' },
  seaLabel: { fontSize: 14, fontWeight: '800', opacity: 0.3, letterSpacing: 4 },
  coastline: { position: 'absolute', top: '48%', left: 0, right: 0, height: 4, opacity: 0.7 },
  landArea: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '48%', justifyContent: 'center', alignItems: 'center' },
  landLabel: { fontSize: 12, fontWeight: '700', opacity: 0.3, letterSpacing: 3 },
  zoneMarker: { position: 'absolute', width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  zonePulse: { width: 10, height: 10, borderRadius: 5 },
  mapLegend: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10 },
  // Zones
  zoneCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1 },
  riskIndicator: { width: 4, height: 48, borderRadius: 2, marginRight: 14 },
  zoneInfo: { flex: 1 },
  zoneName: { fontSize: 16, fontWeight: '600' },
  zoneDetail: { fontSize: 12, marginTop: 3 },
  zoneCoords: { fontSize: 10, marginTop: 2, fontFamily: 'monospace' },
  riskBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  riskText: { fontSize: 12, fontWeight: '700' },
  // Eco
  ecoCard: { padding: 18, borderRadius: 18, borderWidth: 1 },
  ecoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ecoTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  ecoCoords: { fontSize: 10, marginBottom: 12, fontFamily: 'monospace' },
  sourceSmall: { fontSize: 14 },
  ecoStats: { flexDirection: 'row', justifyContent: 'space-around' },
  ecoStat: { alignItems: 'center', gap: 4 },
  ecoStatValue: { fontSize: 20, fontWeight: '800' },
  ecoStatLabel: { fontSize: 11 },
  cleanlinessBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  attributionCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  attributionText: { fontSize: 11, flex: 1, lineHeight: 16 },
  // Heatmap
  heatmapContainer: { height: 220, borderRadius: 20, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  lightDot: { position: 'absolute' },
  heatmapOverlay: { position: 'absolute', bottom: 16, right: 16, alignItems: 'flex-end' },
  heatmapPct: { color: '#FFD500', fontSize: 32, fontWeight: '900' },
  heatmapLabel: { color: '#A0AEC0', fontSize: 12 },
  heatmapLegend: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  // Light
  lightCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  lightInfo: { flex: 1 },
  lightDistrict: { fontSize: 15, fontWeight: '600' },
  lightCoords: { fontSize: 10, marginTop: 2, fontFamily: 'monospace' },
  lightStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  // Air quality
  airCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1 },
  airIndicator: { width: 4, height: 48, borderRadius: 2, marginRight: 14 },
  airInfo: { flex: 1 },
  airName: { fontSize: 14, fontWeight: '600' },
  airCoords: { fontSize: 10, marginTop: 2, fontFamily: 'monospace' },
  airStats: { flexDirection: 'row', gap: 16, marginTop: 6 },
  airStat: { alignItems: 'center' },
  airStatValue: { fontSize: 16, fontWeight: '700' },
  airStatLabel: { fontSize: 10 },
  aqiBadge: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  aqiValue: { fontSize: 18, fontWeight: '800' },
  aqiLabel: { fontSize: 10, fontWeight: '600' },
  // OSM
  osmContainer: { height: 350, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  webView: { flex: 1 },
  webViewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  osmLegend: { padding: 16, borderRadius: 16, borderWidth: 1 },
  osmLegendTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  osmLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  osmLegendText: { fontSize: 12 },
});
