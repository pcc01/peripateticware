// app/(tabs)/parent-dashboard.tsx — read-only summary for PARENT accounts,
// plus linking a child by email and messaging their teacher(s). Weekly/
// monthly report exports stay web-only; this mirrors why students are
// mobile-only for field capture — each surface does the one thing it's
// actually good for. Linking and messaging moved off that web-only list
// because they're things a parent needs *before or during* anything else
// on this screen means much, and making them detour to a browser for
// either was the actual friction, not anything web-specific about either
// flow — see src/api/parent.ts's linkChild() and src/api/parentMessages.ts
// for the backend calls this wraps. Linking only ever *requests* a link
// now — the child has to approve it from their own app
// (app/(tabs)/settings.tsx's parent-requests section) before any progress
// data here becomes visible; a pending/denied child never gets a
// fetchChildProgress() call, both because the backend would 403 it and
// because showing stats for a child who hasn't consented would defeat the
// point. See app/(tabs)/_layout.tsx for how this tab is shown only when
// the signed-in account's role is PARENT.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { fetchLinkedChildren, fetchChildProgress, linkChild as apiLinkChild, unlinkChild as apiUnlinkChild, LinkedChild, ChildProgress } from '@/src/api/parent';
import { fetchNotifications, markNotificationRead, ParentNotification } from '@/src/api/notifications';
import { fetchParentMessages, replyToParentMessage, ParentMessage } from '@/src/api/parentMessages';

function ChildCard({ child, theme, t, onUnlinked }: { child: LinkedChild; theme: any; t: (k: string, d: string, o?: any) => any; onUnlinked: () => void }) {
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [loading, setLoading] = useState(child.status !== 'pending');
  const [unlinking, setUnlinking] = useState(false);
  const pending = child.status === 'pending';

  useEffect(() => {
    if (pending) return; // nothing to fetch — see file header comment
    fetchChildProgress(child.child_id)
      .then(setProgress)
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, [child.child_id, pending]);

  const confirmUnlink = () => {
    Alert.alert(
      t('parentDashboard.unlink.confirmTitle', 'Unlink {{name}}?', { name: child.child_name }),
      pending
        ? t('parentDashboard.unlink.confirmBodyPending', 'This cancels the pending request.')
        : t('parentDashboard.unlink.confirmBody', "You'll stop seeing {{name}}'s progress. You can send a new request later.", { name: child.child_name }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('parentDashboard.unlink.confirmAction', 'Unlink'),
          style: 'destructive',
          onPress: async () => {
            setUnlinking(true);
            try {
              await apiUnlinkChild(child.child_id);
              onUnlinked();
            } catch {
              Alert.alert(t('common.error', 'Something went wrong'), t('parentDashboard.unlink.error', 'Could not unlink right now. Try again.'));
              setUnlinking(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.avatarEmoji}>{child.child_avatar || '🧑'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.childName, { fontFamily: theme.fontHead, color: theme.text }]}>{child.child_name}</Text>
          <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{child.relationship}</Text>
        </View>
        {pending && (
          <View style={[styles.pendingBadge, { borderColor: theme.warn }]}>
            <Text style={[styles.pendingBadgeText, { color: theme.warn, fontFamily: theme.fontMono }]}>
              {t('parentDashboard.pendingBadge', 'AWAITING APPROVAL')}
            </Text>
          </View>
        )}
      </View>

      {pending ? (
        <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody, textAlign: 'left' }]}>
          {t('parentDashboard.pendingBody', "{{name}} needs to approve this from their own app before their progress shows up here.", { name: child.child_name })}
        </Text>
      ) : loading ? (
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

      <View style={styles.cardActionsRow}>
        {!pending && (
          <TouchableOpacity
            testID={`parent-dashboard-calendar-${child.child_id}`}
            onPress={() => router.push({ pathname: '/child-calendar', params: { childId: child.child_id, childName: child.child_name } })}
            style={styles.calendarBtn}
          >
            <Text style={[styles.calendarBtnText, { color: theme.accent, fontFamily: theme.fontBody }]}>
              {t('parentDashboard.viewCalendar', '📅 Calendar')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          testID={`parent-dashboard-unlink-${child.child_id}`}
          onPress={confirmUnlink}
          disabled={unlinking}
          style={styles.unlinkBtn}
        >
          {unlinking ? <ActivityIndicator color={theme.warn} size="small" /> : (
            <Text style={[styles.unlinkBtnText, { color: theme.warn, fontFamily: theme.fontBody }]}>
              {pending ? t('parentDashboard.unlink.cancelRequest', 'Cancel request') : t('parentDashboard.unlink.action', 'Unlink')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LinkChildModal({
  visible, onClose, onLinked, theme, t,
}: { visible: boolean; onClose: () => void; onLinked: () => void; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ name: string; alreadyApproved: boolean } | null>(null);

  // Reset to a blank form each time the modal is (re)opened rather than
  // carrying over the previous attempt's state (error, success screen).
  useEffect(() => {
    if (visible) { setEmail(''); setError(null); setSentTo(null); setSubmitting(false); }
  }, [visible]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiLinkChild(trimmed);
      setSentTo({ name: result.child?.name || trimmed, alreadyApproved: result.status === 'approved' });
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
          {sentTo ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 40 }}>{sentTo.alreadyApproved ? '✅' : '📬'}</Text>
              <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text, textAlign: 'center' }]}>
                {sentTo.alreadyApproved
                  ? t('parentDashboard.linkChild.successTitle', 'Linked!')
                  : t('parentDashboard.linkChild.pendingTitle', 'Request sent')}
              </Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted, textAlign: 'center' }]}>
                {sentTo.alreadyApproved
                  ? t('parentDashboard.linkChild.successBody', '{{name}} now appears on your dashboard.', { name: sentTo.name })
                  : t('parentDashboard.linkChild.pendingBody', "{{name}} needs to approve this from their own app before their progress appears on your dashboard.", { name: sentTo.name })}
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
                {t('parentDashboard.linkChild.body', "Enter your child's Peripateticware email address. They'll need to approve the request in their own app before their progress appears here.")}
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

function NotificationsModal({
  visible, onClose, onReadStateChanged, theme, t,
}: { visible: boolean; onClose: () => void; onReadStateChanged: () => void; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [items, setItems] = useState<ParentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchNotifications().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleTap = async (n: ParentNotification) => {
    if (n.read_at) return;
    // Optimistic — the list re-fetches from the server next time the modal
    // opens anyway, this just avoids a round-trip before the dot disappears.
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
    try {
      await markNotificationRead(n.id);
      onReadStateChanged();
    } catch {
      load(); // roll back the optimistic update by refetching real state
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.notifCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}
        >
          <View style={styles.notifHeader}>
            <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t('parentDashboard.notifications.title', 'Notifications')}
            </Text>
            <TouchableOpacity testID="parent-notifications-close" onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 18, color: theme.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
          ) : items.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody, marginVertical: 24 }]}>
              {t('parentDashboard.notifications.empty', "You're all caught up.")}
            </Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(n) => n.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item: n }) => (
                <TouchableOpacity
                  testID={`parent-notification-${n.id}`}
                  onPress={() => handleTap(n)}
                  style={[styles.notifRow, { borderColor: theme.border }]}
                >
                  {!n.read_at && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { fontFamily: theme.fontBody, color: theme.text, fontWeight: n.read_at ? '500' : '700' }]}>
                      {n.title}
                    </Text>
                    <Text style={[styles.notifBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{n.body}</Text>
                    <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint, marginTop: 4 }]}>
                      {new Date(n.created_at).toLocaleString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function MessagesModal({
  visible, onClose, theme, t,
}: { visible: boolean; onClose: () => void; theme: any; t: (k: string, d: string, o?: any) => any }) {
  const [items, setItems] = useState<ParentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<ParentMessage | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchParentMessages().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const submitReply = async () => {
    if (!replyTo || !replyBody.trim()) return;
    setSending(true);
    try {
      await replyToParentMessage(replyTo.id, replyBody.trim());
      setReplyTo(null);
      setReplyBody('');
    } catch {
      Alert.alert(t('common.error', 'Something went wrong'), t('parentDashboard.messages.replyError', 'Could not send your reply.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.notifCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}
        >
          <View style={styles.notifHeader}>
            <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t('parentDashboard.messages.title', 'Messages')}
            </Text>
            <TouchableOpacity testID="parent-messages-close" onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 18, color: theme.textMuted }}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 24 }} />
          ) : items.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody, marginVertical: 24 }]}>
              {t('parentDashboard.messages.empty', 'No messages from teachers yet.')}
            </Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: 420 }}
              renderItem={({ item: m }) => (
                <View style={[styles.notifRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, { fontFamily: theme.fontBody, color: theme.text, fontWeight: '700' }]}>{m.from_teacher_name}</Text>
                    <Text style={[styles.notifTitle, { fontFamily: theme.fontBody, color: theme.text, fontSize: 13 }]}>{m.subject}</Text>
                    <Text style={[styles.notifBody, { fontFamily: theme.fontBody, color: theme.textMuted }]}>{m.body}</Text>
                    <Text style={[styles.childMeta, { fontFamily: theme.fontMono, color: theme.textFaint, marginTop: 4 }]}>
                      {new Date(m.created_at).toLocaleString()}
                    </Text>
                    <TouchableOpacity testID={`parent-message-reply-${m.id}`} onPress={() => setReplyTo(m)} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                      <Text style={{ color: theme.accent, fontFamily: theme.fontBody, fontWeight: '600', fontSize: 12 }}>
                        {t('parentDashboard.messages.reply', 'Reply')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      <Modal visible={!!replyTo} animationType="slide" transparent onRequestClose={() => setReplyTo(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setReplyTo(null)} />
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.border, borderRadius: theme.radius }]}>
            <Text style={[styles.modalTitle, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t('parentDashboard.messages.replyTo', 'Reply to {{name}}', { name: replyTo?.from_teacher_name })}
            </Text>
            <TextInput
              testID="parent-message-reply-input"
              value={replyBody}
              onChangeText={setReplyBody}
              placeholder={t('parentDashboard.messages.replyPlaceholder', 'Write your reply…')}
              placeholderTextColor={theme.textFaint}
              multiline
              style={[styles.input, styles.multilineInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface, marginTop: 12 }]}
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity testID="parent-message-reply-cancel" onPress={() => setReplyTo(null)} style={styles.modalGhostBtn}>
                <Text style={{ color: theme.textMuted, fontFamily: theme.fontBody }}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="parent-message-reply-submit"
                onPress={submitReply}
                disabled={sending || !replyBody.trim()}
                style={[styles.modalPrimaryBtn, { backgroundColor: theme.accent, opacity: sending || !replyBody.trim() ? 0.6 : 1 }]}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalPrimaryBtnText}>{t('parentDashboard.messages.send', 'Send')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [messagesModalOpen, setMessagesModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Denied requests aren't shown at all — a declined child isn't "in
  // limbo" the way pending is, and the parent can always send a fresh
  // request (see link_child()'s docstring: a re-request reopens a denied
  // row to pending, it isn't blocked).
  const visibleChildren = children.filter((c) => c.status !== 'denied');

  const load = useCallback(async () => {
    try {
      setError(false);
      setChildren(await fetchLinkedChildren());
    } catch {
      setError(true);
    }
  }, []);

  const loadUnreadCount = useCallback(() => {
    fetchNotifications(true).then((items) => setUnreadCount(items.length)).catch(() => {});
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); loadUnreadCount(); }, [load, loadUnreadCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), Promise.resolve(loadUnreadCount())]);
    setRefreshing(false);
  }, [load, loadUnreadCount]);

  return (
    <SafeAreaView testID="parent-dashboard-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, styles.headerRow]}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{t('parentDashboard.title', 'My Children')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            testID="parent-dashboard-messages-open"
            onPress={() => setMessagesModalOpen(true)}
            style={styles.bellBtn}
            accessibilityLabel={t('parentDashboard.messages.title', 'Messages')}
          >
            <Text style={{ fontSize: 20 }}>✉️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="parent-dashboard-notifications-open"
            onPress={() => setNotifModalOpen(true)}
            style={styles.bellBtn}
            accessibilityLabel={t('parentDashboard.notifications.title', 'Notifications')}
          >
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.warn }]}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
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
          {visibleChildren.length === 0 ? (
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
            visibleChildren.map((child) => <ChildCard key={child.id} child={child} theme={theme} t={t} onUnlinked={load} />)
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
      <NotificationsModal
        visible={notifModalOpen}
        onClose={() => setNotifModalOpen(false)}
        onReadStateChanged={loadUnreadCount}
        theme={theme}
        t={t}
      />
      <MessagesModal
        visible={messagesModalOpen}
        onClose={() => setMessagesModalOpen(false)}
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
  pendingBadge:     { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 8, letterSpacing: 0.6, fontWeight: '700' },
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
  unlinkBtn:     { alignSelf: 'flex-start', marginTop: 4 },
  unlinkBtnText: { fontSize: 12, fontWeight: '600' },
  cardActionsRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  calendarBtn:     { alignSelf: 'flex-start' },
  calendarBtnText: { fontSize: 12, fontWeight: '600' },
  linkChildBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  linkChildBtnText: { fontSize: 12, fontWeight: '700' },
  headerActions:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn:        { padding: 4, position: 'relative' },
  unreadBadge:      { position: 'absolute', top: -2, right: -4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  unreadBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '700' },
  notifCard:      { width: '100%', maxWidth: 440, maxHeight: '80%', borderWidth: 1, padding: 20 },
  notifHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  notifRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  unreadDot:      { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  notifTitle:     { fontSize: 14, marginBottom: 2 },
  notifBody:      { fontSize: 12, lineHeight: 17 },
  modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:      { width: '100%', maxWidth: 440, borderWidth: 1, padding: 20 },
  modalTitle:     { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  input:          { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4 },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  errorText:      { color: '#dc2626', fontSize: 12, marginTop: 6 },
  modalFooter:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  modalGhostBtn:  { paddingVertical: 8, paddingHorizontal: 4 },
  modalPrimaryBtn:     { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 100 },
  modalPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
