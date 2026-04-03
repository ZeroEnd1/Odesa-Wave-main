import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';
import QRCode from 'react-native-qrcode-svg';

export default function TransportScreen() {
  const { colors } = useTheme();
  const [routes, setRoutes] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [bridges, setBridges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showQR, setShowQR] = useState(false);
  const [activeTab, setActiveTab] = useState<'routes' | 'tickets' | 'bridges'>('routes');

  const loadData = useCallback(async () => {
    try {
      const [r, t, b] = await Promise.all([
        api.get('/transport/routes', true).catch((err) => { console.warn('routes:', err); return []; }),
        api.get('/transport/tickets', false).catch((err) => { console.warn('tickets:', err); return []; }),
        api.get('/transport/bridges', true).catch((err) => { console.warn('bridges:', err); return []; }),
      ]);
      setRoutes(Array.isArray(r) ? r : []);
      setTickets(Array.isArray(t) ? t : []);
      setBridges(Array.isArray(b) ? b : []);
    } catch (err) {
      console.error('Transport data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);

  const buyTicket = async (route: any) => {
    setBuying(true);
    try {
      const ticket = await api.post('/transport/ticket', {
        route_name: route.route_name,
        route_number: route.route_number,
        ticket_type: 'single',
      });
      setTickets(prev => [ticket, ...prev]);
      setSelectedTicket(ticket);
      setShowQR(true);
    } catch (err) {
      console.error('Buy ticket error:', err);
    } finally {
      setBuying(false);
    }
  };

  const getRouteIcon = (type: string): any => {
    switch (type) {
      case 'tram': return 'train';
      case 'trolleybus': return 'bus';
      default: return 'car';
    }
  };

  const getRouteColor = (type: string) => {
    switch (type) {
      case 'tram': return '#FF6B35';
      case 'trolleybus': return '#005BBB';
      default: return '#34C759';
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="transport-screen">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Транспорт</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Квитки та маршрути</Text>
      </View>

      {/* Sub Tabs */}
      <View style={[styles.subTabs, { backgroundColor: colors.surface }]}>
        {(['routes', 'tickets', 'bridges'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            testID={`transport-tab-${tab}`}
            onPress={() => setActiveTab(tab)}
            style={[styles.subTab, activeTab === tab && { backgroundColor: colors.primary + '15' }]}
          >
            <Text style={[styles.subTabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tab === 'routes' ? 'Маршрути' : tab === 'tickets' ? 'Мої квитки' : 'Мости'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'routes' && (
          <View style={styles.routeList}>
            {routes.map((route, i) => (
              <View key={i} testID={`route-${route.route_number}`} style={[styles.routeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.routeIconWrap, { backgroundColor: getRouteColor(route.type) + '15' }]}>
                  <Ionicons name={getRouteIcon(route.type)} size={24} color={getRouteColor(route.type)} />
                </View>
                <View style={styles.routeInfo}>
                  <Text style={[styles.routeName, { color: colors.textPrimary }]}>{route.route_name}</Text>
                  <Text style={[styles.routePrice, { color: colors.textSecondary }]}>{route.price} грн</Text>
                </View>
                <TouchableOpacity
                  testID={`buy-ticket-${route.route_number}`}
                  onPress={() => buyTicket(route)}
                  disabled={buying}
                  style={[styles.buyBtn, { backgroundColor: colors.primary }]}
                  activeOpacity={0.8}
                >
                  {buying ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.buyBtnText}>Купити</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'tickets' && (
          <View style={styles.ticketList}>
            {tickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ticket-outline" size={48} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>У вас поки немає квитків</Text>
              </View>
            ) : (
              tickets.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  testID={`ticket-${t.id}`}
                  onPress={() => { setSelectedTicket(t); setShowQR(true); }}
                  style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.ticketTop}>
                    <Ionicons name="qr-code" size={20} color={colors.primary} />
                    <Text style={[styles.ticketRoute, { color: colors.textPrimary }]}>{t.route_name}</Text>
                  </View>
                  <View style={styles.ticketBottom}>
                    <Text style={[styles.ticketPrice, { color: colors.primary }]}>{t.price} грн</Text>
                    <Text style={[styles.ticketDate, { color: colors.textSecondary }]}>
                      {new Date(t.created_at).toLocaleDateString('uk-UA')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeTab === 'bridges' && (
          <View style={styles.bridgeList}>
            {bridges.map((b) => (
              <View key={b.id} testID={`bridge-${b.id}`} style={[styles.bridgeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="git-network" size={28} color={colors.primary} />
                <View style={styles.bridgeInfo}>
                  <Text style={[styles.bridgeName, { color: colors.textPrimary }]}>{b.name_ua}</Text>
                  <Text style={[styles.bridgeTime, { color: colors.textSecondary }]}>
                    Оновлено: {new Date(b.last_updated).toLocaleTimeString('uk-UA')}
                  </Text>
                </View>
                <View style={[styles.bridgeStatusBadge, {
                  backgroundColor: b.status === 'open' ? '#34C759' + '20' : '#FF9F0A' + '20'
                }]}>
                  <View style={[styles.bridgeDot, { backgroundColor: b.status === 'open' ? '#34C759' : '#FF9F0A' }]} />
                  <Text style={[styles.bridgeStatusText, { color: b.status === 'open' ? '#34C759' : '#FF9F0A' }]}>
                    {b.status === 'open' ? 'Відкрито' : 'Обмежено'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="slide" onRequestClose={() => setShowQR(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.qrModal, { backgroundColor: colors.surface }]}>
            <View style={styles.qrModalHeader}>
              <Text style={[styles.qrModalTitle, { color: colors.textPrimary }]}>Ваш квиток</Text>
              <TouchableOpacity testID="close-qr-modal" onPress={() => setShowQR(false)}>
                <Ionicons name="close-circle" size={32} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedTicket && (
              <View style={styles.qrContent}>
                <Text style={[styles.qrRoute, { color: colors.textPrimary }]}>{selectedTicket.route_name}</Text>
                <View style={[styles.qrCodeWrap, { backgroundColor: '#FFF', borderColor: colors.primary }]}>
                  <View style={{ backgroundColor: '#FFF', padding: 16, borderRadius: 12 }}>
                    <QRCode value={selectedTicket.qr_data || 'ODESA-WAVE'} size={180} backgroundColor="#FFF" />
                  </View>
                </View>
                <Text style={[styles.qrCode, { color: colors.primary }]}>{selectedTicket.qr_data}</Text>
                <Text style={[styles.qrPrice, { color: colors.textSecondary }]}>{selectedTicket.price} грн</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  subTabs: { flexDirection: 'row', padding: 8, gap: 4 },
  subTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  subTabText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  // Routes
  routeList: { gap: 10 },
  routeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1 },
  routeIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  routeInfo: { flex: 1, marginLeft: 14 },
  routeName: { fontSize: 16, fontWeight: '600' },
  routePrice: { fontSize: 14, marginTop: 2 },
  buyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  buyBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  // Tickets
  ticketList: { gap: 10 },
  ticketCard: { padding: 18, borderRadius: 18, borderWidth: 1 },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketRoute: { fontSize: 16, fontWeight: '600' },
  ticketBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  ticketPrice: { fontSize: 18, fontWeight: '800' },
  ticketDate: { fontSize: 13 },
  // Bridges
  bridgeList: { gap: 10 },
  bridgeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, borderWidth: 1, gap: 14 },
  bridgeInfo: { flex: 1 },
  bridgeName: { fontSize: 16, fontWeight: '600' },
  bridgeTime: { fontSize: 12, marginTop: 2 },
  bridgeStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  bridgeDot: { width: 8, height: 8, borderRadius: 4 },
  bridgeStatusText: { fontSize: 13, fontWeight: '600' },
  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
  // QR Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  qrModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  qrModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  qrModalTitle: { fontSize: 22, fontWeight: '800' },
  qrContent: { alignItems: 'center', gap: 16 },
  qrRoute: { fontSize: 20, fontWeight: '700' },
  qrCodeWrap: { padding: 20, borderRadius: 20, borderWidth: 3 },
  qrCode: { fontSize: 18, fontWeight: '700', letterSpacing: 2 },
  qrPrice: { fontSize: 16 },
});
