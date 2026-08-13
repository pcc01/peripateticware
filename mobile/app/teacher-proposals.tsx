// app/teacher-proposals.tsx — TEACHER/HOMESCHOOL review queue for student
// "reverse scavenger hunt" proposals (app/(tabs)/propose.tsx on the
// student side). Backend already had GET/POST /api/v1/teacher/proposals
// endpoints with no mobile screen calling them at all — a teacher could
// only approve/reject from the web app, even though the student half of
// this exact feature has been mobile-native the whole time. Approving
// creates a published Activity (activity_type='discovery') automatically;
// nothing further to do here afterward.
//
// Reached from (tabs)/teacher-dashboard.tsx, same push-screen pattern as
// teacher-submissions.tsx/teacher-classes.tsx.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchPendingProposals, approveProposal, rejectProposal, PendingProposal } from '@/src/api/proposalReview';

export default function TeacherProposalsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingProposal | null>(null);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      setError(false);
      setProposals(await fetchPendingProposals());
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

  const handleApprove = (p: PendingProposal) => {
    Alert.alert(
      t('teacherProposals.approveTitle', 'Approve "{{title}}"?', { title: p.title }),
      t('teacherProposals.approveBody', 'This publishes it as a real activity students can attempt right away.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.approve', 'Approve'),
          onPress: async () => {
            setActingOn(p.id);
            try {
              await approveProposal(p.id);
              setProposals((prev) => prev.filter((x) => x.id !== p.id));
            } catch {
              Alert.alert(t('common.error', 'Something went wrong'), t('teacherProposals.actionError', 'Please try again.'));
            } finally {
              setActingOn(null);
            }
          },
        },
      ]
    );
  };

  const submitRejection = async () => {
    if (!rejecting) return;
    setActingOn(rejecting.id);
    try {
      await rejectProposal(rejecting.id, feedback.trim());
      setProposals((prev) => prev.filter((x) => x.id !== rejecting.id));
      setRejecting(null);
      setFeedback('');
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('teacherProposals.actionError', 'Please try again.'));
    } finally {
      setActingOn(null);
    }
  };

  return (
    <SafeAreaView testID="teacher-proposals-screen" style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          testID="teacher-proposals-back-btn"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backTouchTarget}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Back')}
        >
          <Text style={[styles.backArrow, { color: theme.accent }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>
          {t('teacherProposals.title', 'Student Proposals')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('teacherProposals.loadError', 'Could not load proposals.')}
          </Text>
        </View>
      ) : (
        <FlatList
          testID="teacher-proposals-list"
          data={proposals}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🧭</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('teacherProposals.empty', 'No proposals waiting on you.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.cardTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{item.title}</Text>
              <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {t('teacherProposals.byStudent', 'By {{name}} · {{subject}}', { name: item.student_name, subject: item.subject })}
              </Text>
              <Text style={[styles.cardBody, { fontFamily: theme.fontBody, color: theme.text }]}>{item.challenge_description}</Text>
              {!!item.location_hint && (
                <Text style={[styles.cardHint, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  📍 {item.location_hint}
                </Text>
              )}
              {!!item.note_to_teacher && (
                <View style={[styles.noteBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <Text style={[styles.cardMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                    {t('teacherProposals.noteLabel', 'NOTE TO YOU')}
                  </Text>
                  <Text style={[styles.cardBody, { fontFamily: theme.fontBody, color: theme.text }]}>{item.note_to_teacher}</Text>
                </View>
              )}

              {actingOn === item.id ? (
                <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />
              ) : (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    testID={`teacher-proposal-reject-${item.id}`}
                    onPress={() => setRejecting(item)}
                    style={[styles.actionBtn, { borderColor: theme.warn }]}
                  >
                    <Text style={{ color: theme.warn, fontFamily: theme.fontBody, fontWeight: '600' }}>{t('common.reject', 'Reject')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`teacher-proposal-approve-${item.id}`}
                    onPress={() => handleApprove(item)}
                    style={[styles.actionBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
                  >
                    <Text style={{ color: '#fff', fontFamily: theme.fontBody, fontWeight: '600' }}>{t('common.approve', 'Approve')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={!!rejecting} animationType="slide" transparent onRequestClose={() => setRejecting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setRejecting(null)} />
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.cardTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t('teacherProposals.rejectTitle', 'Feedback for {{name}}', { name: rejecting?.student_name })}
            </Text>
            <Text style={[styles.cardMeta, { fontFamily: theme.fontBody, color: theme.textMuted, marginBottom: 10 }]}>
              {t('teacherProposals.rejectBody', "They'll see this and can revise + resubmit.")}
            </Text>
            <TextInput
              testID="teacher-proposal-reject-feedback"
              value={feedback}
              onChangeText={setFeedback}
              placeholder={t('teacherProposals.rejectPlaceholder', 'e.g. Too close to another activity — try a different landmark')}
              placeholderTextColor={theme.textFaint}
              multiline
              style={[styles.feedbackInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity testID="teacher-proposal-reject-cancel" onPress={() => setRejecting(null)} style={styles.ghostBtn}>
                <Text style={{ color: theme.textMuted, fontFamily: theme.fontBody }}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="teacher-proposal-reject-submit"
                onPress={submitRejection}
                style={[styles.actionBtn, { backgroundColor: theme.warn, borderColor: theme.warn }]}
              >
                <Text style={{ color: '#fff', fontFamily: theme.fontBody, fontWeight: '600' }}>{t('teacherProposals.sendFeedback', 'Send')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  card:            { padding: 14, borderWidth: 1, gap: 6 },
  cardTitle:       { fontSize: 16, fontWeight: '700' },
  cardMeta:        { fontSize: 10, letterSpacing: 0.6 },
  cardBody:        { fontSize: 13, lineHeight: 19 },
  cardHint:        { fontSize: 12, fontStyle: 'italic' },
  noteBox:         { marginTop: 6, padding: 10, borderWidth: 1, borderRadius: 8, gap: 4 },
  actionsRow:      { flexDirection: 'row', gap: 10, marginTop: 8, justifyContent: 'flex-end' },
  actionBtn:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  ghostBtn:        { paddingVertical: 8, paddingHorizontal: 4 },
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:       { width: '100%', maxWidth: 440, borderWidth: 1, padding: 20 },
  feedbackInput:   { minHeight: 90, borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, textAlignVertical: 'top' },
});
