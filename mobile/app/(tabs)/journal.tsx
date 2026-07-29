// app/(tabs)/journal.tsx — "My Journal Entries": saved reflections + captures
// across every activity the student has worked on (draft or submitted).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeContext';
import type { Theme } from '@/src/theme/tokens';
import { fetchJournal, JournalEntry } from '@/src/api/journal';
import { fetchCaptures, Capture } from '@/src/api/captures';
import { getCachedActivity } from '@/src/db/activityCache';
import { useTranslation } from 'react-i18next';

// Same capture_type → emoji mapping CaptureSheet.tsx uses for its mode picker
// (photo/audio/note[text]/video). Falls back to a generic icon for any other
// backend capture_type (e.g. sketch, measurement) so rendering never breaks.
const CAPTURE_TYPE_EMOJI: Record<string, string> = {
  photo: '📷',
  audio: '🎤',
  text: '✏️',
  note: '✏️',
  video: '🎥',
};
const CAPTURE_TYPE_EMOJI_FALLBACK = '📎';

// Capture types that carry a transcript (audio/video only — photo/note/text
// have nothing to transcribe).
const TRANSCRIBABLE_TYPES = new Set(['audio', 'video']);

/** Entry body is where/why/how + learning_insights + next_steps — join
 * whichever of those the student actually filled in, in a sensible order. */
function entryContent(entry: JournalEntry): string {
  return [entry.learning_insights, entry.where_notes, entry.why_notes, entry.how_notes, entry.next_steps]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join('\n\n');
}

/** Expandable per-entry captures list. Fetches on-demand, only when the user
 * expands the section — never on initial journal list load (avoids an N+1
 * request storm across every visible journal entry). */
function EntryCaptures({ activityId, theme }: { activityId: string; theme: Theme }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [captures, setCaptures] = useState<Capture[]>([]);

  const toggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      try {
        const data = await fetchCaptures(activityId);
        setCaptures(data);
      } catch {
        setCaptures([]);
      } finally {
        setLoaded(true);
        setLoading(false);
      }
    }
  }, [expanded, loaded, loading, activityId]);

  return (
    <View style={styles.capturesSection}>
      <TouchableOpacity
        testID="journal-captures-toggle"
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('journal.hideCaptures', 'Hide captures') : t('journal.showCaptures', 'Show captures')}
        accessibilityState={{ expanded }}
        style={styles.capturesToggle}
      >
        <Text style={[styles.capturesToggleText, { fontFamily: theme.fontBody, color: theme.accent }]}>
          {expanded ? `▾ ${t('journal.hideCaptures', 'Hide captures')}` : `▸ ${t('journal.showCaptures', 'Show captures')}`}
        </Text>
      </TouchableOpacity>

      {expanded && (
        loading ? (
          <View style={styles.capturesLoading}>
            <ActivityIndicator color={theme.accent} size="small" />
          </View>
        ) : captures.length === 0 ? (
          <Text style={[styles.noCapturesText, { fontFamily: theme.fontBody, color: theme.textFaint }]}>
            {t('journal.noCaptures', 'No captures yet.')}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {captures.map((c) => (
              <View
                key={c.id}
                style={[styles.captureRow, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: theme.radiusSm }]}
              >
                <View style={styles.captureRowHeader}>
                  <Text style={styles.captureEmoji}>
                    {CAPTURE_TYPE_EMOJI[c.capture_type] ?? CAPTURE_TYPE_EMOJI_FALLBACK}
                  </Text>
                  <Text style={[styles.captureTimestamp, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {TRANSCRIBABLE_TYPES.has(c.capture_type) && (
                  <Text style={[styles.captureTranscript, { fontFamily: theme.fontBody, color: c.transcript ? theme.textMuted : theme.textFaint }]}>
                    {c.transcript ?? t('journal.transcriptPending', 'Transcript pending…')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )
      )}
    </View>
  );
}

export default function JournalScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activityTitles, setActivityTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const label = t('journal.title', 'My Journal Entries');

  const load = useCallback(async () => {
    const data = await fetchJournal();
    setEntries(data);

    // Best-effort activity-title lookup from the local offline cache (no
    // network call) so cards read as "Bug hunt at Cedar Park" instead of a
    // bare date. Silently falls back to a generic label if not cached.
    const ids = Array.from(new Set(data.map((e) => e.activity_id).filter((v): v is string => !!v)));
    const missing = ids.filter((aid) => !(aid in activityTitles));
    if (missing.length > 0) {
      const resolved = await Promise.all(missing.map(async (aid) => {
        const cached = await getCachedActivity(aid).catch(() => null);
        return [aid, cached?.title] as const;
      }));
      setActivityTitles((prev) => {
        const next = { ...prev };
        for (const [aid, title] of resolved) if (title) next[aid] = title;
        return next;
      });
    }
  }, [activityTitles]);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView testID="journal-screen" style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{label}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <FlatList
          testID="journal-list"
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📓</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {t('journal.empty', "Nothing here yet.\nSave or submit an activity to see your work.")}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const content = entryContent(item);
            const title = (item.activity_id && activityTitles[item.activity_id])
              ?? t('journal.fallbackTitle', 'Field Note');
            return (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.entryTitle, { fontFamily: theme.fontHead, color: theme.text, flex: 1 }]} numberOfLines={2}>
                    {title}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: item.is_submitted ? theme.accentMuted : theme.surfaceAlt, borderColor: theme.border }]}>
                    <Text style={[styles.statusPillText, { fontFamily: theme.fontMono, color: item.is_submitted ? theme.accent : theme.textFaint }]}>
                      {item.is_submitted ? t('journal.submitted', 'Submitted') : t('journal.draft', 'Draft')}
                    </Text>
                  </View>
                </View>
                {content && (
                  <Text style={[styles.entryContent, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={3}>
                    {content}
                  </Text>
                )}
                <Text style={[styles.entryMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                  {new Date(item.updated_at ?? item.created_at).toLocaleDateString()}
                </Text>
                {!!item.activity_id && (
                  <EntryCaptures activityId={item.activity_id} theme={theme} />
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title:        { fontSize: 24, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card:         { padding: 14, borderWidth: 1, gap: 6 },
  cardHeaderRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  entryTitle:   { fontSize: 16, fontWeight: '600' },
  entryContent: { fontSize: 13, lineHeight: 20 },
  entryMeta:    { fontSize: 10, letterSpacing: 0.8 },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusPillText:  { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },

  capturesSection:    { marginTop: 4 },
  capturesToggle:     { paddingVertical: 4 },
  capturesToggleText: { fontSize: 12, fontWeight: '600' },
  capturesLoading:    { paddingVertical: 10, alignItems: 'flex-start' },
  noCapturesText:     { fontSize: 12, paddingVertical: 4 },
  captureRow:         { padding: 10, borderWidth: 1, gap: 4 },
  captureRowHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  captureEmoji:       { fontSize: 16 },
  captureTimestamp:   { fontSize: 10, letterSpacing: 0.6 },
  captureTranscript:  { fontSize: 12, lineHeight: 18 },
});
