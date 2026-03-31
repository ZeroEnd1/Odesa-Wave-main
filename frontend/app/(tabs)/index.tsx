import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';
import { useRouter } from 'expo-router';

interface Widget {
  id: string;
  title: string;
  widget_type: string;
  priority: number;
  data: any;
}

export default function HomeScreen() {
  const { colors, isStorm, toggleStorm } = useTheme();
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertSource, setAlertSource] = useState('manual');
  const [hasLive, setHasLive] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const liveDotAnim = useRef(new Animated.Value(0.3)).current;

  // Live dot pulsing animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(liveDotAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (isStorm) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isStorm]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api.get('/dashboard');
      setWidgets(data.widgets || []);
      setAlertSource(data.alert_source || 'manual');
      setHasLive(data.has_live_alerts || false);
      if (data.is_alert_mode !== undefined) {
        toggleStorm(data.is_alert_mode);
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-poll every 30 seconds
  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => { setRefreshing(true); loadDashboard(); };

  const LiveBadge = () => (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: liveDotAnim, backgroundColor: alertSource === 'alerts.in.ua' ? '#34C759' : colors.textSecondary }]} />
      <Text style={[styles.liveText, { color: alertSource === 'alerts.in.ua' ? '#34C759' : colors.textSecondary }]}>
        {alertSource === 'alerts.in.ua' ? 'Live' : 'Demo'}
      </Text>
    </View>
  );

  const renderAlertBanner = () => {
    if (!isStorm) return null;
    return (
      <Animated.View style={[styles.alertBanner, { backgroundColor: colors.danger, transform: [{ scale: pulseAnim }] }]} testID="alert-banner">
        <Ionicons name="warning" size={22} color="#FFF" />
        <Text style={styles.alertText}>ПОВІТРЯНА ТРИВОГА</Text>
        <LiveBadge />
      </Animated.View>
    );
  };

  const renderWidget = (w: Widget) => {
    switch (w.widget_type) {
      case 'alert':
        return (
          <View key={w.id} testID="widget-alert" style={[styles.widgetFull, { backgroundColor: colors.danger + '15', borderColor: colors.danger, borderWidth: 2 }]}>
            <View style={styles.widgetHeader}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} />
              <Text style={[styles.widgetTitle, { color: colors.danger }]}>{w.title}</Text>
              {w.data?.source === 'alerts.in.ua' && <LiveBadge />}
            </View>
            <Text style={[styles.widgetBody, { color: colors.textPrimary }]}>{w.data?.message || 'Увага!'}</Text>
          </View>
        );
      case 'transport':
        const bridges = w.data?.bridges || [];
        return (
          <View key={w.id} testID="widget-transport" style={[styles.widgetFull, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.widgetHeader}>
              <Ionicons name="bus" size={22} color={colors.primary} />
              <Text style={[styles.widgetTitle, { color: colors.textPrimary }]}>{w.title}</Text>
            </View>
            {bridges.map((b: any) => (
              <View key={b.id} style={styles.bridgeRow}>
                <Text style={[styles.bridgeName, { color: colors.textPrimary }]}>{b.name_ua}</Text>
                <View style={[styles.statusBadge, { backgroundColor: b.status === 'open' ? colors.success + '20' : colors.warning + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: b.status === 'open' ? colors.success : colors.warning }]} />
                  <Text style={[styles.statusText, { color: b.status === 'open' ? colors.success : colors.warning }]}>
                    {b.status === 'open' ? 'Відкрито' : 'Обмежено'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      case 'eco':
        const beaches = w.data?.beaches || [];
        const ecoSource = w.data?.source || '';
        return (
          <View key={w.id} testID="widget-eco" style={[styles.widgetHalf, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.widgetHeader}>
              <Ionicons name="water" size={18} color="#0EA5E9" />
              <Text style={[styles.widgetTitleSm, { color: colors.textPrimary }]}>{w.title}</Text>
            </View>
            {beaches.slice(0, 2).map((b: any) => (
              <View key={b.id} style={styles.ecoRow}>
                <Text style={[styles.ecoName, { color: colors.textSecondary }]}>{b.beach_name_ua}</Text>
                <Text style={[styles.ecoTemp, { color: colors.primary }]}>{b.water_temp}°C</Text>
              </View>
            ))}
            {ecoSource ? <Text style={[styles.sourceTag, { color: colors.textSecondary }]}>📡 {ecoSource}</Text> : null}
          </View>
        );
      case 'light':
        const pct = w.data?.percentage || 0;
        return (
          <View key={w.id} testID="widget-light" style={[styles.widgetHalf, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.widgetHeader}>
              <Ionicons name="bulb" size={18} color={colors.accent} />
              <Text style={[styles.widgetTitleSm, { color: colors.textPrimary }]}>{w.title}</Text>
            </View>
            <Text style={[styles.lightPct, { color: pct > 60 ? colors.success : colors.warning }]}>{pct}%</Text>
            <Text style={[styles.lightLabel, { color: colors.textSecondary }]}>зі світлом</Text>
          </View>
        );
      case 'safety':
        const wsClients = w.data?.sentry_ws_clients || 0;
        return (
          <View key={w.id} testID="widget-safety" style={[styles.widgetFull, { backgroundColor: isStorm ? colors.surface : colors.primary + '06', borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.widgetHeader}>
              <Ionicons name="shield-checkmark" size={22} color={isStorm ? colors.danger : colors.success} />
              <Text style={[styles.widgetTitle, { color: colors.textPrimary }]}>{w.title}</Text>
              {wsClients > 0 && (
                <View style={[styles.wsBadge, { backgroundColor: colors.success + '20' }]}>
                  <Text style={[styles.wsText, { color: colors.success }]}>{wsClients} online</Text>
                </View>
              )}
            </View>
            <Text style={[styles.widgetBody, { color: colors.textSecondary }]}>{w.data?.message}</Text>
          </View>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.appName, { color: colors.primary }]}>ODESA WAVE</Text>
              <LiveBadge />
            </View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Привіт, одесит!</Text>
          </View>
          <TouchableOpacity
            testID="storm-toggle-btn"
            onPress={() => toggleStorm()}
            style={[styles.modeToggle, { backgroundColor: isStorm ? colors.danger + '20' : colors.primary + '10' }]}
          >
            <Ionicons name={isStorm ? 'thunderstorm' : 'sunny'} size={24} color={isStorm ? colors.danger : colors.accent} />
          </TouchableOpacity>
        </View>

        {renderAlertBanner()}

        {/* Widgets */}
        <View style={styles.widgetsContainer}>
          {widgets.map((w) => {
            if (w.widget_type === 'eco' || w.widget_type === 'light') return null;
            return renderWidget(w);
          })}
          <View style={styles.halfRow}>
            {widgets.filter(w => w.widget_type === 'eco' || w.widget_type === 'light').map(renderWidget)}
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Швидкі дії</Text>
        <View style={styles.quickActions}>
          {[
            { icon: 'qr-code', label: 'QR Квиток', color: colors.primary, tab: 'transport' },
            { icon: 'megaphone', label: 'Тривога', color: colors.danger, tab: 'profile' },
            { icon: 'bulb', label: 'Де Світло', color: colors.accent, tab: 'map' },
            { icon: 'chatbubbles', label: 'Дядя Жора', color: '#0EA5E9', tab: 'services' },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              testID={`quick-action-${i}`}
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
              activeOpacity={0.7}
              onPress={() => router.push(`/(tabs)/${action.tab}` as any)}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: action.color + '12' }]}>
                <Ionicons name={action.icon as any} size={24} color={action.color} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Data Sources */}
        <View style={[styles.sourcesBar, { borderTopColor: colors.border }]}>
          <Text style={[styles.sourcesText, { color: colors.textSecondary }]}>
            Джерела: alerts.in.ua • Copernicus Marine • ДСНС
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appName: { fontSize: 28, fontWeight: '800', letterSpacing: 1.5 },
  greeting: { fontSize: 15, marginTop: 2 },
  modeToggle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  alertBanner: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  alertText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  widgetsContainer: { gap: 12, marginBottom: 24 },
  widgetFull: { borderRadius: 20, padding: 18 },
  widgetHalf: { flex: 1, borderRadius: 20, padding: 16 },
  halfRow: { flexDirection: 'row', gap: 12 },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  widgetTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  widgetTitleSm: { fontSize: 15, fontWeight: '700' },
  widgetBody: { fontSize: 14, lineHeight: 20 },
  bridgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  bridgeName: { fontSize: 14, fontWeight: '500' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  ecoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  ecoName: { fontSize: 13 },
  ecoTemp: { fontSize: 14, fontWeight: '700' },
  sourceTag: { fontSize: 9, marginTop: 6, fontStyle: 'italic' },
  lightPct: { fontSize: 36, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  lightLabel: { fontSize: 12, textAlign: 'center' },
  wsBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  wsText: { fontSize: 11, fontWeight: '600' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 14 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  quickAction: { width: '47%', borderRadius: 18, padding: 16, alignItems: 'center', gap: 10 },
  quickIconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '600' },
  sourcesBar: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, alignItems: 'center' },
  sourcesText: { fontSize: 11, textAlign: 'center' },
});
