// app/(tabs)/journal.tsx — Field notes + captures journal

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeContext';
import type { Theme } from '@/src/theme/tokens';
import { fetchJournal, JournalEntry } from '@/src/api/journal';
import { fetchCaptures, Capture } from '@/src/api/captures';

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

/** Expandable per-entry captures list. Fetches on-demand, only when the user
 * expands the section — never on initial journal list load (avoids an N+1
 * request storm across every visible journal entry). */
function EntryCaptures({ activityId, theme }: { activityId: string; theme: Theme }) {
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
        accessibilityLabel={expanded ? 'Hide captures' : 'Show captures'}
        accessibilityState={{ expanded }}
        style={styles.capturesToggle}
      >
        <Text style={[styles.capturesToggleText, { fontFamily: theme.fontBody, color: theme.accent }]}>
          {expanded ? '▾ Hide captures' : '▸ Show captures'}
        </Text>
      </TouchableOpacity>

      {expanded && (
        loading ? (
          <View style={styles.capturesLoading}>
            <ActivityIndicator color={theme.accent} size="small" />
          </View>
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
                    {c.transcript ?? 'Transcript pending…'}
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
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const label = 'Field Notes';

  const load = useCallback(async () => {
    const data = await fetchJournal();
    setEntries(data);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

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
                No field notes yet.{'\n'}Complete an activity to start your journal.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
              <Text style={[styles.entryTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>
                {item.title ?? item.activity_title ?? 'Field Note'}
              </Text>
              {item.content && (
                <Text style={[styles.entryContent, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={3}>
                  {item.content}
                </Text>
              )}
              <Text style={[styles.entryMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {new Date(item.created_at).toLocaleDateString()}
                {item.captures_count ? ` · ${item.captures_count} captures` : ''}
              </Text>
              {!!item.captures_count && item.captures_count > 0 && !!item.activity_id && (
                <EntryCaptures activityId={item.activity_id} theme={theme} />
              )}
            </View>
          )}
        />
      )}
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
  entryTitle:   { fontSize: 16, fontWeight: '600' },
  entryContent: { fontSize: 13, lineHeight: 20 },
  entryMeta:    { fontSize: 10, letterSpacing: 0.8 },

  capturesSection:    { marginTop: 4 },
  capturesToggle:     { paddingVertical: 4 },
  capturesToggleText: { fontSize: 12, fontWeight: '600' },
  capturesLoading:    { paddingVertical: 10, alignItems: 'flex-start' },
  captureRow:         { padding: 10, borderWidth: 1, gap: 4 },
  captureRowHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  captureEmoji:       { fontSize: 16 },
  captureTimestamp:   { fontSize: 10, letterSpacing: 0.6 },
  captureTranscript:  { fontSize: 12, lineHeight: 18 },
});
