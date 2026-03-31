import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ProfileScreen() {
  const { colors, isStorm, toggleStorm } = useTheme();
  const [panicLoading, setPanicLoading] = useState(false);
  const [lightLoading, setLightLoading] = useState(false);
  const [panicAddress, setPanicAddress] = useState('');
  const [panicDistrict, setPanicDistrict] = useState('Приморський');
  const [lightDistrict, setLightDistrict] = useState('Приморський');
  const [hasLight, setHasLight] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsClients, setWsClients] = useState(0);
  const [lastAlarm, setLastAlarm] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const alarmAnim = useRef(new Animated.Value(0)).current;

  const districts = ['Приморський', 'Київський', 'Суворовський', 'Малиновський'];

  // WebSocket connection
  useEffect(() => {
    const wsUrl = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/sentry';
    let ws: WebSocket;
    let reconnectTimeout: any;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          // Send heartbeat
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          }, 25000);
          ws.onclose = () => {
            clearInterval(pingInterval);
            setWsConnected(false);
            reconnectTimeout = setTimeout(connect, 5000);
          };
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'panic') {
              setLastAlarm(data);
              // Trigger alarm animation
              Animated.sequence([
                Animated.timing(alarmAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(alarmAnim, { toValue: 0, duration: 5000, useNativeDriver: true }),
              ]).start();
              Alert.alert(
                '🚨 Тривога у дворику!',
                `${data.district}, ${data.address}\n${data.message}`,
                [{ text: 'Зрозуміло' }]
              );
            } else if (data.type === 'air_raid') {
              toggleStorm(true);
              Alert.alert('🔴 ПОВІТРЯНА ТРИВОГА', data.message, [{ text: 'Зрозуміло' }]);
            }
          } catch (e) {}
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Fetch WS status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await api.get('/sentry/ws-status');
        setWsClients(data.connected_clients || 0);
      } catch (e) {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Pulse animation for panic button
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const triggerPanic = async () => {
    if (!panicAddress.trim()) {
      Alert.alert('Помилка', 'Вкажіть адресу');
      return;
    }
    setPanicLoading(true);
    try {
      await api.post('/sentry/panic', {
        district: panicDistrict,
        address: panicAddress.trim(),
        message: 'Екстрена тривога!',
      });
      Alert.alert('Тривога відправлена!', `Сповіщено ${wsClients} підключених пристроїв.`);
      setPanicAddress('');
    } catch (err) {
      Alert.alert('Помилка', 'Не вдалось відправити тривогу');
    } finally {
      setPanicLoading(false);
    }
  };

  const reportLight = async () => {
    setLightLoading(true);
    try {
      await api.post('/light/report', {
        district: lightDistrict,
        has_light: hasLight,
        lat: 46.45 + Math.random() * 0.08,
        lng: 30.68 + Math.random() * 0.1,
      });
      Alert.alert('Дякуємо!', `Ваш звіт про ${hasLight ? 'наявність' : 'відсутність'} світла збережено.`);
    } catch (err) {
      Alert.alert('Помилка', 'Не вдалось зберегти звіт');
    } finally {
      setLightLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="person" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>Одесит</Text>
          <Text style={[styles.userCity, { color: colors.textSecondary }]}>м. Одеса</Text>
        </View>

        {/* WebSocket Status */}
        <View style={[styles.wsStatusBar, { backgroundColor: wsConnected ? '#34C759' + '15' : colors.surface, borderColor: wsConnected ? '#34C759' + '30' : colors.border }]}>
          <View style={[styles.wsIndicator, { backgroundColor: wsConnected ? '#34C759' : '#FF3B30' }]} />
          <Text style={[styles.wsStatusText, { color: wsConnected ? '#34C759' : colors.textSecondary }]}>
            SentryNode: {wsConnected ? 'Підключено' : 'Відключено'}
          </Text>
          {wsClients > 0 && (
            <Text style={[styles.wsClients, { color: colors.textSecondary }]}>
              {wsClients} пристроїв онлайн
            </Text>
          )}
        </View>

        {/* Incoming Alarm */}
        {lastAlarm && (
          <Animated.View style={[styles.incomingAlarm, { opacity: alarmAnim, backgroundColor: '#FF3B30' + '15', borderColor: '#FF3B30' }]}>
            <Ionicons name="alert-circle" size={20} color="#FF3B30" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alarmTitle, { color: '#FF3B30' }]}>Остання тривога</Text>
              <Text style={[styles.alarmDetail, { color: colors.textPrimary }]}>
                {lastAlarm.district}, {lastAlarm.address}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Theme Toggle */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name={isStorm ? 'thunderstorm' : 'sunny'} size={22} color={isStorm ? colors.danger : colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Режим тривоги</Text>
          </View>
          <TouchableOpacity
            testID="theme-toggle"
            onPress={() => toggleStorm()}
            style={[styles.toggleBtn, { backgroundColor: isStorm ? colors.danger : colors.primary + '15' }]}
          >
            <Text style={[styles.toggleText, { color: isStorm ? '#FFF' : colors.primary }]}>
              {isStorm ? 'Storm Mode: УВІМК' : 'Перейти у Storm Mode'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
            Автоматично вмикається при тривозі з alerts.in.ua
          </Text>
        </View>

        {/* Panic Button */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="megaphone" size={22} color={colors.danger} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Тривога у дворику</Text>
            <View style={[styles.realtimeBadge, { backgroundColor: '#8B5CF6' + '15' }]}>
              <Text style={[styles.realtimeText, { color: '#8B5CF6' }]}>WebSocket</Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Район</Text>
          <View style={styles.chipRow}>
            {districts.map(d => (
              <TouchableOpacity
                key={d}
                testID={`panic-district-${d}`}
                onPress={() => setPanicDistrict(d)}
                style={[styles.chip, { backgroundColor: panicDistrict === d ? colors.danger : colors.background, borderColor: panicDistrict === d ? colors.danger : colors.border }]}
              >
                <Text style={[styles.chipText, { color: panicDistrict === d ? '#FFF' : colors.textSecondary }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Адреса</Text>
          <TextInput
            testID="panic-address-input"
            style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Вул. Дерибасівська, 10"
            placeholderTextColor={colors.textSecondary}
            value={panicAddress}
            onChangeText={setPanicAddress}
          />

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              testID="panic-button"
              onPress={triggerPanic}
              disabled={panicLoading}
              style={styles.panicBtn}
              activeOpacity={0.8}
            >
              {panicLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="alert-circle" size={24} color="#FFF" />
                  <Text style={styles.panicBtnText}>ТРИВОГА!</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
          <Text style={[styles.panicHint, { color: colors.textSecondary }]}>
            Миттєво сповістить усіх підключених через WebSocket
          </Text>
        </View>

        {/* Light Report */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb" size={22} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Повідомити про світло</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Район</Text>
          <View style={styles.chipRow}>
            {districts.map(d => (
              <TouchableOpacity
                key={d}
                testID={`light-district-${d}`}
                onPress={() => setLightDistrict(d)}
                style={[styles.chip, { backgroundColor: lightDistrict === d ? colors.primary : colors.background, borderColor: lightDistrict === d ? colors.primary : colors.border }]}
              >
                <Text style={[styles.chipText, { color: lightDistrict === d ? '#FFF' : colors.textSecondary }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.lightToggleRow}>
            <TouchableOpacity
              testID="light-yes-btn"
              onPress={() => setHasLight(true)}
              style={[styles.lightToggle, { backgroundColor: hasLight ? '#34C759' : colors.background, borderColor: hasLight ? '#34C759' : colors.border }]}
            >
              <Ionicons name="bulb" size={20} color={hasLight ? '#FFF' : colors.textSecondary} />
              <Text style={[styles.lightToggleText, { color: hasLight ? '#FFF' : colors.textSecondary }]}>Є світло</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="light-no-btn"
              onPress={() => setHasLight(false)}
              style={[styles.lightToggle, { backgroundColor: !hasLight ? '#FF3B30' : colors.background, borderColor: !hasLight ? '#FF3B30' : colors.border }]}
            >
              <Ionicons name="bulb-outline" size={20} color={!hasLight ? '#FFF' : colors.textSecondary} />
              <Text style={[styles.lightToggleText, { color: !hasLight ? '#FFF' : colors.textSecondary }]}>Немає</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity testID="report-light-btn" onPress={reportLight} disabled={lightLoading} style={[styles.reportBtn, { backgroundColor: colors.primary }]}>
            {lightLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.reportBtnText}>Надіслати звіт</Text>}
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Про застосунок</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Odesa Wave v2.0</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Інтеграції: alerts.in.ua • Copernicus Marine • GPT-4o</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Real-time: WebSocket SentryNode</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>Зроблено з ❤️ для одеситів</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40, gap: 14 },
  profileHeader: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  userName: { fontSize: 24, fontWeight: '800' },
  userCity: { fontSize: 15, marginTop: 2 },
  wsStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  wsIndicator: { width: 10, height: 10, borderRadius: 5 },
  wsStatusText: { fontSize: 14, fontWeight: '600', flex: 1 },
  wsClients: { fontSize: 12 },
  incomingAlarm: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  alarmTitle: { fontSize: 13, fontWeight: '700' },
  alarmDetail: { fontSize: 14, marginTop: 2 },
  section: { borderRadius: 20, padding: 20, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  realtimeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  realtimeText: { fontSize: 11, fontWeight: '600' },
  toggleBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  toggleText: { fontSize: 16, fontWeight: '700' },
  toggleHint: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '500' },
  input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, marginBottom: 14 },
  panicBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FF3B30', paddingVertical: 18, borderRadius: 16 },
  panicBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  panicHint: { fontSize: 11, textAlign: 'center', marginTop: 8 },
  lightToggleRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  lightToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  lightToggleText: { fontSize: 14, fontWeight: '600' },
  reportBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  reportBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  infoText: { fontSize: 14, lineHeight: 22 },
});
