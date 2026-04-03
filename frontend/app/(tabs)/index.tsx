import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/utils/api';
import { useRouter } from 'expo-router';

interface Widget {
  id: string;
  title: string;
  widget_type: string;
  priority: number;
  data: any;
}

const SkeletonLoader = ({ count = 3, type = 'full' }: { count?: number; type?: 'full' | 'half' | 'weather' }) => {
  const animatedOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedOpacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(animatedOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const renderSkeleton = (i: number) => {
    if (type === 'weather') {
      return (
        <View key={i} style={[styles.skeletonWeather, { backgroundColor: '#E0E0E0' }]}>
          <Animated.View style={{ opacity: animatedOpacity, flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#BDBDBD' }} />
                <View style={{ width: 100, height: 18, borderRadius: 4, backgroundColor: '#BDBDBD' }} />
              </View>
              <View style={{ width: 60, height: 14, borderRadius: 4, backgroundColor: '#BDBDBD' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 60, height: 48, borderRadius: 8, backgroundColor: '#BDBDBD' }} />
              <View style={{ flex: 1 }}>
                <View style={{ width: 100, height: 20, borderRadius: 4, backgroundColor: '#BDBDBD', marginBottom: 6 }} />
                <View style={{ width: 140, height: 14, borderRadius: 4, backgroundColor: '#BDBDBD' }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
              <View style={{ width: 60, height: 40, borderRadius: 8, backgroundColor: '#BDBDBD' }} />
              <View style={{ width: 60, height: 40, borderRadius: 8, backgroundColor: '#BDBDBD' }} />
            </View>
          </Animated.View>
        </View>
      );
    }

    if (type === 'half') {
      return (
        <View key={i} style={[styles.skeletonHalf, { backgroundColor: '#E0E0E0' }]}>
          <Animated.View style={{ opacity: animatedOpacity, width: '100%', height: '100%' }}>
            <View style={{ width: '40%', height: 16, borderRadius: 4, backgroundColor: '#BDBDBD', marginBottom: 12 }} />
            <View style={{ width: '60%', height: 36, borderRadius: 8, backgroundColor: '#BDBDBD' }} />
            <View style={{ width: '40%', height: 12, borderRadius: 4, backgroundColor: '#BDBDBD', marginTop: 8 }} />
          </Animated.View>
        </View>
      );
    }

    return (
      <View key={i} style={[styles.skeletonFull, { backgroundColor: '#E0E0E0' }]}>
        <Animated.View style={{ opacity: animatedOpacity, width: '100%', height: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#BDBDBD' }} />
            <View style={{ width: 120, height: 16, borderRadius: 4, backgroundColor: '#BDBDBD' }} />
          </View>
          <View style={{ width: '80%', height: 14, borderRadius: 4, backgroundColor: '#BDBDBD' }} />
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={type === 'half' ? { flex: 1, gap: 12 } : { gap: 12 }}>
      {Array(count).fill(0).map((_, i) => renderSkeleton(i))}
    </View>
  );
};

export default function HomeScreen() {
  const { colors, isStorm, toggleStorm } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alertSource, setAlertSource] = useState('manual');
  const [hasLive, setHasLive] = useState(false);
  const [weather, setWeather] = useState<any>(null);
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
      const [data, weatherData] = await Promise.all([
        api.get('/dashboard', false).catch(() => null),
        api.get('/weather', false).catch(() => null),
      ]);
      if (data) {
        setWidgets(data.widgets || []);
        setAlertSource(data.alert_source || 'manual');
        setHasLive(data.has_live_alerts || false);
        if (data.is_alert_mode !== undefined) {
          toggleStorm(data.is_alert_mode);
        }
      }
      if (weatherData) setWeather(weatherData);
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

  const onRefresh = () => { setRefreshing(true); api.clearCache(); loadDashboard(); };

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View>
              <View style={{ width: 150, height: 32, borderRadius: 6, backgroundColor: '#E0E0E0', marginBottom: 8 }} />
              <View style={{ width: 100, height: 16, borderRadius: 4, backgroundColor: '#E0E0E0' }} />
            </View>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0E0E0' }} />
          </View>
          <SkeletonLoader count={4} type="full" />
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <SkeletonLoader count={1} type="half" />
            <SkeletonLoader count={1} type="half" />
          </View>
          <SkeletonLoader count={1} type="weather" />
        </ScrollView>
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
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>Привіт, {user?.name || 'одесит'}!</Text>
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

        {/* Weather Widget */}
        {weather && (
          <View style={[styles.weatherCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.weatherHeader}>
              <Ionicons name="partly-sunny" size={24} color={colors.accent} />
              <Text style={[styles.weatherTitle, { color: colors.textPrimary }]}>Погода в Одесі</Text>
              <Text style={[styles.weatherSource, { color: colors.textSecondary }]}>Open-Meteo</Text>
            </View>
            <View style={styles.weatherMain}>
              <Text style={[styles.weatherTemp, { color: colors.primary }]}>{Math.round(weather.temperature)}°C</Text>
              <View style={styles.weatherDetails}>
                <Text style={[styles.weatherDesc, { color: colors.textPrimary }]}>{weather.description_ua}</Text>
                <Text style={[styles.weatherFeels, { color: colors.textSecondary }]}>
                  Відчувається як {Math.round(weather.feels_like)}°C
                </Text>
              </View>
            </View>
            <View style={styles.weatherStats}>
              <View style={styles.weatherStat}>
                <Ionicons name="water-outline" size={16} color="#0EA5E9" />
                <Text style={[styles.weatherStatVal, { color: colors.textPrimary }]}>{weather.humidity}%</Text>
                <Text style={[styles.weatherStatLabel, { color: colors.textSecondary }]}>Вологість</Text>
              </View>
              <View style={styles.weatherStat}>
                <Ionicons name="speedometer-outline" size={16} color="#8B5CF6" />
                <Text style={[styles.weatherStatVal, { color: colors.textPrimary }]}>{weather.wind_speed} м/с</Text>
                <Text style={[styles.weatherStatLabel, { color: colors.textSecondary }]}>Вітер</Text>
              </View>
            </View>
            {weather.hourly && weather.hourly.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScroll}>
                {weather.hourly.slice(0, 12).map((h: any, i: number) => (
                  <View key={i} style={styles.hourlyItem}>
                    <Text style={[styles.hourlyTime, { color: colors.textSecondary }]}>
                      {h.time?.split('T')[1]?.substring(0, 5) || ''}
                    </Text>
                    <Text style={[styles.hourlyTemp, { color: colors.textPrimary }]}>
                      {h.temperature !== null ? `${Math.round(h.temperature)}°` : '—'}
                    </Text>
                    {h.precipitation_probability !== null && h.precipitation_probability > 0 && (
                      <Text style={[styles.hourlyPrecip, { color: '#0EA5E9' }]}>{h.precipitation_probability}%</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

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
            Джерела: alerts.in.ua • Copernicus Marine • Open-Meteo • SaveEcoBot
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
  // Weather
  weatherCard: { borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 16 },
  weatherHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  weatherTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  weatherSource: { fontSize: 11 },
  weatherMain: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  weatherTemp: { fontSize: 48, fontWeight: '800' },
  weatherDetails: { flex: 1 },
  weatherDesc: { fontSize: 16, fontWeight: '600' },
  weatherFeels: { fontSize: 13, marginTop: 2 },
  weatherStats: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  weatherStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weatherStatVal: { fontSize: 14, fontWeight: '600' },
  weatherStatLabel: { fontSize: 11 },
  hourlyScroll: { marginTop: 8 },
  hourlyItem: { alignItems: 'center', marginRight: 16, minWidth: 44 },
  hourlyTime: { fontSize: 11, marginBottom: 4 },
  hourlyTemp: { fontSize: 15, fontWeight: '700' },
  hourlyPrecip: { fontSize: 10, marginTop: 2 },
  // Skeleton
  skeletonFull: { borderRadius: 20, padding: 18, height: 100 },
  skeletonHalf: { flex: 1, borderRadius: 20, padding: 16, height: 120 },
  skeletonWeather: { borderRadius: 20, padding: 18, height: 220, marginBottom: 16 },
});
