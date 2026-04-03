import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { api } from '../../src/utils/api';

export default function ServicesScreen() {
  const { colors, isStorm } = useTheme();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId] = useState(() => 'session-' + Date.now());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    const cached = api.getCachedData('/services');
    if (cached) {
      setServices(Array.isArray(cached) ? cached : []);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/services');
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Services load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadServices(); }, []);

  const getIconName = (icon: string): any => {
    const map: Record<string, string> = {
      'file-text': 'document-text',
      'credit-card': 'card',
      'truck': 'car',
      'baby': 'people',
      'zap': 'flash',
      'alert-triangle': 'warning',
      'tree-pine': 'leaf',
      'heart': 'heart',
      'car': 'car',
      'vote': 'checkmark-circle',
      'lamp': 'bulb',
      'shield': 'shield-checkmark',
      'stethoscope': 'medkit',
      'graduation-cap': 'school',
      'wifi': 'wifi',
    };
    return map[icon] || 'apps';
  };

  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      documents: '#005BBB',
      payments: '#34C759',
      transport: '#FF6B35',
      infrastructure: '#FF9F0A',
      democracy: '#8B5CF6',
      safety: '#FF3B30',
      health: '#EC4899',
      education: '#0EA5E9',
      digital: '#06B6D4',
    };
    return map[cat] || colors.primary;
  };

  const categories = [...new Set(services.map(s => s.category))];
  const categoryNames: Record<string, string> = {};
  services.forEach(s => { categoryNames[s.category] = s.category_ua; });

  const filtered = services.filter(s => {
    const matchSearch = s.name_ua.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = !selectedCategory || s.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await api.post('/chat', { session_id: sessionId, message: msg });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Ой, щось пішло не так. Спробуйте ще раз!' }]);
    } finally {
      setChatLoading(false);
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} testID="services-screen">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Послуги</Text>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            testID="services-search"
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Пошук послуг..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryList}>
        <TouchableOpacity
          testID="category-all"
          onPress={() => setSelectedCategory(null)}
          style={[styles.categoryChip, { backgroundColor: !selectedCategory ? colors.primary : colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.categoryChipText, { color: !selectedCategory ? '#FFF' : colors.textSecondary }]}>Усі</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            testID={`category-${cat}`}
            onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={[styles.categoryChip, {
              backgroundColor: selectedCategory === cat ? getCategoryColor(cat) : colors.surface,
              borderColor: selectedCategory === cat ? getCategoryColor(cat) : colors.border,
            }]}
          >
            <Text style={[styles.categoryChipText, { color: selectedCategory === cat ? '#FFF' : colors.textSecondary }]}>
              {categoryNames[cat] || cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Services List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadServices(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((s) => (
          <TouchableOpacity key={s.id} testID={`service-${s.id}`} style={[styles.serviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7}>
            <View style={[styles.serviceIconWrap, { backgroundColor: getCategoryColor(s.category) + '15' }]}>
              <Ionicons name={getIconName(s.icon)} size={24} color={getCategoryColor(s.category)} />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceName, { color: colors.textPrimary }]}>{s.name_ua}</Text>
              <Text style={[styles.serviceDesc, { color: colors.textSecondary }]} numberOfLines={1}>{s.description_ua}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Chat FAB */}
      <TouchableOpacity
        testID="chatbot-fab"
        onPress={() => setShowChat(true)}
        style={[styles.fab, { backgroundColor: isStorm ? colors.danger : colors.primary }]}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubbles" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <SafeAreaView style={[styles.chatContainer, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            {/* Chat Header */}
            <View style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={styles.chatHeaderLeft}>
                <View style={[styles.chatAvatar, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={{ fontSize: 24 }}>👨</Text>
                </View>
                <View>
                  <Text style={[styles.chatName, { color: colors.textPrimary }]}>Дядя Жора</Text>
                  <Text style={[styles.chatStatus, { color: colors.success }]}>Онлайн</Text>
                </View>
              </View>
              <TouchableOpacity testID="close-chat" onPress={() => setShowChat(false)}>
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              data={chatMessages}
              keyExtractor={(_, i) => `msg-${i}`}
              renderItem={({ item }) => (
                <View style={[styles.msgRow, item.role === 'user' ? styles.msgRowUser : styles.msgRowBot]}>
                  <View style={[
                    styles.msgBubble,
                    item.role === 'user'
                      ? [styles.msgBubbleUser, { backgroundColor: colors.primary }]
                      : [styles.msgBubbleBot, { backgroundColor: colors.surface, borderColor: colors.border }]
                  ]}>
                    <Text style={[styles.msgText, { color: item.role === 'user' ? '#FFF' : colors.textPrimary }]}>{item.content}</Text>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.chatMessages}
              ListEmptyComponent={
                <View style={styles.chatEmpty}>
                  <Text style={{ fontSize: 48 }}>👨</Text>
                  <Text style={[styles.chatEmptyTitle, { color: colors.textPrimary }]}>Дядя Жора</Text>
                  <Text style={[styles.chatEmptyText, { color: colors.textSecondary }]}>
                    Привіт, дорогенький! Чим можу допомогти? Питай про міські послуги, транспорт, чи що завгодно!
                  </Text>
                </View>
              }
            />

            {chatLoading && (
              <View style={styles.typingIndicator}>
                <Text style={[styles.typingText, { color: colors.textSecondary }]}>Дядя Жора набирає...</Text>
              </View>
            )}

            {/* Input */}
            <View style={[styles.chatInputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <TextInput
                testID="chat-input"
                style={[styles.chatTextInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
                placeholder="Напишіть повідомлення..."
                placeholderTextColor={colors.textSecondary}
                value={chatInput}
                onChangeText={setChatInput}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                testID="chat-send-btn"
                onPress={sendMessage}
                disabled={chatLoading || !chatInput.trim()}
                style={[styles.sendBtn, { backgroundColor: chatInput.trim() ? colors.primary : colors.textSecondary + '40' }]}
              >
                <Ionicons name="send" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  categoryScroll: { maxHeight: 52 },
  categoryList: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 8 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1 },
  serviceIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceInfo: { flex: 1, marginLeft: 14 },
  serviceName: { fontSize: 15, fontWeight: '600' },
  serviceDesc: { fontSize: 13, marginTop: 2 },
  // FAB
  fab: { position: 'absolute', bottom: 24, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  // Chat
  chatContainer: { flex: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chatAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chatName: { fontSize: 18, fontWeight: '700' },
  chatStatus: { fontSize: 12, fontWeight: '500' },
  chatMessages: { padding: 16, paddingBottom: 20 },
  chatEmpty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  chatEmptyTitle: { fontSize: 22, fontWeight: '700' },
  chatEmptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 30 },
  msgRow: { marginBottom: 12 },
  msgRowUser: { alignItems: 'flex-end' },
  msgRowBot: { alignItems: 'flex-start' },
  msgBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  msgBubbleUser: { borderBottomRightRadius: 6 },
  msgBubbleBot: { borderBottomLeftRadius: 6, borderWidth: 1 },
  msgText: { fontSize: 15, lineHeight: 22 },
  typingIndicator: { paddingHorizontal: 20, paddingBottom: 8 },
  typingText: { fontSize: 13, fontStyle: 'italic' },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10, borderTopWidth: 1 },
  chatTextInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
