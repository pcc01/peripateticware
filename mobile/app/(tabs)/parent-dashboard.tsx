// app/(tabs)/parent-dashboard.tsx — read-only summary for PARENT accounts,
// plus linking a child by email. Messaging and weekly/monthly report
// exports stay web-only; this mirrors why students are mobile-only for
// field capture — each surface does the one thing it's actually good for.
// Linking moved off that web-only list because it's the one action a
// parent needs *before* anything else on this screen means anything, and
// making them detour to a browser just to type an email address was the
// actual friction, not anything web-specific about the flow itself — see
// src/api/parent.ts's linkChild() for the (email-only, no verification
// step) backend call this wraps. See app/(tabs)/_layout.tsx for how this
// tab is shown only when the signed-in account's role is PARENT.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchLinkedChildren, fetchChildProgress, linkChild as apiLinkChild, LinkedChild, ChildProgress } from '@/src/api/parent';

function ChildCard({ child, theme, t }: { child: LinkedChild; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChildProgress(child.child_id)
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, [child.child_id]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.avatarEmoji}>{child.child_avatar || '🧑'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.childName, { fontFamily: theme.fontHead, color: theme.text }]}>{child.child_name}</Text>
          <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{child.relationship}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginVertical: 10 }} />
      ) : !progress ? (
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
          {t('parentDashboard.progressUnavailable', "Could not load this child's progress.")}
        </Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            {[
              { label: t('parentDashboard.stats.activities', 'Activities'), value: progress.activities_completed },
              { label: t('parentDashboard.stats.hours', 'Hours'), value: progress.hours_learned.toFixed(1) },
              { label: t('parentDashboard.stats.engagement', 'Engagement'), value: `${progress.engagement_score}%` },
            ].map((stat) => (
              <View key={stat.label} style={styles.statCol}>
                <Text style={[styles.statValue, { fontFamily: theme.fontHead, color: theme.text }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{stat.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          {progress.competencies.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              {progress.competencies.map((c, i) => (
                <View key={i} style={styles.compRow}>
                  <Text style={[styles.compName, { fontFamily: theme.fontBody, color: theme.text }]} numberOfLines={1}>{c.name}</Text>
                  <View style={[styles.barBg, { backgroundColor: theme.border, borderRadius: 4 }]}>
                    <View style={[styles.barFill, { backgroundColor: theme.accent, borderRadius: 4, width: `${(c.level / c.max_level) * 100}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.lastActive, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
            {t('parentDashboard.lastActive', 'Last active: {{date}}', { date: new Date(progress.last_active).toLocaleDateString() })}
          </Text>
        </>
      )}
    </View>
  );
}

function LinkChildModal({
  visible, onClose, onLinked, theme, t,
}: { visible: boolean; onClose: () => void; onLinked: () => void; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedName, setLinkedName] = useState<string | null>(null);

  // Reset to a blank form each time the modal is (re)opened rather than
  // carrying over the previous attempt's state (error, success screen).
  useEffect(() => {
    if (visible) { setEmail(''); setError(null); setLinkedName(null); setSubmitting(false); }
  }, [visible]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiLinkChild(trimmed);
      setLinkedName(result.child?.name || trimmed);
      onLinked();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('parentDashboard.linkChild.genericError', 'Could not link that account. Check the email and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalBackdrop}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}>
          {linkedName ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text, textAlign: 'center' }]}>
                {t('parentDashboard.linkChild.successTitle', 'Linked!')}
              </Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'center' }]}>
                {t('parentDashboard.linkChild.successBody', '{{name}} now appears on your dashboard.', { name: linkedName })}
              </Text>
              <TouchableOpacity
                testID="parent-link-child-done"
                onPress={onClose}
                style={[styles.modalPrimaryBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.modalPrimaryBtnText}>{t('common.done', 'Done')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
                {t('parentDashboard.linkChild.title', 'Link a child')}
              </Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'left', marginBottom: 16 }]}>
                {t('parentDashboard.linkChild.body', "Enter your child's Peripateticware email address. Their progress will appear on this dashboard right away.")}
              </Text>
              <TextInput
                testID="parent-link-child-email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('parentDashboard.linkChild.emailPlaceholder', "Child's email address")}
                placeholderTextColor={theme.textFaint}
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                onSubmitEditing={submit}
                returnKeyType="send"
              />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.modalFooter}>
                <TouchableOpacity testID="parent-link-child-cancel" onPress={onClose} style={styles.modalGhostBtn}>
                  <Text style={{ color: theme.textMuted, fontFamily: theme.fontBody }}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="parent-link-child-submit"
                  onPress={submit}
                  disabled={submitting || !email.trim()}
                  style={[styles.modalPrimaryBtn, { backgroundColor: theme.accent, opacity: submitting || !email.trim() ? 0.6 : 1 }]}
                >
                  {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={styles.modalPrimaryBtnText}>{t('parentDashboard.linkChild.submit', 'Link child')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ParentDashboardScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setChildren(await fetchLinkedChildren());
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
    <SafeAreaView testID="parent-dashboard-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, styles.headerRow]}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('parentDashboard.title', 'My Children')}</Text>
        <TouchableOpacity
          testID="parent-dashboard-link-child-open"
          onPress={() => setLinkModalOpen(true)}
          style={[styles.linkChildBtn, { borderColor: theme.accent }]}
        >
          <Text style={[styles.linkChildBtnText, { color: theme.accent, fontFamily: theme.fontBody }]}>
            {t('parentDashboard.linkChild.headerButton', '+ Link a child')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
            {t('parentDashboard.loadError', 'Could not load your dashboard.')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        >
          {children.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>👨‍👩‍👧</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('parentDashboard.empty', "No children linked yet. Link your child's account to see their progress here.")}
              </Text>
              <TouchableOpacity
                testID="parent-dashboard-empty-link-child"
                onPress={() => setLinkModalOpen(true)}
                style={[styles.modalPrimaryBtn, { backgroundColor: theme.accent, marginTop: 4 }]}
              >
                <Text style={styles.modalPrimaryBtnText}>{t('parentDashboard.linkChild.headerButton', '+ Link a child')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            children.map((child) => <ChildCard key={child.id} child={child} theme={theme} t={t} />)
          )}
        </ScrollView>
      )}

      <LinkChildModal
        visible={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onLinked={load}
        theme={theme}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title:        { fontSize: 28, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card:         { padding: 14, borderWidth: 1, gap: 10 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarEmoji:  { fontSize: 32 },
  childName:    { fontSize: 17, fontWeight: '700' },
  childMeta:    { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  statsRow:     { flexDirection: 'row', justifyContent: 'space-around' },
  statCol:      { alignItems: 'center', gap: 2 },
  statValue:    { fontSize: 18, fontWeight: '700' },
  statLabel:    { fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase' },
  compRow:      { gap: 4 },
  compName:     { fontSize: 12 },
  barBg:        { height: 6 },
  barFill:      { height: 6 },
  lastActive:   { fontSize: 10, letterSpacing: 0.4, marginTop: 4 },
  linkChildBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  linkChildBtnText: { fontSize: 12, fontWeight: '700' },
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:      { width: '100%', maxWidth: 440, borderWidth: 1, padding: 20 },
  modalTitle:     { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  input:          { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4 },
  errorText:      { color: '#dc2626', fontSize: 12, marginTop: 6 },
  modalFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  modalGhostBtn:  { paddingVertical: 8, paddingHorizontal: 4 },
  modalPrimaryBtn:     { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 100 },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
