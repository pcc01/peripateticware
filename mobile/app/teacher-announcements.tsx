// app/teacher-announcements.tsx — TEACHER side of classroom-wide
// announcements. Mirrors app/teacher-messages.tsx's list+compose-modal
// pattern, but announcements are scoped to one classroom at a time (the
// backend has no "all my classrooms" list endpoint — see
// backend/routes/teacher_communication.py's get/create, both keyed by
// classroom_id) and are one-way broadcasts: no reply, no audience picker.
// Reached from (tabs)/teacher-dashboard.tsx. The receiving side is
// app/student-announcements.tsx.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchMyClassrooms, Classroom } from '@/src/api/classrooms';
import { fetchClassroomAnnouncements, createClassroomAnnouncement, TeacherAnnouncement } from '@/src/api/teacherAnnouncements';
import CollapsibleSection from '@/src/components/CollapsibleSection';

function ComposeModal({ visible, onClose, onSent, classes, theme, t }: { visible: boolean; onClose: () => void; onSent: () => void; classes: Classroom[]; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // BUG FIX (2026-09-15): same shape as teacher-messages.tsx's
    // ComposeModal — classroomId used to stay null until the teacher
    // explicitly tapped a classroom chip, which `valid` requires, so Post
    // stayed silently disabled when there was only one classroom to pick
    // ("I can write the message but I can't send it"). Auto-select instead.
    setClassroomId(classes.length > 0 ? classes[0].id : null);
    setTitle(''); setBody('');
  }, [visible, classes]);

  const valid = classroomId && title.trim() && body.trim();

  const submit = async () => {
    if (!valid || !classroomId) return;
    setSending(true);
    try {
      await createClassroomAnnouncement(classroomId, title.trim(), body.trim());
      onSent();
      onClose();
    } catch (e) {
      Alert.alert(t('common.error', 'Something went wrong'), e instanceof Error ? e.message : t('teacherAnnouncements.sendError', 'Could not post this announcement.'));
    } finally {
      setSending(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.composeRoot, { backgroundColor: theme.bg }]}>
        <View style={[styles.composeHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.composeTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('teacherAnnouncements.composeTitle', 'New announcement')}</Text>
          <TouchableOpacity testID="teacher-announcement-compose-close" onPress={onClose} hitSlop={12}>
            <Text style={{ fontSize: 18, color: theme.textMuted }}>✕</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          // Same flex:1 fix as teacher-messages.tsx's ComposeModal — a
          // FlatList with only contentContainerStyle doesn't shrink for the
          // keyboard on iOS, hiding the fixed Post footer below it.
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          keyboardShouldPersistTaps="handled"
          data={[1]}
          keyExtractor={() => 'form'}
          renderItem={() => (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherAnnouncements.classroomLabel', 'CLASSROOM')}</Text>
              <View style={styles.chipRow}>
                {classes.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    testID={`teacher-announcement-compose-classroom-${c.id}`}
                    onPress={() => setClassroomId(c.id)}
                    style={[styles.chip, { borderColor: classroomId === c.id ? theme.accent : theme.border, backgroundColor: classroomId === c.id ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
                  >
                    <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: classroomId === c.id ? theme.accent : theme.textMuted }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {classes.length === 0 && (
                <Text style={[styles.hintText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                  {t('teacherAnnouncements.noClassrooms', "You don't have any classrooms yet — set one up on the web app first, then come back here to post one.")}
                </Text>
              )}

              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherAnnouncements.titleLabel', 'TITLE')}</Text>
              <TextInput testID="teacher-announcement-compose-title" style={inputStyle} value={title} onChangeText={setTitle} placeholder={t('teacherAnnouncements.titlePlaceholder', 'e.g. No school Friday')} placeholderTextColor={theme.textFaint} />

              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherAnnouncements.bodyLabel', 'ANNOUNCEMENT')}</Text>
              <TextInput testID="teacher-announcement-compose-body" style={[inputStyle, styles.multiline]} value={body} onChangeText={setBody} multiline placeholder={t('teacherAnnouncements.bodyPlaceholder', 'Write your announcement…')} placeholderTextColor={theme.textFaint} />

              <Text style={[styles.hintText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {t('teacherAnnouncements.hint', 'Visible to every student and linked parent in this classroom. One-way — they can’t reply.')}
              </Text>
            </View>
          )}
        />

        <View style={[styles.composeFooter, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <TouchableOpacity
            testID="teacher-announcement-compose-send"
            onPress={submit}
            disabled={!valid || sending}
            style={[styles.sendBtn, { backgroundColor: theme.accent, opacity: !valid || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>{t('teacherAnnouncements.post', 'Post')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface ClassGroup {
  classroom: Classroom;
  items: TeacherAnnouncement[];
}

export default function TeacherAnnouncementsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [classes, setClasses] = useState<Classroom[]>([]);
  // Announcements for every classroom at once, keyed by classroom_id — the
  // backend only offers a per-classroom GET, so the "class > announcement"
  // grouped view (2026-09-15) fetches each classroom's list in parallel and
  // groups client-side, rather than requiring the teacher to pick one
  // classroom at a time just to browse.
  const [byClassroom, setByClassroom] = useState<Record<string, TeacherAnnouncement[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const cs = await fetchMyClassrooms();
      setClasses(cs);
      const results = await Promise.all(
        cs.map((c) => fetchClassroomAnnouncements(c.id).catch(() => [] as TeacherAnnouncement[]))
      );
      const map: Record<string, TeacherAnnouncement[]> = {};
      cs.forEach((c, i) => { map[c.id] = results[i]; });
      setByClassroom(map);
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

  const groups = useMemo<ClassGroup[]>(() => {
    return classes
      .map((c) => ({ classroom: c, items: byClassroom[c.id] ?? [] }))
      .sort((a, b) => a.classroom.name.localeCompare(b.classroom.name));
  }, [classes, byClassroom]);

  const totalAnnouncements = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups]
  );

  return (
    <SafeAreaView testID="teacher-announcements-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="teacher-announcements-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherAnnouncements.title', 'Announcements')}</Text>
        <TouchableOpacity testID="teacher-announcements-compose" onPress={() => setComposeOpen(true)} hitSlop={12} style={styles.composeTouchTarget} accessibilityRole="button" accessibilityLabel={t('teacherAnnouncements.composeTitle', 'New announcement')}>
          <Text style={{ fontSize: 22, color: theme.accent }}>✎</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('teacherAnnouncements.loadError', 'Could not load announcements.')}</Text>
        </View>
      ) : classes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📣</Text>
          <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
            {t('teacherAnnouncements.noClassrooms', "You don't have any classrooms yet — set one up on the web app first, then come back here to post one.")}
          </Text>
        </View>
      ) : totalAnnouncements === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📣</Text>
          <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{t('teacherAnnouncements.empty', 'No announcements yet for this classroom.')}</Text>
        </View>
      ) : (
        <ScrollView
          testID="teacher-announcements-list"
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {groups.map((group) => (
            <CollapsibleSection
              key={group.classroom.id}
              testID={`teacher-announcements-group-${group.classroom.id}`}
              title={group.classroom.name}
              count={group.items.length}
              theme={theme}
            >
              {group.items.length === 0 ? (
                <Text style={[styles.hintText, { color: theme.textFaint, fontFamily: theme.fontBody, paddingHorizontal: 4 }]}>
                  {t('teacherAnnouncements.emptyGroup', 'Nothing posted to this class yet.')}
                </Text>
              ) : (
                group.items.map((item) => (
                  <View
                    key={item.id}
                    testID={`teacher-announcement-${item.id}`}
                    style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: theme.radiusSm }]}
                  >
                    <Text style={[styles.cardTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.cardBody, { fontFamily: theme.fontBody, color: theme.text }]}>{item.body}</Text>
                    <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                    </Text>
                  </View>
                ))
              )}
            </CollapsibleSection>
          ))}
        </ScrollView>
      )}

      <ComposeModal visible={composeOpen} onClose={() => setComposeOpen(false)} onSent={load} classes={classes} theme={theme} t={t} />
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
  card:            { padding: 14, borderWidth: 1, gap: 4 },
  cardTitle:       { fontSize: 15, fontWeight: '700' },
  cardBody:        { fontSize: 13, lineHeight: 19 },
  cardMeta:        { fontSize: 10, letterSpacing: 0.4 },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  composeRoot:     { flex: 1 },
  composeHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  composeTitle:    { fontSize: 18, fontWeight: '700' },
  label:           { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  hintText:        { fontSize: 12, marginTop: 4, lineHeight: 17 },
  input:           { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 15 },
  multiline:       { minHeight: 90, textAlignVertical: 'top' },
  composeFooter:   { padding: 16, borderTopWidth: 1 },
  sendBtn:         { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});
