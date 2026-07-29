// src/components/ProposalFormModal.tsx
// Create/edit form for a student's "reverse scavenger hunt" challenge
// proposal — a place-based challenge the student writes for other students
// to attempt, submitted for teacher approval (backend/routes/proposals.py).
// Only draft/rejected proposals are editable — pending/approved ones are
// shown read-only via ProposeScreen instead of opening this modal.

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/src/theme/tokens';
import { Proposal, ProposalInput, createProposal, updateProposal, submitProposal } from '@/src/api/proposals';
import Btn from '@/src/components/Btn';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  theme: Theme;
  editing: Proposal | null;
}

const SUBJECTS = ['General', 'Science', 'Math', 'History', 'Art', 'Language', 'Biology'];
const SUBJECT_EMOJI: Record<string, string> = {
  General: '📍', Science: '🔬', Math: '📐', History: '🏛', Art: '🎨', Language: '📖', Biology: '🌿',
};

export default function ProposalFormModal({ visible, onClose, onSaved, theme, editing }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [subject, setSubject] = useState('General');
  const [noteToTeacher, setNoteToTeacher] = useState('');
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setDescription(editing?.challenge_description ?? '');
    setLocationHint(editing?.location_hint ?? '');
    setSubject(editing?.subject ?? 'General');
    setNoteToTeacher(editing?.note_to_teacher ?? '');
  }, [visible, editing]);

  const valid = title.trim().length > 0 && description.trim().length > 0;

  const buildInput = (): ProposalInput => ({
    title: title.trim(),
    challenge_description: description.trim(),
    location_hint: locationHint.trim(),
    subject,
    note_to_teacher: noteToTeacher.trim(),
  });

  const handleSaveDraft = async () => {
    if (!valid) return;
    setSaving('draft');
    try {
      if (editing) await updateProposal(editing.id, buildInput());
      else await createProposal(buildInput());
      onSaved();
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('propose.saveError', 'Could not save your challenge.'));
    } finally {
      setSaving(null);
    }
  };

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving('submit');
    try {
      const id = editing ? editing.id : (await createProposal(buildInput())).id;
      if (editing) await updateProposal(editing.id, buildInput());
      await submitProposal(id);
      onSaved();
    } catch (e) {
      Alert.alert(t('common.error', 'Error'), e instanceof Error ? e.message : t('propose.saveError', 'Could not save your challenge.'));
    } finally {
      setSaving(null);
    }
  };

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text, fontFamily: theme.fontBody, borderRadius: theme.radiusSm },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.headerTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
            {editing ? t('propose.form.editTitle', 'Edit challenge') : t('propose.form.newTitle', 'New challenge')}
          </Text>
          <TouchableOpacity
            testID="proposal-form-close"
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', 'Close')}
          >
            <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('propose.form.titleLabel', 'CHALLENGE TITLE')}</Text>
          <TextInput
            testID="proposal-title-input"
            style={inputStyle}
            value={title}
            onChangeText={setTitle}
            placeholder={t('propose.form.titlePlaceholder', 'e.g. Find the oldest tree in the park')}
            placeholderTextColor={theme.textFaint}
          />

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('propose.form.descriptionLabel', 'WHAT SHOULD THEY DO?')}</Text>
          <TextInput
            testID="proposal-description-input"
            style={[inputStyle, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('propose.form.descriptionPlaceholder', 'Describe what to find, do, or observe…')}
            placeholderTextColor={theme.textFaint}
            multiline
          />

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('propose.form.locationLabel', 'WHERE (A GENERAL HINT)')}</Text>
          <TextInput
            testID="proposal-location-input"
            style={inputStyle}
            value={locationHint}
            onChangeText={setLocationHint}
            placeholder={t('propose.form.locationPlaceholder', 'e.g. any stream, a local park')}
            placeholderTextColor={theme.textFaint}
          />

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('propose.form.subjectLabel', 'SUBJECT')}</Text>
          <View style={styles.subjectRow}>
            {SUBJECTS.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`proposal-subject-${s}`}
                onPress={() => setSubject(s)}
                style={[
                  styles.subjectChip,
                  {
                    borderColor: subject === s ? theme.accent : theme.border,
                    backgroundColor: subject === s ? theme.accentMuted : theme.surfaceAlt,
                    borderRadius: theme.radiusFull,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: subject === s }}
              >
                <Text style={styles.subjectEmoji}>{SUBJECT_EMOJI[s]}</Text>
                <Text style={[styles.subjectLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{t('propose.form.noteLabel', 'NOTE TO YOUR TEACHER (OPTIONAL)')}</Text>
          <TextInput
            testID="proposal-note-input"
            style={[inputStyle, styles.multiline]}
            value={noteToTeacher}
            onChangeText={setNoteToTeacher}
            placeholder={t('propose.form.notePlaceholder', 'Anything your teacher should know before approving this…')}
            placeholderTextColor={theme.textFaint}
            multiline
          />

          {editing?.status === 'rejected' && editing.teacher_feedback ? (
            <View style={[styles.feedbackBox, { backgroundColor: theme.warnLight, borderColor: theme.warn }]}>
              <Text style={[styles.label, { fontFamily: theme.fontMono, color: theme.warn }]}>{t('propose.teacherFeedbackLabel', 'TEACHER FEEDBACK')}</Text>
              <Text style={[styles.feedbackText, { fontFamily: theme.fontBody, color: theme.text }]}>{editing.teacher_feedback}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <Btn
            testID="proposal-save-draft"
            label={t('propose.form.saveDraft', 'Save draft')}
            variant="secondary"
            onPress={handleSaveDraft}
            theme={theme}
            disabled={!valid || saving !== null}
            loading={saving === 'draft'}
          />
          <Btn
            testID="proposal-submit"
            label={t('propose.form.submit', 'Submit to teacher')}
            onPress={handleSubmit}
            theme={theme}
            disabled={!valid || saving !== null}
            loading={saving === 'submit'}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn:    { fontSize: 18, padding: 4 },
  body:        { padding: 16, gap: 8 },
  label:       { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  input:       { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, fontSize: 15 },
  multiline:   { minHeight: 90, textAlignVertical: 'top' },
  subjectRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subjectChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  subjectEmoji:{ fontSize: 14 },
  subjectLabel:{ fontSize: 13, fontWeight: '600' },
  feedbackBox: { marginTop: 14, padding: 12, borderWidth: 1, borderRadius: 10, gap: 4 },
  feedbackText:{ fontSize: 13, lineHeight: 19 },
  footer:      { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
});
