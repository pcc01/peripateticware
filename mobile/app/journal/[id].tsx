// app/journal/[id].tsx
// Extended Field Journal editor.
// Students can add blocks (Write, Capture, Reflect, Question) over time.
// Blocks are stored as JSON in the field-note description — no schema change needed.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useBand } from '@/src/bands/BandContext';
import CaptureSheet from '@/src/components/CaptureSheet';
import {
  fetchFieldNote, saveFieldNote, submitFieldNote,
  createFieldNote, descriptionToDoc, docToDescription,
  JournalDoc, JournalBlock, TextBlock, CaptureBlock, ReflectionBlock, QuestionBlock,
} from '@/src/api/fieldNotes';
import type { Capture } from '@/src/api/captures';

// ── Reflection prompts by age band ─────────────────────────────────────────
const REFLECTION_PROMPTS: Record<string, string[]> = {
  k6: [
    'What surprised you most?',
    'What questions do you still have?',
    'How does this connect to something you already know?',
    'What would you do differently next time?',
  ],
  m712: [
    'What patterns did you notice?',
    'What evidence supports your conclusion?',
    'How does this connect to what you\'ve learned in class?',
    'What new questions emerged from your investigation?',
    'What would a scientist/historian/artist notice here?',
  ],
  college: [
    'What theoretical frameworks apply to your observation?',
    'What assumptions are embedded in your interpretation?',
    'How does this complicate or support the course material?',
    'What further investigation is warranted?',
    'What is the significance of this finding?',
  ],
};

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ── Block renderers ─────────────────────────────────────────────────────────

function TextBlockView({
  block, theme, band, onUpdate, onDelete,
}: {
  block: TextBlock; theme: any; band: string;
  onUpdate: (content: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(block.content === '');
  const [draft, setDraft] = useState(block.content);

  return (
    <View style={[styles.block, { borderColor: theme.border }]}>
      <View style={styles.blockHeader}>
        <Text style={[styles.blockLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>✏️ WRITE</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Text style={{ color: theme.textFaint, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {editing ? (
        <>
          <TextInput
            style={[styles.blockInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text, fontFamily: theme.fontBody }]}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder={band === 'k6' ? 'Write what you saw, heard, or noticed…' : 'Write your extended observation…'}
            placeholderTextColor={theme.textFaint}
            textAlignVertical="top"
          />
          <TouchableOpacity
            onPress={() => { onUpdate(draft); setEditing(false); }}
            style={[styles.saveBlockBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[styles.saveBlockBtnText, { color: theme.accentText, fontFamily: theme.fontBody }]}>Save</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.8}>
          <Text style={[styles.blockContent, { color: theme.text, fontFamily: theme.fontBody }]}>
            {block.content || <Text style={{ color: theme.textFaint }}>Tap to write…</Text>}
          </Text>
          <Text style={[styles.blockEdit, { color: theme.accent, fontFamily: theme.fontBody }]}>Tap to edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CaptureBlockView({ block, theme }: { block: CaptureBlock; theme: any }) {
  const icon = block.capture_type === 'photo' ? '📷'
    : block.capture_type === 'video'  ? '🎬'
    : block.capture_type === 'audio'  ? '🎤'
    : '✏️';
  return (
    <View style={[styles.block, { borderColor: theme.border }]}>
      <View style={styles.blockHeader}>
        <Text style={[styles.blockLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>{icon} CAPTURE</Text>
      </View>
      <View style={[styles.captureChip, { backgroundColor: theme.surfaceAlt }]}>
        <Text style={{ fontSize: 24 }}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.captureType, { color: theme.text, fontFamily: theme.fontBody }]}>
            {block.capture_type.charAt(0).toUpperCase() + block.capture_type.slice(1)} captured
          </Text>
          {block.caption && (
            <Text style={[styles.captureCaption, { color: theme.textMuted, fontFamily: theme.fontBody }]}>{block.caption}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ReflectionBlockView({
  block, theme, band, onUpdate, onDelete,
}: {
  block: ReflectionBlock; theme: any; band: string;
  onUpdate: (content: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(block.content === '');
  const [draft, setDraft] = useState(block.content);

  return (
    <View style={[styles.block, { borderColor: theme.accent, borderWidth: 1.5 }]}>
      <View style={styles.blockHeader}>
        <Text style={[styles.blockLabel, { color: theme.accent, fontFamily: theme.fontMono }]}>💭 REFLECT</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Text style={{ color: theme.textFaint, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.reflectionPrompt, { color: theme.text, fontFamily: theme.fontHead }]}>{block.prompt}</Text>
      {editing ? (
        <>
          <TextInput
            style={[styles.blockInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text, fontFamily: theme.fontBody }]}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder="Your reflection…"
            placeholderTextColor={theme.textFaint}
            textAlignVertical="top"
          />
          <TouchableOpacity
            onPress={() => { onUpdate(draft); setEditing(false); }}
            style={[styles.saveBlockBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[styles.saveBlockBtnText, { color: theme.accentText, fontFamily: theme.fontBody }]}>Save</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.8}>
          <Text style={[styles.blockContent, { color: block.content ? theme.text : theme.textFaint, fontFamily: theme.fontBody }]}>
            {block.content || 'Tap to write your reflection…'}
          </Text>
          {block.content ? <Text style={[styles.blockEdit, { color: theme.accent }]}>Tap to edit</Text> : null}
        </TouchableOpacity>
      )}
    </View>
  );
}

function QuestionBlockView({
  block, theme, onUpdate, onDelete,
}: {
  block: QuestionBlock; theme: any;
  onUpdate: (content: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(block.content === '');
  const [draft, setDraft] = useState(block.content);

  return (
    <View style={[styles.block, { borderColor: theme.border, borderStyle: 'dashed' }]}>
      <View style={styles.blockHeader}>
        <Text style={[styles.blockLabel, { color: theme.textFaint, fontFamily: theme.fontMono }]}>❓ QUESTION</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Text style={{ color: theme.textFaint, fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {editing ? (
        <>
          <TextInput
            style={[styles.blockInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text, fontFamily: theme.fontBody }]}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder="What question did this raise for you?"
            placeholderTextColor={theme.textFaint}
            textAlignVertical="top"
          />
          <TouchableOpacity
            onPress={() => { onUpdate(draft); setEditing(false); }}
            style={[styles.saveBlockBtn, { backgroundColor: theme.accent }]}
          >
            <Text style={[styles.saveBlockBtnText, { color: theme.accentText, fontFamily: theme.fontBody }]}>Save</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.8}>
          <Text style={[styles.blockContent, { color: block.content ? theme.text : theme.textFaint, fontFamily: theme.fontBody }]}>
            {block.content || 'Tap to write your question…'}
          </Text>
          {block.content ? <Text style={[styles.blockEdit, { color: theme.accent }]}>Tap to edit</Text> : null}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { band } = useBand();

  const [title, setTitle]         = useState('');
  const [doc, setDoc]             = useState<JournalDoc>({ v: 2, summary: '', blocks: [] });
  const [status, setStatus]       = useState<string>('draft');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dirty, setDirty]         = useState(false);

  const isNew    = !id || id === 'new';
  const isLocked = status === 'submitted' || status === 'promoted';

  // Load existing note
  useEffect(() => {
    if (isNew) { setLoading(false); return; }
    fetchFieldNote(id)
      .then((note) => {
        setTitle(note.title ?? '');
        setDoc(descriptionToDoc(note.description));
        setStatus(note.status);
      })
      .catch(() => Alert.alert('Error', 'Could not load journal entry.'))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Block mutations ────────────────────────────────────────────────────────
  const mutateBlocks = useCallback((fn: (blocks: JournalBlock[]) => JournalBlock[]) => {
    setDoc((prev) => ({ ...prev, blocks: fn(prev.blocks) }));
    setDirty(true);
  }, []);

  const addBlock = (block: JournalBlock) => {
    mutateBlocks((b) => [...b, block]);
    setShowAddMenu(false);
  };

  const updateBlock = (blockId: string, update: Partial<JournalBlock>) => {
    mutateBlocks((blocks) =>
      blocks.map((b) => b.id === blockId ? { ...b, ...update } as JournalBlock : b)
    );
  };

  const deleteBlock = (blockId: string) => {
    mutateBlocks((blocks) => blocks.filter((b) => b.id !== blockId));
  };

  // ── Add block shortcuts ────────────────────────────────────────────────────
  const addTextBlock = () => addBlock({ type: 'text', id: genId(), content: '', created_at: new Date().toISOString() });

  const addReflectionBlock = () => {
    const prompts = REFLECTION_PROMPTS[band] ?? REFLECTION_PROMPTS.m712;
    const prompt  = prompts[Math.floor(Math.random() * prompts.length)];
    addBlock({ type: 'reflection', id: genId(), prompt, content: '', created_at: new Date().toISOString() });
  };

  const addQuestionBlock = () => addBlock({ type: 'question', id: genId(), content: '', created_at: new Date().toISOString() });

  // When a capture is made from within the journal
  const handleCaptured = (capture: Capture) => {
    addBlock({
      type: 'capture',
      id: genId(),
      capture_id: capture.id,
      capture_type: capture.capture_type,
      file_path: capture.file_path,
      created_at: new Date().toISOString(),
    });
    setShowCapture(false);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Give this journal entry a title before saving.'); return; }
    setSaving(true);
    try {
      if (isNew) {
        const note = await createFieldNote({ title: title.trim(), doc });
        setDirty(false);
        // Replace current route with the saved entry's id
        router.replace(`/journal/${note.id}`);
      } else {
        await saveFieldNote(id, { title: title.trim(), doc });
        setDirty(false);
      }
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Submit for teacher review ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (dirty) await save();
    Alert.alert(
      'Submit for review?',
      'Once submitted, you won\'t be able to edit this entry unless your teacher sends it back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              await submitFieldNote(id);
              setStatus('submitted');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  const prompts = REFLECTION_PROMPTS[band] ?? REFLECTION_PROMPTS.m712;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => { if (dirty) { Alert.alert('Unsaved changes', 'Save before leaving?', [{ text: 'Discard', onPress: () => router.back() }, { text: 'Save', onPress: async () => { await save(); router.back(); } }]); } else router.back(); }} hitSlop={12}>
            <Text style={[styles.backBtn, { color: theme.accent, fontFamily: theme.fontBody }]}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {!isLocked && dirty && (
              <TouchableOpacity onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
                <Text style={[styles.saveBtnText, { color: theme.accentText, fontFamily: theme.fontBody }]}>
                  {saving ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            )}
            {!isNew && !isLocked && (
              <TouchableOpacity onPress={handleSubmit} style={[styles.submitBtn, { borderColor: theme.accent }]}>
                <Text style={[styles.submitBtnText, { color: theme.accent, fontFamily: theme.fontBody }]}>Submit ↑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status banner */}
        {isLocked && (
          <View style={[styles.lockedBanner, { backgroundColor: theme.accentMuted }]}>
            <Text style={[styles.lockedText, { color: theme.accent, fontFamily: theme.fontBody }]}>
              {status === 'promoted' ? '🌟 This entry has been promoted by your teacher.' : '📬 Submitted for teacher review.'}
            </Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Title */}
          <TextInput
            style={[styles.titleInput, { color: theme.text, fontFamily: theme.fontHead, borderBottomColor: theme.border }]}
            value={title}
            onChangeText={(t) => { setTitle(t); setDirty(true); }}
            placeholder={band === 'k6' ? 'My Field Journal' : 'Journal Entry Title'}
            placeholderTextColor={theme.textFaint}
            editable={!isLocked}
            returnKeyType="done"
          />

          {/* Word / block count */}
          <Text style={[styles.metaLine, { color: theme.textFaint, fontFamily: theme.fontMono }]}>
            {doc.blocks.length} section{doc.blocks.length !== 1 ? 's' : ''}
            {' · '}
            {doc.blocks.reduce((acc, b) => {
              if (b.type === 'text' || b.type === 'reflection' || b.type === 'question') {
                return acc + (b.content?.split(/\s+/).filter(Boolean).length ?? 0);
              }
              return acc;
            }, 0)} words
          </Text>

          {/* Blocks */}
          {doc.blocks.map((block) => {
            if (block.type === 'text') return (
              <TextBlockView key={block.id} block={block} theme={theme} band={band}
                onUpdate={(c) => updateBlock(block.id, { content: c })}
                onDelete={() => deleteBlock(block.id)} />
            );
            if (block.type === 'capture') return (
              <CaptureBlockView key={block.id} block={block} theme={theme} />
            );
            if (block.type === 'reflection') return (
              <ReflectionBlockView key={block.id} block={block} theme={theme} band={band}
                onUpdate={(c) => updateBlock(block.id, { content: c })}
                onDelete={() => deleteBlock(block.id)} />
            );
            if (block.type === 'question') return (
              <QuestionBlockView key={block.id} block={block} theme={theme}
                onUpdate={(c) => updateBlock(block.id, { content: c })}
                onDelete={() => deleteBlock(block.id)} />
            );
            return null;
          })}

          {/* Empty state */}
          {doc.blocks.length === 0 && !isLocked && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyEmoji]}>📓</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: theme.fontBody }]}>
                {band === 'k6'
                  ? 'Start writing, add a photo, or answer a question!'
                  : 'Add your first section below — write, capture evidence, reflect, or record a question.'}
              </Text>
            </View>
          )}

          {/* Add block menu */}
          {!isLocked && (
            <View style={styles.addSection}>
              {showAddMenu ? (
                <View style={[styles.addMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <TouchableOpacity style={[styles.addMenuItem, { borderBottomColor: theme.border }]} onPress={addTextBlock}>
                    <Text style={styles.addMenuEmoji}>✏️</Text>
                    <View>
                      <Text style={[styles.addMenuLabel, { color: theme.text, fontFamily: theme.fontBody }]}>Write</Text>
                      <Text style={[styles.addMenuSub, { color: theme.textMuted, fontFamily: theme.fontBody }]}>Extended observation or analysis</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addMenuItem, { borderBottomColor: theme.border }]} onPress={() => { setShowAddMenu(false); setShowCapture(true); }}>
                    <Text style={styles.addMenuEmoji}>📷</Text>
                    <View>
                      <Text style={[styles.addMenuLabel, { color: theme.text, fontFamily: theme.fontBody }]}>Capture</Text>
                      <Text style={[styles.addMenuSub, { color: theme.textMuted, fontFamily: theme.fontBody }]}>Photo, video, audio, or note</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addMenuItem, { borderBottomColor: theme.border }]} onPress={addReflectionBlock}>
                    <Text style={styles.addMenuEmoji}>💭</Text>
                    <View>
                      <Text style={[styles.addMenuLabel, { color: theme.text, fontFamily: theme.fontBody }]}>Reflect</Text>
                      <Text style={[styles.addMenuSub, { color: theme.textMuted, fontFamily: theme.fontBody }]}>Answer a guided prompt</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addMenuItem} onPress={addQuestionBlock}>
                    <Text style={styles.addMenuEmoji}>❓</Text>
                    <View>
                      <Text style={[styles.addMenuLabel, { color: theme.text, fontFamily: theme.fontBody }]}>Question</Text>
                      <Text style={[styles.addMenuSub, { color: theme.textMuted, fontFamily: theme.fontBody }]}>Record a question to investigate</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addBtn, { borderColor: theme.accent, borderRadius: theme.radiusSm }]}
                  onPress={() => setShowAddMenu(true)}
                >
                  <Text style={[styles.addBtnText, { color: theme.accent, fontFamily: theme.fontBody }]}>+ Add Section</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Capture sheet */}
      <CaptureSheet
        visible={showCapture}
        onClose={() => setShowCapture(false)}
        onCaptured={handleCaptured}
        theme={theme}
        band={band}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1 },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn:           { fontSize: 15 },
  headerActions:     { flexDirection: 'row', gap: 8 },
  saveBtn:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  saveBtnText:       { fontSize: 14, fontWeight: '600' },
  submitBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  submitBtnText:     { fontSize: 14, fontWeight: '600' },

  lockedBanner:      { paddingHorizontal: 16, paddingVertical: 10 },
  lockedText:        { fontSize: 13 },

  content:           { padding: 16, gap: 14 },
  titleInput:        { fontSize: 24, fontWeight: '700', paddingBottom: 8, borderBottomWidth: 1, marginBottom: 2 },
  metaLine:          { fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },

  // Blocks
  block:             { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  blockHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockLabel:        { fontSize: 9, letterSpacing: 1.2 },
  blockContent:      { fontSize: 15, lineHeight: 23 },
  blockEdit:         { fontSize: 11, marginTop: 4 },
  blockInput:        { borderWidth: 1, borderRadius: 6, padding: 10, fontSize: 15, lineHeight: 22, minHeight: 100 },
  saveBlockBtn:      { padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 4 },
  saveBlockBtnText:  { fontSize: 14, fontWeight: '600' },

  reflectionPrompt:  { fontSize: 15, fontWeight: '600', lineHeight: 22 },

  captureChip:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 6 },
  captureType:       { fontSize: 14, fontWeight: '600' },
  captureCaption:    { fontSize: 12 },

  // Empty state
  emptyState:        { alignItems: 'center', padding: 32, gap: 12 },
  emptyEmoji:        { fontSize: 48 },
  emptyText:         { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Add block
  addSection:        { marginTop: 8 },
  addBtn:            { borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 14, alignItems: 'center', borderRadius: 8 },
  addBtnText:        { fontSize: 15, fontWeight: '600' },
  addMenu:           { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  addMenuItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  addMenuEmoji:      { fontSize: 24, width: 32, textAlign: 'center' },
  addMenuLabel:      { fontSize: 15, fontWeight: '600' },
  addMenuSub:        { fontSize: 12, marginTop: 2 },
});
