// app/teacher-messages.tsx — TEACHER/HOMESCHOOL messaging, mirroring the
// parent side (app/(tabs)/parent-dashboard.tsx's message modal) that
// already existed. backend/routes/teacher_communication.py has had a full
// send/list/thread/reply API since it was built specifically to feed the
// parent portal's existing Messages page — this is the first mobile UI
// that actually calls it. Reached from (tabs)/teacher-dashboard.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherClasses, TeacherClass } from '@/src/api/teacher';
import {
  fetchTeacherConversations, fetchClassroomRecipients, sendTeacherMessage,
  TeacherConversation, ClassroomRecipients, Recipient, MessageAudience,
} from '@/src/api/teacherMessages';

function ComposeModal({ visible, onClose, onSent, theme, t }: { visible: boolean; onClose: () => void; onSent: () => void; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<ClassroomRecipients | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [audience, setAudience] = useState<MessageAudience>('all_parents');
  const [student, setStudent] = useState<Recipient | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setClassroomId(null); setRecipients(null); setStudent(null);
    setAudience('all_parents'); setSubject(''); setBody('');
    fetchTeacherClasses().then(setClasses).catch(() => setClasses([]));
  }, [visible]);

  const pickClassroom = (id: string) => {
    setClassroomId(id);
    setRecipients(null);
    setStudent(null);
    setLoadingRecipients(true);
    fetchClassroomRecipients(id).then(setRecipients).catch(() => setRecipients({ students: [], parents: [] })).finally(() => setLoadingRecipients(false));
  };

  const valid = classroomId && subject.trim() && body.trim() && (audience === 'all_students' || audience === 'all_parents' || student);

  const submit = async () => {
    if (!valid || !classroomId) return;
    setSending(true);
    try {
      await sendTeacherMessage({
        classroom_id: classroomId,
        audience,
        student_id: student?.id,
        subject: subject.trim(),
        body: body.trim(),
      });
      onSent();
      onClose();
    } catch (e) {
      Alert.alert(t('common.error', 'Something went wrong'), e instanceof Error ? e.message : t('teacherMessages.sendError', 'Could not send this message.'));
    } finally {
      setSending(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.composeRoot, { backgroundColor: theme.bg }]}>
        <View style={[styles.composeHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.composeTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('teacherMessages.composeTitle', 'New message')}</Text>
          <TouchableOpacity testID="teacher-compose-close" onPress={onClose} hitSlop={12}>
            <Text style={{ fontSize: 18, color: theme.textMuted }}>✕</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          contentContainerStyle={{ padding: 16, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          data={[1]}
          keyExtractor={() => 'form'}
          renderItem={() => (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherMessages.classroomLabel', 'CLASSROOM')}</Text>
              <View style={styles.chipRow}>
                {classes.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    testID={`teacher-compose-classroom-${c.id}`}
                    onPress={() => pickClassroom(c.id)}
                    style={[styles.chip, { borderColor: classroomId === c.id ? theme.accent : theme.border, backgroundColor: classroomId === c.id ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
                  >
                    <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: classroomId === c.id ? theme.accent : theme.textMuted }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {classroomId && (
                loadingRecipients ? (
                  <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
                ) : (
                  <>
                    <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherMessages.audienceLabel', 'SEND TO')}</Text>
                    <View style={styles.chipRow}>
                      {(['all_parents', 'all_students'] as MessageAudience[]).map((a) => (
                        <TouchableOpacity
                          key={a}
                          testID={`teacher-compose-audience-${a}`}
                          onPress={() => { setAudience(a); setStudent(null); }}
                          style={[styles.chip, { borderColor: audience === a ? theme.accent : theme.border, backgroundColor: audience === a ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
                        >
                          <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: audience === a ? theme.accent : theme.textMuted }}>
                            {a === 'all_parents' ? t('teacherMessages.audienceAllParents', 'All parents') : t('teacherMessages.audienceAllStudents', 'All students')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.orLabel, { fontFamily: theme.fontBody, color: theme.textFaint }]}>{t('teacherMessages.orOneFamily', 'or one family:')}</Text>
                    <View style={styles.chipRow}>
                      {(recipients?.students ?? []).map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          testID={`teacher-compose-student-${s.id}`}
                          onPress={() => { setStudent(s); setAudience('parent'); }}
                          style={[styles.chip, { borderColor: student?.id === s.id ? theme.accent : theme.border, backgroundColor: student?.id === s.id ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
                        >
                          <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: student?.id === s.id ? theme.accent : theme.textMuted }}>{s.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {student && (
                      <Text style={[styles.hintText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                        {t('teacherMessages.willMessageParent', "Sends to {{name}}'s parent(s).", { name: student.name })}
                      </Text>
                    )}
                  </>
                )
              )}

              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherMessages.subjectLabel', 'SUBJECT')}</Text>
              <TextInput testID="teacher-compose-subject" style={inputStyle} value={subject} onChangeText={setSubject} placeholder={t('teacherMessages.subjectPlaceholder', 'e.g. Field trip permission slip')} placeholderTextColor={theme.textFaint} />

              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherMessages.bodyLabel', 'MESSAGE')}</Text>
              <TextInput testID="teacher-compose-body" style={[inputStyle, styles.multiline]} value={body} onChangeText={setBody} multiline placeholder={t('teacherMessages.bodyPlaceholder', 'Write your message…')} placeholderTextColor={theme.textFaint} />
            </View>
          )}
        />

        <View style={[styles.composeFooter, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity
            testID="teacher-compose-send"
            onPress={submit}
            disabled={!valid || sending}
            style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: !valid || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>{t('teacherMessages.send', 'Send')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TeacherMessagesScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<TeacherConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setConversations(await fetchTeacherConversations());
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
    <SafeAreaView testID="teacher-messages-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="teacher-messages-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherMessages.title', 'Messages')}</Text>
        <TouchableOpacity testID="teacher-messages-compose" onPress={() => setComposeOpen(true)} hitSlop={12} style={styles.composeTouchTarget} accessibilityRole="button" accessibilityLabel={t('teacherMessages.composeTitle', 'New message')}>
          <Text style={{ fontSize: 22, color: theme.accent }}>✎</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('teacherMessages.loadError', 'Could not load messages.')}</Text>
        </View>
      ) : (
        <FlatList
          testID="teacher-messages-list"
          data={conversations}
          keyExtractor={(c) => c.conversation_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>✉️</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{t('teacherMessages.empty', 'No conversations yet.')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`teacher-conversation-${item.conversation_id}`}
              onPress={() => router.push({ pathname: '/teacher-message-thread/[id]', params: { id: item.conversation_id, name: item.other_user_name } })}
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

      <ComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} onSent={load} theme={theme} t={t} />
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
  composeTouchTarget: { width: 40, alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  card:            { padding: 14, borderWidth: 1, gap: 3 },
  cardName:        { fontSize: 15 },
  cardSubject:     { fontSize: 13, fontWeight: '600' },
  cardPreview:     { fontSize: 12 },
  unreadDot:       { width: 7, height: 7, borderRadius: 4 },
  composeRoot:     { flex: 1 },
  composeHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  composeTitle:    { fontSize: 18, fontWeight: '700' },
  label:           { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  orLabel:         { fontSize: 11, marginTop: 4, marginBottom: 2 },
  hintText:        { fontSize: 12, marginTop: 4 },
  input:           { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 15 },
  multiline:       { minHeight: 90, textAlignVertical: 'top' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  composeFooter:   { padding: 16, borderTopWidth: 1 },
  sendBtn:         { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
