import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';

export default function MapScreen() {
  const { colors, isStorm } = useTheme();
  const [zones, setZones] = useState<any[]>([]);
  const [ecoData, setEcoData] = useState<any[]>([]);
  const [lightReports, setLightReports] = useState<any[]>([]);
  const [activeLayer, setActiveLayer] = useState<'safety' | 'eco' | 'light'>('safety');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [z, e, l] = await Promise.all([
        api.get('/coastal/zones'),
        api.get('/coastal/eco'),
        api.get('/light/reports'),
      ]);
      setZones(z);
      setEcoData(e);
      setLightReports(l);
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

  // Map coordinates to visual positions (Odesa bounding box)
  const latToY = (lat: number) => Math.max(0, Math.min(180, (46.52 - lat) / 0.12 * 180));
  const lngToX = (lng: number) => Math.max(0, Math.min(280, (lng - 30.65) / 0.12 * 280));

  const renderSafetyLayer = () => (
    <View style={styles.layerContent}>
      <Text style={[styles.layerTitle, { color: colors.textPrimary }]}>Узбережжя Одеси</Text>
      <Text style={[styles.layerSubtitle, { color: colors.textSecondary }]}>Статус перевірки ДСНС • Оновлюється щоденно</Text>

      {/* Visual Map */}
      <View style={[styles.mapContainer, { backgroundColor: isStorm ? '#0A1628' : '#E3F2FD', borderColor: colors.border }]}>
        {/* Sea area */}
        <View style={[styles.seaArea, { backgroundColor: isStorm ? '#0D2137' : '#BBDEFB' }]}>
          <Text style={[styles.seaLabel, { color: isStorm ? '#1565C0' : '#1976D2' }]}>ЧОРНЕ МОРЕ</Text>
        </View>
        {/* Coastline */}
        <View style={[styles.coastline, { backgroundColor: isStorm ? '#FFD500' : '#FFC107' }]} />
        {/* Land */}
        <View style={[styles.landArea, { backgroundColor: isStorm ? '#1A2332' : '#E8F5E9' }]}>
          <Text style={[styles.landLabel, { color: isStorm ? '#4CAF50' : '#388E3C' }]}>ОДЕСА</Text>
        </View>
        {/* Zone markers with real coordinates */}
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
        {/* Legend */}
        <View style={styles.mapLegend}>
          {[{ c: '#34C759', l: 'Безпечно' }, { c: '#FF9F0A', l: 'Увага' }, { c: '#FF3B30', l: 'Небезпечно' }].map((i) => (
            <View key={i.l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: i.c }]} />
              <Text style={[styles.legendText, { color: isStorm ? '#A0AEC0' : '#666' }]}>{i.l}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Zone Cards */}
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

        {/* Heatmap */}
        <View style={[styles.heatmapContainer, { backgroundColor: '#0D1117', borderColor: colors.border }]}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((p) => (
            <View key={`h${p}`} style={[styles.gridLine, { top: `${p * 100}%` }]} />
          ))}
          {[0.25, 0.5, 0.75].map((p) => (
            <View key={`v${p}`} style={[styles.gridLineV, { left: `${p * 100}%` }]} />
          ))}
          {/* Light dots with glow */}
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
          {/* Legend */}
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

        {/* Reports list */}
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="map-screen">
      <View style={[styles.layerTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['safety', 'eco', 'light'] as const).map((layer) => (
          <TouchableOpacity
            key={layer}
            testID={`layer-tab-${layer}`}
            onPress={() => setActiveLayer(layer)}
            style={[styles.layerTab, activeLayer === layer && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
          >
            <Ionicons
              name={layer === 'safety' ? 'shield' : layer === 'eco' ? 'water' : 'bulb'}
              size={18}
              color={activeLayer === layer ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.layerTabText, { color: activeLayer === layer ? colors.primary : colors.textSecondary }]}>
              {layer === 'safety' ? 'Безпека' : layer === 'eco' ? 'Еко' : 'Світло'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {activeLayer === 'safety' && renderSafetyLayer()}
        {activeLayer === 'eco' && renderEcoLayer()}
        {activeLayer === 'light' && renderLightLayer()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  layerTabs: { flexDirection: 'row', padding: 12, gap: 8, borderBottomWidth: 1 },
  layerTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
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
});
