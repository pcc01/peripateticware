// app/teacher-calendar.tsx — TEACHER-only calendar (backend/routes/
// calendar.py's classroom_id path is TEACHER/ADMIN only — HOMESCHOOL does
// NOT get this path despite otherwise mirroring TEACHER's tabs; a
// homeschool account's calendar is app/child-calendar.tsx instead, same
// child_id path PARENT uses). Classroom picker, date-grouped event list
// (real activity sessions + explicit classroom_events), and a "+" to add
// a deadline/field trip/holiday — the one write path this API has.
// Reached from (tabs)/teacher-dashboard.tsx, TEACHER role only.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchTeacherClasses, TeacherClass } from '@/src/api/teacher';
import { fetchCalendarEvents, createClassroomEvent, deleteClassroomEvent, CalendarEvent, ClassroomEventType } from '@/src/api/calendar';
import CalendarEventList from '@/src/components/CalendarEventList';

const EVENT_TYPES: ClassroomEventType[] = ['event', 'deadline', 'field_trip', 'holiday'];
const EVENT_TYPE_LABEL: Record<ClassroomEventType, string> = {
  event: 'Event', deadline: 'Deadline', field_trip: 'Field trip', holiday: 'Holiday',
};

function AddEventModal({ visible, onClose, classroomId, onCreated, theme, t }: {
  visible: boolean; onClose: () => void; classroomId: string | null; onCreated: () => void; theme: any; t: (k: string, d: string, o?: any) => any;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<ClassroomEventType>('event');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setTitle(''); setDescription(''); setDate(new Date().toISOString().slice(0, 10)); setEventType('event'); setSaving(false); }
  }, [visible]);

  const submit = async () => {
    if (!classroomId || !title.trim()) return;
    setSaving(true);
    try {
      await createClassroomEvent({ classroom_id: classroomId, title: title.trim(), description: description.trim() || undefined, event_date: date, event_type: eventType });
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert(t('common.error', 'Something went wrong'), e instanceof Error ? e.message : t('teacherCalendar.saveError', 'Could not create this event.'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surfaceAlt, fontFamily: theme.fontBody, borderRadius: theme.radiusSm }];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}>
          <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('teacherCalendar.addTitle', 'New calendar event')}</Text>

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherCalendar.typeLabel', 'TYPE')}</Text>
          <View style={styles.chipRow}>
            {EVENT_TYPES.map((et) => (
              <TouchableOpacity
                key={et}
                testID={`teacher-calendar-type-${et}`}
                onPress={() => setEventType(et)}
                style={[styles.chip, { borderColor: eventType === et ? theme.accent : theme.border, backgroundColor: eventType === et ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
              >
                <Text style={{ fontFamily: theme.fontBody, fontSize: 12, fontWeight: '600', color: eventType === et ? theme.accent : theme.textMuted }}>{EVENT_TYPE_LABEL[et]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherCalendar.titleLabel', 'TITLE')}</Text>
          <TextInput testID="teacher-calendar-event-title" style={inputStyle} value={title} onChangeText={setTitle} placeholder={t('teacherCalendar.titlePlaceholder', 'e.g. Permission slips due')} placeholderTextColor={theme.textFaint} />

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherCalendar.dateLabel', 'DATE (YYYY-MM-DD)')}</Text>
          <TextInput testID="teacher-calendar-event-date" style={inputStyle} value={date} onChangeText={setDate} placeholder="2026-08-20" placeholderTextColor={theme.textFaint} />

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('teacherCalendar.descriptionLabel', 'DETAILS (OPTIONAL)')}</Text>
          <TextInput testID="teacher-calendar-event-description" style={[inputStyle, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholder={t('teacherCalendar.descriptionPlaceholder', 'Any extra detail…')} placeholderTextColor={theme.textFaint} />

          <View style={styles.modalFooter}>
            <TouchableOpacity testID="teacher-calendar-add-cancel" onPress={onClose} style={styles.modalGhostBtn}>
              <Text style={{ color: theme.textMuted, fontFamily: theme.fontBody }}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="teacher-calendar-add-submit"
              onPress={submit}
              disabled={!title.trim() || saving}
              style={[styles.modalPrimaryBtn, { backgroundColor: theme.accent, opacity: !title.trim() || saving ? 0.6 : 1 }]}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalPrimaryBtnText}>{t('common.add', 'Add')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TeacherCalendarScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    fetchTeacherClasses().then((cs) => {
      setClasses(cs);
      if (cs.length > 0) setClassroomId(cs[0].id);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadEvents = useCallback(async () => {
    if (!classroomId) return;
    try {
      setError(false);
      setEvents(await fetchCalendarEvents({ classroomId }));
    } catch {
      setError(true);
    }
  }, [classroomId]);

  useEffect(() => { if (classroomId) { setLoading(true); loadEvents().finally(() => setLoading(false)); } }, [classroomId, loadEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  const handleDelete = (e: CalendarEvent) => {
    Alert.alert(
      t('teacherCalendar.deleteTitle', 'Remove "{{title}}"?', { title: e.title }),
      undefined,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.remove', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClassroomEvent(e.id);
              setEvents((prev) => prev.filter((x) => x.id !== e.id));
            } catch {
              Alert.alert(t('common.error', 'Something went wrong'), t('teacherCalendar.deleteError', 'Could not remove this event.'));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView testID="teacher-calendar-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity testID="teacher-calendar-back-btn" onPress={() => router.back()} hitSlop={12} style={styles.backTouchTarget} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{t('teacherCalendar.title', 'Calendar')}</Text>
        <TouchableOpacity
          testID="teacher-calendar-add-open"
          onPress={() => setAddOpen(true)}
          disabled={!classroomId}
          hitSlop={12}
          style={styles.addTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('teacherCalendar.addTitle', 'New calendar event')}
        >
          <Text style={{ fontSize: 22, color: classroomId ? theme.accent : theme.textFaint }}>＋</Text>
        </TouchableOpacity>
      </View>

      {classes.length > 1 && (
        <View style={styles.classroomPickerRow}>
          {classes.map((c) => (
            <TouchableOpacity
              key={c.id}
              testID={`teacher-calendar-classroom-${c.id}`}
              onPress={() => setClassroomId(c.id)}
              style={[styles.chip, { borderColor: classroomId === c.id ? theme.accent : theme.border, backgroundColor: classroomId === c.id ? theme.accentMuted : theme.surfaceAlt, borderRadius: theme.radiusFull }]}
            >
              <Text style={{ fontFamily: theme.fontBody, fontSize: 13, fontWeight: '600', color: classroomId === c.id ? theme.accent : theme.textMuted }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : classes.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('teacherCalendar.noClasses', "You don't have any classes yet — set one up in the web app first.")}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{t('teacherCalendar.loadError', 'Could not load the calendar.')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}>
          <CalendarEventList events={events} theme={theme} t={t} onDelete={handleDelete} showStudentName />
        </ScrollView>
      )}

      <AddEventModal visible={addOpen} onClose={() => setAddOpen(false)} classroomId={classroomId} onCreated={loadEvents} theme={theme} t={t} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText:       { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backTouchTarget: { width: 40, alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  addTouchTarget:  { width: 40, alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 4, flexShrink: 0 },
  backArrow:       { fontSize: 28 },
  title:           { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  classroomPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip:            { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  label:           { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  input:           { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 15 },
  multiline:       { minHeight: 70, textAlignVertical: 'top' },
  chipRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:       { width: '100%', maxWidth: 440, borderWidth: 1, padding: 20 },
  modalTitle:      { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  modalFooter:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  modalGhostBtn:   { paddingVertical: 8, paddingHorizontal: 4 },
  modalPrimaryBtn:     { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 100 },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
