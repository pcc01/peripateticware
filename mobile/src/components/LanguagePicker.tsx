// src/components/LanguagePicker.tsx
// Settings' language control — a single row showing the current language
// that opens a modal sheet listing every SUPPORTED_LOCALES entry, instead
// of rendering all 13 as an always-expanded inline list (that list is the
// tallest section on the Settings screen once it disappears into a modal).

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/src/theme/tokens';
import { SUPPORTED_LOCALES, SupportedLocale } from '@/src/i18n/locales';

interface Props {
  theme: Theme;
  locale: string;
  disabled: boolean;
  onSelect: (code: string) => void;
}

export default function LanguagePicker({ theme, locale, disabled, onSelect }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  const handleSelect = (code: string) => {
    setOpen(false);
    onSelect(code);
  };

  return (
    <>
      <TouchableOpacity
        testID="language-picker-trigger"
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={[
          styles.trigger,
          { borderColor: theme.border, borderRadius: theme.radiusSm, backgroundColor: theme.surfaceAlt, opacity: disabled ? 0.5 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('settings.language.current', 'Language: {{language}}', { language: current.name })}
      >
        <Text style={styles.optionEmoji}>{current.flag}</Text>
        <Text style={[styles.triggerLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{current.name}</Text>
        <Text style={[styles.chevron, { color: theme.textFaint }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { fontFamily: theme.fontHead, color: theme.text }]}>
                {t('settings.languageLabel', 'Language')}
              </Text>
              <TouchableOpacity
                testID="language-picker-close"
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close', 'Close')}
              >
                <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={SUPPORTED_LOCALES}
              keyExtractor={(item) => item.code}
              style={styles.list}
              renderItem={({ item }: { item: SupportedLocale }) => (
                <TouchableOpacity
                  key={item.code}
                  testID={`language-option-${item.code}`}
                  onPress={() => handleSelect(item.code)}
                  style={[
                    styles.optionRow,
                    {
                      borderColor: locale === item.code ? theme.accent : theme.border,
                      borderRadius: theme.radiusSm,
                      backgroundColor: locale === item.code ? theme.accentMuted : theme.surfaceAlt,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityLabel={`${item.name} language`}
                  accessibilityState={{ selected: locale === item.code }}
                >
                  <Text style={styles.optionEmoji}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionLabel, { fontFamily: theme.fontBody, color: theme.text }]}>{item.name}</Text>
                  </View>
                  {locale === item.code && <Text style={[styles.checkmark, { color: theme.accent }]}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger:     { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 10 },
  triggerLabel:{ flex: 1, fontSize: 14, fontWeight: '600' },
  chevron:     { fontSize: 14 },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { width: '100%', maxHeight: '75%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 17, fontWeight: '700' },
  closeBtn:    { fontSize: 18, padding: 4 },
  list:        { flexGrow: 0 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', padding: 10, borderWidth: 1, gap: 10, marginBottom: 8 },
  optionEmoji: { fontSize: 22, width: 30 },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  checkmark:   { fontSize: 16, fontWeight: '700' },
});
