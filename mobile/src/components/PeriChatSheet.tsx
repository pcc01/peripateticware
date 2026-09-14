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
import { Capture } from '@/src/api/captures';
import { queueCapture, updateQueuedCaptureUri } from '@/src/db/offlineQueue';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  onClose: () => void;
  theme: Theme;
  // Sent to the backend so it can enforce the activity's
  // ai_interaction_mode server-side (a hidden button is a UI convenience,
  // not real enforcement -- see routes/inference.py's /chat).
  activityId?: string;
  activityTitle?: string;
  activitySubject?: string;
  currentPrompt?: string;
  sessionId?: string | null;
  // Fires when the transcript is (re-)saved to the local capture queue —
  // same contract as CaptureSheet.tsx's onCaptured, so the activity screen
  // can track/link it alongside every other evidence type. Called with the
  // SAME capture id across repeated saves within one still-unsynced
  // session (see saveTranscript below) — the parent should upsert by id,
  // not blindly append.
  onCaptured?: (c: Capture) => void;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function PeriChatSheet({
  visible, onClose, theme,
  activityId, activityTitle, activitySubject, currentPrompt, sessionId,
  onCaptured,
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

  // Persisting the conversation (2026-09-14): this used to be pure
  // ephemeral React state -- discarded the moment the activity screen
  // unmounted, with no way for the student to revisit it or the teacher to
  // see it, and no documented privacy/compliance reason for that, just an
  // oversight given how much of the rest of a Peri chat IS part of the
  // learning. Saved the same way a text note is (plain-text file, this
  // capture type), reusing the existing local-first queue/sync/link
  // machinery rather than inventing a new storage path.
  //
  // `queuedCaptureIdRef` tracks the local queue row across repeated saves
  // *within one still-unsynced session* so re-opening "Ask Peri" during the
  // same activity visit amends the SAME capture (via
  // updateQueuedCaptureUri) instead of creating a new one each time --
  // functionally "one evolving conversation," the way a git branch gets
  // amended rather than piling up near-duplicate commits. If that row was
  // already uploaded and removed from the local queue since the last save
  // (updateQueuedCaptureUri returns false), every OTHER capture type in
  // this app treats an uploaded capture as immutable evidence too -- no
  // endpoint anywhere mutates one after the fact -- so this becomes a
  // fresh checkpoint capture instead, not a patch to the synced one.
  const queuedCaptureIdRef = useRef<string | null>(null);

  const saveTranscript = async () => {
    const realMessages = messages.filter((m) => m.id !== 'greeting');
    if (realMessages.length === 0) return; // nothing exchanged -- don't save a greeting-only "conversation"

    const transcript = realMessages
      .map((m) => `${m.role === 'user' ? t('perichat.transcriptStudentLabel', 'Student') : t('perichat.transcriptPeriLabel', 'Peri')}: ${m.content}`)
      .join('\n\n');
    const uri = `data:text/plain;base64,${btoa(transcript)}`;

    if (queuedCaptureIdRef.current) {
      const amended = await updateQueuedCaptureUri(queuedCaptureIdRef.current, uri);
      if (amended) {
        onCaptured?.({
          id: queuedCaptureIdRef.current,
          capture_type: 'peri_chat',
          created_at: new Date().toISOString(),
          local_text: transcript,
        });
        return;
      }
      // Already synced and removed from the local queue since the last
      // save -- fall through to queue a fresh checkpoint below.
    }

    const queueId = await queueCapture({
      local_uri: uri,
      capture_type: 'peri_chat',
      session_id: sessionId ?? undefined,
      activity_id: activityId,
    });
    queuedCaptureIdRef.current = queueId;
    onCaptured?.({
      id: queueId,
      capture_type: 'peri_chat',
      created_at: new Date().toISOString(),
      local_text: transcript,
    });
  };

  const handleClose = () => {
    saveTranscript().catch(() => {
      // Best-effort, same spirit as every other capture path in this app —
      // the conversation itself isn't lost (it's still on-screen if the
      // student reopens the sheet before navigating away), just not yet
      // checkpointed to the queue this one time.
    });
    onClose();
  };

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
        activityId,
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
  // screen height with the keyboard up: behind the keyboard, not above it.
  // That fix addressed iOS (presentationStyle is an iOS-only Modal concept
  // — Android ignores it entirely); Android had a SEPARATE, since-confirmed
  // bug of its own (2026-09-14, real device report: "the keyboard covers
  // what you're typing"), root-caused by reading React Native's own Android
  // source rather than guessing: RN's <Modal> renders to its own Android
  // Dialog, and ReactModalHostView.kt UNCONDITIONALLY calls
  // `window.setSoftInputMode(SOFT_INPUT_ADJUST_RESIZE)` on that dialog's
  // window — i.e. the native window already resizes itself for the
  // keyboard, regardless of the host Activity's own manifest
  // windowSoftInputMode. Layering behavior="height" KeyboardAvoidingView on
  // top of that made this view ALSO manually shrink by the keyboard's
  // height, double-compensating and pushing the input row down behind the
  // now-doubly-shrunk visible area instead of just above the keyboard.
  // Fix: no KeyboardAvoidingView adjustment at all on Android inside a
  // Modal — the native resize already does the job alone. Matches
  // ReflectPhase's existing comment in app/activity/[id].tsx making the
  // identical point for a non-Modal screen (there, the same native resize
  // comes from MainActivity's manifest windowSoftInputMode="adjustResize"
  // directly rather than RN's Modal code, but the conclusion — Android
  // needs no JS-side keyboard-avoiding behavior here — is the same).
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        testID="peri-chat-sheet"
        style={[styles.root, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <CrowAvatar theme={theme} size={32} />
          <Text style={[styles.headerTitle, { fontFamily: theme.fontHead, color: theme.text }]}>{t('perichat.title', 'Ask Peri')}</Text>
          <TouchableOpacity
            testID="peri-chat-close"
            onPress={handleClose}
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
