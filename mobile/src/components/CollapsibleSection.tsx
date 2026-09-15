// src/components/CollapsibleSection.tsx
// Shared "Class > ..." collapsible group header, used by
// app/teacher-submissions.tsx (class > student) and
// app/teacher-announcements.tsx (class > announcement) so both screens
// share one visual/interaction pattern rather than two hand-rolled ones.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function CollapsibleSection({
  title,
  count,
  defaultExpanded = true,
  theme,
  testID,
  children,
}: {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  theme: any;
  testID?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={[styles.root, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }]}>
      <TouchableOpacity
        testID={testID}
        onPress={() => setExpanded((e) => !e)}
        style={styles.header}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.chevron, { color: theme.textFaint }]}>{expanded ? '⌄' : '›'}</Text>
        <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]} numberOfLines={1}>{title}</Text>
        <View style={[styles.countPill, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={[styles.countText, { fontFamily: theme.fontMono, color: theme.textFaint }]}>{count}</Text>
        </View>
      </TouchableOpacity>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { borderWidth: 1, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  chevron:    { fontSize: 16, width: 16, textAlign: 'center' },
  title:      { fontSize: 15, fontWeight: '700', flex: 1 },
  countPill:  { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  countText:  { fontSize: 11, fontWeight: '600' },
  body:       { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
});
