// app/(tabs)/journal.tsx — Field notes + captures journal

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import { fetchJournal, JournalEntry } from '@/src/api/journal';

export default function JournalScreen() {
  const { theme } = useTheme();
  const { band } = useBand();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const label = band === 'k6' ? 'Field Journal' : 'Field Notes';

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
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>{label}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <FlatList
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
});
