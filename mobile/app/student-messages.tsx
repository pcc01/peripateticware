// app/student-messages.tsx — STUDENT side of teacher↔student messaging,
// mirroring app/teacher-messages.tsx's list view but with no compose UI:
// students can only read + reply within a thread a teacher started (same
// scope as the parent side's MessagesModal in
// app/(tabs)/parent-dashboard.tsx). Reached from (tabs)/index.tsx's header.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchStudentConversations, StudentConversation } from '@/src/api/studentMessages';

export default function StudentMessagesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<StudentConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setConversations(await fetchStudentConversations());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView testID="student-messages-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="student-messages-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('studentMessages.title', 'Messages')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('studentMessages.loadError', 'Could not load messages.')}</Text>
        </View>
      ) : (
        <FlatList
          testID="student-messages-list"
          data={conversations}
          keyExtractor={(c) => c.conversation_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>✉️</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{t('studentMessages.empty', 'No messages from teachers yet.')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`student-conversation-${item.conversation_id}`}
              onPress={() => router.push({ pathname: '/student-message-thread/[id]', params: { id: item.conversation_id, name: item.other_user_name } })}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {item.unread && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
                  <Text style={[styles.cardName, { fontFamily: theme.fontHead, color: theme.text, fontWeight: item.unread ? '700' : '600' }]} numberOfLines={1}>{item.other_user_name}</Text>
                </View>
                <Text style={[styles.cardSubject, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{item.subject}</Text>
                <Text style={[styles.cardPreview, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={1}>{item.last_message}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:      { fontSize: 48 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card:            { padding: 14, borderWidth: 1, gap: 3 },
  cardName:        { fontSize: 15 },
  cardSubject:     { fontSize: 13, fontWeight: '600' },
  cardPreview:     { fontSize: 12 },
  unreadDot:       { width: 7, height: 7, borderRadius: 4 },
});
