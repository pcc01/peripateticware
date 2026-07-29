// src/components/PeriChatSheet.tsx
// Peri AI chat — bottom sheet, prefilled with activity context
// M-8: ChatBubble + CrowAvatar → POST /api/v1/inference/chat

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { Theme } from '@/src/theme/tokens';
import CrowAvatar from '@/src/components/CrowAvatar';
import { chatWithPeri, ChatMessage } from '@/src/api/inference';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  activityTitle?: string;
  activitySubject?: string;
  currentPrompt?: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function PeriChatSheet({
  visible, onClose, theme,
  activityTitle, activitySubject, currentPrompt,
}: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && messages.length === 0) {
      const greeting = t('perichat.greeting', "I'm Peri. Ask me anything about the activity or what you're observing.");
      setMessages([{ id: 'greeting', role: 'assistant', content: greeting }]);
    }
  }, [visible]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: DisplayMessage = { id: Date.now().toString(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history: ChatMessage[] = messages
        .filter((m) => m.id !== 'greeting')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await chatWithPeri({
        message: text,
        history,
        activityTitle,
        activitySubject,
        currentPrompt,
      });

      const assistantMsg: DisplayMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.response,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: 'err', role: 'assistant', content: t('perichat.connectError', "I couldn't connect right now. Try again in a moment.") },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // formSheet, not pageSheet — a real CI run's hierarchy dump showed
  // peri-chat-input/peri-chat-send sitting at y=578-618 out of ~852pt
  // screen height with the keyboard up: behind the keyboard, not above it,
  // despite the KeyboardAvoidingView below. CaptureSheet.tsx has the same
  // Modal + KeyboardAvoidingView + TextInput shape and its equivalent fix
  // (see that file's own comment) DID work there — the one structural
  // difference is presentationStyle. iOS's keyboard-frame notifications
  // that KeyboardAvoidingView listens for are documented to behave
  // differently depending on a Modal's presentation style; matching
  // CaptureSheet's (confirmed working) formSheet is the targeted fix, not
  // a guess at a new mechanism.
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        testID="peri-chat-sheet"
        style={[styles.root, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <CrowAvatar theme={theme} size={32} />
          <Text style={[styles.headerTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('perichat.title', 'Ask Peri')}</Text>
          <TouchableOpacity
            testID="peri-chat-close"
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('perichat.closeChat', 'Close chat')}
          >
            <Text style={[styles.closeBtn, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[
              styles.bubble,
              item.role === 'user'
                ? [styles.userBubble, { backgroundColor: theme.accent, borderRadius: theme.radius }]
                : [styles.periBubble, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius }],
            ]}>
              {item.role === 'assistant' && (
                <CrowAvatar theme={theme} size={20} />
              )}
              <Text style={[
                styles.bubbleText,
                { fontFamily: theme.fontBody, color: item.role === 'user' ? theme.accentText : theme.text },
              ]}>
                {item.content}
              </Text>
            </View>
          )}
        />

        {loading && (
          <View style={styles.typingRow}>
            <CrowAvatar theme={theme} size={20} />
            <ActivityIndicator color={theme.accent} size="small" />
          </View>
        )}

        {/* Input */}
        <View style={[styles.inputRow, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <TextInput
            testID="peri-chat-input"
            style={[styles.input, {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
              color: theme.text,
              fontFamily: theme.fontBody,
              borderRadius: theme.radiusFull,
            }]}
            value={input}
            onChangeText={setInput}
            placeholder={t('perichat.inputPlaceholder', 'Ask a question…')}
            placeholderTextColor={theme.textFaint}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity
            testID="peri-chat-send"
            onPress={send}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, { backgroundColor: input.trim() ? theme.accent : theme.border, borderRadius: theme.radiusFull }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('perichat.sendMessage', 'Send message')}
            accessibilityState={{ disabled: !input.trim() || loading }}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  closeBtn:    { fontSize: 18, padding: 4 },
  messageList: { padding: 16, gap: 10 },
  bubble:      { maxWidth: '85%', padding: 12, gap: 6 },
  userBubble:  { alignSelf: 'flex-end', flexDirection: 'row' },
  periBubble:  { alignSelf: 'flex-start', flexDirection: 'row', borderWidth: 1 },
  bubbleText:  { fontSize: 15, lineHeight: 22, flex: 1 },
  typingRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderTopWidth: 1 },
  input:       { flex: 1, height: 40, paddingHorizontal: 14, borderWidth: 1, fontSize: 15 },
  sendBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendIcon:    { fontSize: 18, color: 'white', fontWeight: '700' },
});
