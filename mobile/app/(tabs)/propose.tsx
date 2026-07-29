// app/(tabs)/propose.tsx — "Propose a Challenge" (reverse scavenger hunt):
// a student writes a place-based challenge for other students to attempt.
// A teacher must approve a submission before it becomes a real Activity —
// see backend/routes/proposals.py for the full state machine.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchMyProposals, deleteProposal, Proposal, ProposalStatus } from '@/src/api/proposals';
import PeriSpeech from '@/src/components/PeriSpeech';
import ProposalFormModal from '@/src/components/ProposalFormModal';

const SUBJECT_EMOJI: Record<string, string> = {
  General: '📍', Science: '🔬', Math: '📐', History: '🏛', Art: '🎨', Language: '📖', Biology: '🌿',
};

function statusColor(status: ProposalStatus, theme: any) {
  switch (status) {
    case 'approved': return theme.accent;
    case 'rejected': return theme.warn;
    case 'pending':  return theme.textMuted;
    default:         return theme.textFaint; // draft
  }
}

export default function ProposeScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Proposal | null>(null);

  const load = useCallback(async () => {
    try {
      setProposals(await fetchMyProposals());
    } catch {
      // Best-effort — leave the previous list in place on a transient error.
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openCreate = () => { setEditing(null); setFormVisible(true); };
  const openEdit = (p: Proposal) => { setEditing(p); setFormVisible(true); };

  const onSaved = () => {
    setFormVisible(false);
    setEditing(null);
    load();
  };

  const onDelete = (p: Proposal) => {
    Alert.alert(
      t('propose.delete.title', 'Withdraw challenge?'),
      t('propose.delete.body', 'This removes it for good.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('propose.delete.confirm', 'Withdraw'),
          style: 'destructive',
          onPress: async () => { await deleteProposal(p.id).catch(() => {}); load(); },
        },
      ]
    );
  };

  const statusLabel = (status: ProposalStatus) => ({
    draft: t('propose.status.draft', 'Draft'),
    pending: t('propose.status.pending', 'Awaiting review'),
    approved: t('propose.status.approved', 'Approved'),
    rejected: t('propose.status.rejected', 'Needs changes'),
  }[status]);

  return (
    <SafeAreaView testID="propose-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('tabs.propose', 'Propose')}</Text>
      </View>

      <PeriSpeech text={t('propose.periText', "Found something worth a challenge? Write it up for other students to discover.")} theme={theme} size={36} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <FlatList
          testID="propose-list"
          data={proposals}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🧭</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('propose.empty', "No challenges yet. Propose one for other students to find in the field.")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const editable = item.status === 'draft' || item.status === 'rejected';
            return (
              <TouchableOpacity
                testID={`proposal-card-${item.id}`}
                activeOpacity={editable ? 0.75 : 1}
                onPress={() => editable && openEdit(item)}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardEmoji}>{SUBJECT_EMOJI[item.subject] ?? '📍'}</Text>
                  <Text style={[styles.entryTitle, { fontFamily: theme.fontHead, color: theme.text, flex: 1 }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={[styles.statusPill, { borderColor: statusColor(item.status, theme) }]}>
                    <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: statusColor(item.status, theme) }]}>
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.entryContent, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={2}>
                  {item.challenge_description}
                </Text>
                {!!item.location_hint && (
                  <Text style={[styles.entryMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>📍 {item.location_hint}</Text>
                )}
                {item.status === 'rejected' && !!item.teacher_feedback && (
                  <Text style={[styles.feedbackText, { fontFamily: theme.fontBody, color: theme.warn }]} numberOfLines={2}>
                    💬 {item.teacher_feedback}
                  </Text>
                )}
                {editable && (
                  <TouchableOpacity
                    testID={`proposal-delete-${item.id}`}
                    onPress={() => onDelete(item)}
                    hitSlop={8}
                    style={styles.deleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('propose.delete.confirm', 'Withdraw')}
                  >
                    <Text style={[styles.deleteLabel, { color: theme.textFaint, fontFamily: theme.fontBody }]}>{t('propose.delete.confirm', 'Withdraw')}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity
        testID="propose-new-btn"
        onPress={openCreate}
        style={[styles.fab, { backgroundColor: theme.accent, borderRadius: theme.radiusFull }]}
        accessibilityRole="button"
        accessibilityLabel={t('propose.newCta', 'New challenge')}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>

      <ProposalFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSaved={onSaved}
        theme={theme}
        editing={editing}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:        { fontSize: 28, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card:         { padding: 14, borderWidth: 1, gap: 6 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardEmoji:    { fontSize: 18 },
  entryTitle:   { fontSize: 16, fontWeight: '600' },
  entryContent: { fontSize: 13, lineHeight: 20 },
  entryMeta:    { fontSize: 11, letterSpacing: 0.4 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  feedbackText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  deleteBtn:    { alignSelf: 'flex-start', marginTop: 4 },
  deleteLabel:  { fontSize: 12, textDecorationLine: 'underline' },
  fab:          { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  fabIcon:      { fontSize: 26, color: 'white', fontWeight: '600' },
});
