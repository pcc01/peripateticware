// app/(tabs)/journal.tsx — Field notes + captures journal
// Two sources: student-initiated field notes (editable, block-based — see
// app/journal/[id].tsx) and read-only notebook entries generated from activities.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { fetchJournal, JournalEntry } from '@/src/api/journal';
import { fetchFieldNotes, FieldNote, descriptionToDoc } from '@/src/api/fieldNotes';

type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'note'; key: string; note: FieldNote }
  | { kind: 'entry'; key: string; entry: JournalEntry };

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  promoted: 'Promoted',
  rejected: 'Returned',
};

function noteSummary(note: FieldNote): string {
  const doc = descriptionToDoc(note.description);
  if (doc.summary) return doc.summary;
  const firstText = doc.blocks.find((b) => b.type === 'text' || b.type === 'reflection' || b.type === 'question');
  return firstText && 'content' in firstText ? firstText.content : '';
}

export default function JournalScreen() {
  const { theme } = useTheme();
  const { band } = useBand();
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const label = band === 'k6' ? 'Field Journal' : 'Field Notes';

  const load = useCallback(async () => {
    const [fieldNotes, journal] = await Promise.all([fetchFieldNotes(), fetchJournal()]);
    setNotes(fieldNotes);
    setEntries(journal);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rows: Row[] = [];
  const both = notes.length > 0 && entries.length > 0;
  if (both) rows.push({ kind: 'section', key: 's-notes', label: 'My entries' });
  notes.forEach((note) => rows.push({ kind: 'note', key: `n-${note.id}`, note }));
  if (both) rows.push({ kind: 'section', key: 's-entries', label: 'From activities' });
  entries.forEach((entry) => rows.push({ kind: 'entry', key: `e-${entry.id}`, entry }));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{label}</Text>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: theme.accent, borderRadius: theme.radius }]}
          onPress={() => router.push('/journal/new')}
          accessibilityLabel="New journal entry"
        >
          <Text style={[styles.newBtnText, { fontFamily: theme.fontHead }]}>＋ New</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>📓</Text>
              <Text style={[styles.emptyText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                {'No entries yet.\nTap ＋ New to start your journal, or complete an activity.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'section') {
              return (
                <Text style={[styles.section, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                  {item.label.toUpperCase()}
                </Text>
              );
            }
            if (item.kind === 'note') {
              const { note } = item;
              const summary = noteSummary(note);
              const status = STATUS_LABEL[note.status];
              return (
                <TouchableOpacity
                  style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}
                  onPress={() => router.push(`/journal/${note.id}`)}
                >
                  <View style={styles.cardTopRow}>
                    <Text style={[styles.entryTitle, styles.flexTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>
                      {note.title || 'Untitled entry'}
                    </Text>
                    {status && (
                      <Text style={[styles.status, { fontFamily: theme.fontMono, color: theme.accent, borderColor: theme.accent }]}>
                        {status}
                      </Text>
                    )}
                  </View>
                  {!!summary && (
                    <Text style={[styles.entryContent, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={3}>
                      {summary}
                    </Text>
                  )}
                  <Text style={[styles.entryMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                    {new Date(note.updated_at ?? note.created_at).toLocaleDateString()}
                    {note.location_name ? ` · ${note.location_name}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            }
            const { entry } = item;
            return (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
                <Text style={[styles.entryTitle, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={2}>
                  {entry.title ?? entry.activity_title ?? 'Field Note'}
                </Text>
                {entry.content && (
                  <Text style={[styles.entryContent, { fontFamily: theme.fontBody, color: theme.textMuted }]} numberOfLines={3}>
                    {entry.content}
                  </Text>
                )}
                <Text style={[styles.entryMeta, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                  {new Date(entry.created_at).toLocaleDateString()}
                  {entry.captures_count ? ` · ${entry.captures_count} captures` : ''}
                </Text>
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
  header:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:        { fontSize: 28, fontWeight: '700' },
  newBtn:       { paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyText:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  section:      { fontSize: 10, letterSpacing: 1.2, marginTop: 6, marginBottom: -2 },
  card:         { padding: 14, borderWidth: 1, gap: 6 },
  cardTopRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flexTitle:    { flex: 1 },
  status:       { fontSize: 10, letterSpacing: 0.8, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  entryTitle:   { fontSize: 16, fontWeight: '600' },
  entryContent: { fontSize: 13, lineHeight: 20 },
  entryMeta:    { fontSize: 10, letterSpacing: 0.8 },
});
