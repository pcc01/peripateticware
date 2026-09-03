// src/components/WayfindingConsentCard.tsx
// One prompt per capability rung the teacher enabled that this student hasn't
// consented to yet. Plain-language, retention line shown inline. C / D / E are
// independent — allowing one never implies another. Declining leaves a full
// rung-B hunt working. See WAYFINDING_CONSENT_LADDER.md §5.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/src/theme/ThemeContext';
import { Rung, recordGpsConsent } from '@/src/api/wayfinding';

interface RungCopy {
  title: string;
  gets: string;
}

// Mirrors the parent-facing table in WAYFINDING_CONSENT_LADDER.md §5.
const RUNG_COPY: Record<'C' | 'D' | 'E', RungCopy> = {
  C: {
    title: 'Tag your photos with where they were taken',
    gets: 'Your submitted photos and notes show on your teacher’s map at the spot you captured them.',
  },
  D: {
    title: 'Show you on the teacher’s map during the trip',
    gets: 'On a supervised outing your teacher can see where you are in real time while the session is running.',
  },
  E: {
    title: 'Record the path you walk',
    gets: 'The class can compare the routes everyone took after the hunt.',
  },
};

interface Props {
  activityId: string;
  rungs: Rung[];
  retentionCopy: Partial<Record<Rung, string>>;
  onChanged: () => void;
}

export default function WayfindingConsentCard({
  activityId,
  rungs,
  retentionCopy,
  onChanged,
}: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Rung | null>(null);
  const [dismissed, setDismissed] = useState<Set<Rung>>(new Set());

  const visible = rungs.filter((r) => (r === 'C' || r === 'D' || r === 'E') && !dismissed.has(r));
  if (visible.length === 0) return null;

  const decide = async (rung: Rung, allow: boolean) => {
    if (allow) {
      setBusy(rung);
      await recordGpsConsent(activityId, rung, true);
      setBusy(null);
      onChanged();
    } else {
      setDismissed((prev) => new Set(prev).add(rung));
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {visible.map((rung) => {
        const copy = RUNG_COPY[rung as 'C' | 'D' | 'E'];
        return (
          <View
            key={rung}
            testID={`wayfinding-consent-${rung}`}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.warn }]}
          >
            <Text style={[styles.eyebrow, { fontFamily: theme.fontMono, color: theme.warn }]}>
              {t('wayfindingConsent.eyebrow', 'YOUR TEACHER TURNED THIS ON — YOUR CHOICE')}
            </Text>
            <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
              {t(`wayfindingConsent.${rung}.title`, copy.title)}
            </Text>
            <Text style={[styles.body, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
              {t(`wayfindingConsent.${rung}.gets`, copy.gets)}
            </Text>
            {!!retentionCopy[rung] && (
              <Text style={[styles.retention, { fontFamily: theme.fontMono, color: theme.textFaint }]}>
                {t('wayfindingConsent.kept', 'Kept: {{copy}}', { copy: retentionCopy[rung] })}
              </Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity
                testID={`wayfinding-consent-${rung}-decline`}
                onPress={() => decide(rung, false)}
                style={[styles.btn, { borderColor: theme.border }]}
              >
                <Text style={[styles.btnText, { fontFamily: theme.fontBody, color: theme.textMuted }]}>
                  {t('wayfindingConsent.notNow', 'Not now')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`wayfinding-consent-${rung}-allow`}
                onPress={() => decide(rung, true)}
                disabled={busy === rung}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.accent }]}
              >
                {busy === rung ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.btnText, { fontFamily: theme.fontBody, color: '#fff', fontWeight: '700' }]}>
                    {t('wayfindingConsent.allow', 'Allow')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderWidth: 1, borderRadius: 10, gap: 6 },
  eyebrow: { fontSize: 9, letterSpacing: 1.2 },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  retention: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnPrimary: { borderWidth: 0 },
  btnText: { fontSize: 14 },
});
