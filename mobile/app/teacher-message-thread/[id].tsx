// app/teacher-message-thread/[id].tsx — full thread for one conversation,
// TEACHER/HOMESCHOOL side. Reached from app/teacher-messages.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherThread, replyInTeacherThread, ThreadMessage } from '@/src/api/teacherMessages';

export default function TeacherMessageThreadScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchTeacherThread(id).then(setMessages).catch(() => setError(true)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      await replyInTeacherThread(id, reply.trim());
      setReply('');
      load();
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('teacherMessages.sendError', 'Could not send this message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView testID="teacher-message-thread-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="teacher-message-thread-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{name || t('teacherMessages.title', 'Messages')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('teacherMessages.loadError', 'Could not load messages.')}</Text>
          </View>
        ) : (
          <FlatList
            testID="teacher-message-thread-list"
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.is_mine
                    ? { backgroundColor: theme.accent, alignSelf: 'flex-end', borderBottomRightRadius: 2 }
                    : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, alignSelf: 'flex-start', borderBottomLeftRadius: 2 },
                ]}
              >
                <Text style={[styles.bubbleBody, { fontFamily: theme.fontBody, color: item.is_mine ? '#fff' : theme.text }]}>{item.body}</Text>
                <Text style={[styles.bubbleMeta, { fontFamily: theme.fontMono, color: item.is_mine ? 'rgba(255,255,255,0.75)' : theme.textFaint }]}>
                  {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                </Text>
              </View>
            )}
          />
        )}

        <View style={[styles.replyRow, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <TextInput
            testID="teacher-message-thread-reply-input"
            value={reply}
            onChangeText={setReply}
            placeholder={t('teacherMessages.replyPlaceholder', 'Write a reply…')}
            placeholderTextColor={theme.textFaint}
            style={[styles.replyInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody }]}
            multiline
          />
          <TouchableOpacity
            testID="teacher-message-thread-send"
            onPress={sendReply}
            disabled={!reply.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: !reply.trim() || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{t('teacherMessages.send', 'Send')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  bubble:          { maxWidth: '85%', padding: 12, borderRadius: 14, gap: 4 },
  bubbleBody:      { fontSize: 14, lineHeight: 20 },
  bubbleMeta:      { fontSize: 9, letterSpacing: 0.4 },
  replyRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1 },
  replyInput:      { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  sendBtn:         { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
