// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ExtendedWritingPanel
 *
 * The "back at your desk" companion to the mobile field note.
 * Students extend their field observations with deeper analysis,
 * reflection, connections, and questions — as many sections as needed.
 *
 * Data model: sections are stored as JSON in StudentFieldNote.description.
 * Format: { v: 2, field_note: string, sections: ExtendedSection[] }
 * Legacy plain-text descriptions are treated as the original field note.
 *
 * Used in: FieldNotesListPage (via /student/field-notes/:id)
 */

import React, { useState, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { fieldNoteApi } from '../../services/phase7Api'
import { useTranslation } from 'react-i18next';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SectionType = 'analysis' | 'reflection' | 'connection' | 'question' | 'evidence'

export interface ExtendedSection {
  id: string
  type: SectionType
  heading: string
  content: string
  added_at: string
  updated_at?: string
}

export interface JournalDoc {
  v: 2
  field_note: string          // original text from mobile (read-only source)
  sections: ExtendedSection[]
}

// ── Serialise / parse description ─────────────────────────────────────────────

export function parseDoc(description: string | null | undefined): JournalDoc {
  if (!description) return { v: 2, field_note: '', sections: [] }
  try {
    const p = JSON.parse(description)
    if (p?.v === 2) return p as JournalDoc
  } catch {}
  // Legacy plain text becomes the field_note source
  return { v: 2, field_note: description, sections: [] }
}

export function serialiseDoc(doc: JournalDoc): string {
  return JSON.stringify(doc)
}

// ── Section metadata ──────────────────────────────────────────────────────────

const SECTION_META: Record<SectionType, { label: string; emoji: string; placeholder: string; color: string }> = {
  analysis: {
    label: 'Extended Analysis',
    emoji: '🔬',
    placeholder: 'Examine the evidence more deeply. What patterns do you notice? What does the data suggest? What conclusions can you draw?',
    color: '#dbeafe',   // blue-100
  },
  reflection: {
    label: 'Personal Reflection',
    emoji: '💭',
    placeholder: 'What did this experience mean to you? How did it change your thinking? What surprised you?',
    color: '#ede9fe',   // violet-100
  },
  connection: {
    label: 'Connections',
    emoji: '🔗',
    placeholder: 'How does this connect to what you\'ve learned in class? To other experiences? To the real world?',
    color: '#dcfce7',   // green-100
  },
  question: {
    label: 'Questions to Investigate',
    emoji: '❓',
    placeholder: 'What questions did this raise? What would you want to investigate further? What don\'t you understand yet?',
    color: '#fef9c3',   // yellow-100
  },
  evidence: {
    label: 'Additional Evidence Notes',
    emoji: '📎',
    placeholder: 'Add more detail about the photos, recordings, or other evidence you collected. What do they show?',
    color: '#fee2e2',   // red-100
  },
}

const SECTION_ORDER: SectionType[] = ['analysis', 'reflection', 'connection', 'question', 'evidence']

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Single section editor ─────────────────────────────────────────────────────

function SectionEditor({
  section,
  onChange,
  onDelete,
  locked,
}: {
  section: ExtendedSection
  onChange: (updated: ExtendedSection) => void
  onDelete: () => void
  locked: boolean
}) {
  const meta = SECTION_META[section.type]
  const [collapsed, setCollapsed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...section, content: e.target.value, updated_at: new Date().toISOString() })
  }

  const handleHeadingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...section, heading: e.target.value })
  }

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${meta.color.replace('100', '400')}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Section header */}
      <div
        style={{ background: meta.color, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span style={{ fontSize: 16 }}>{meta.emoji}</span>
        {locked ? (
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', flex: 1 }}>
            {section.heading}
          </span>
        ) : (
          <input
            value={section.heading}
            onChange={handleHeadingChange}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontWeight: 600, fontSize: 14, color: '#1e293b',
            }}
          />
        )}
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {section.updated_at
            ? `Edited ${new Date(section.updated_at).toLocaleDateString()}`
            : new Date(section.added_at).toLocaleDateString()}
        </span>
        {!locked && (
          <button
            onClick={onDelete}
            title="Delete section"
            style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginLeft: 4 }}
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {/* Content area */}
      {!collapsed && (
        <div style={{ padding: 14 }}>
          {locked ? (
            <p style={{ fontSize: 14, lineHeight: 1.65, color: '#334155', whiteSpace: 'pre-wrap', margin: 0 }}>
              {section.content || <span style={{ color: '#94a3b8' }}>(no content)</span>}
            </p>
          ) : (
            <textarea
              ref={textareaRef}
              value={section.content}
              onChange={handleContentChange}
              placeholder={meta.placeholder}
              rows={5}
              style={{
                width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '10px 12px', fontSize: 14, lineHeight: 1.65,
                resize: 'vertical', outline: 'none', color: '#1e293b',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = '#6366f1' }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0' }}
            />
          )}

          {/* Word count */}
          {!locked && section.content && (
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>
              {section.content.split(/\s+/).filter(Boolean).length} words
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ExtendedWritingPanelProps {
  noteId: string
  description: string | null | undefined
  noteStatus: string
  onDescriptionSaved: (newDescription: string) => void
}

export const ExtendedWritingPanel: React.FC<ExtendedWritingPanelProps> = ({
  noteId,
  description,
  noteStatus,
  onDescriptionSaved,
}) => {
  const { t } = useTranslation('landing');
  const [doc, setDoc]           = useState<JournalDoc>(() => parseDoc(description))
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const dirty = useRef(false)

  const locked = noteStatus === 'submitted' || noteStatus === 'promoted'

  // Update a section
  const updateSection = useCallback((id: string, updated: ExtendedSection) => {
    dirty.current = true
    setDoc(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? updated : s),
    }))
  }, [])

  // Delete a section
  const deleteSection = useCallback((id: string) => {
    if (!window.confirm('Remove this section?')) return
    dirty.current = true
    setDoc(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== id) }))
  }, [])

  // Add a new section
  const addSection = (type: SectionType) => {
    const meta = SECTION_META[type]
    const section: ExtendedSection = {
      id: genId(),
      type,
      heading: meta.label,
      content: '',
      added_at: new Date().toISOString(),
    }
    dirty.current = true
    setDoc(prev => ({ ...prev, sections: [...prev.sections, section] }))
    setShowAddMenu(false)
  }

  // Save to backend
  const save = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const newDescription = serialiseDoc(doc)
      await fieldNoteApi.update(noteId, { description: newDescription })
      onDescriptionSaved(newDescription)
      dirty.current = false
      setSaveMsg('Saved ✓')
      setTimeout(() => setSaveMsg(null), 2500)
    } catch (e: any) {
      setSaveMsg('Save failed — ' + (e?.response?.data?.detail ?? e?.message ?? 'try again'))
    } finally {
      setSaving(false)
    }
  }

  const totalWords = doc.sections.reduce(
    (acc, s) => acc + (s.content?.split(/\s+/).filter(Boolean).length ?? 0), 0
  )

  return (
    <div style={{ marginTop: 32 }}>
      {/* Panel heading */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: 0 }}>{t('components_student_extendedwritingpanel.extended_writing', '📝 Extended Writing')}</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
            {locked
              ? 'This entry has been submitted and is read-only.'
              : 'Deepen your field observations. Add as many sections as you need to show your full understanding.'}
          </p>
        </div>

        {/* Save button + word count */}
        {!locked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {totalWords > 0 && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{totalWords} words</span>
            )}
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.startsWith('Save') ? '#ef4444' : '#16a34a' }}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: '#4f46e5', color: 'white', fontWeight: 600, fontSize: 13,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '2px dashed #e2e8f0', marginBottom: 20 }} />

      {/* Empty state */}
      {doc.sections.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '32px 24px', background: '#f8fafc',
          borderRadius: 10, border: '1px dashed #cbd5e1', marginBottom: 16,
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📓</div>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
            {locked
              ? 'No extended writing was added before submission.'
              : 'Use the sections below to go deeper than your field notes.\nAnalyse your evidence, reflect on what you learned, record connections, and track your questions.'}
          </p>
        </div>
      )}

      {/* Sections */}
      {doc.sections.map(section => (
        <SectionEditor
          key={section.id}
          section={section}
          onChange={updated => updateSection(section.id, updated)}
          onDelete={() => deleteSection(section.id)}
          locked={locked}
        />
      ))}

      {/* Add section */}
      {!locked && (
        <div style={{ marginTop: 8 }}>
          {showAddMenu ? (
            <div style={{
              border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
              background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              {SECTION_ORDER.map((type, i) => {
                const meta = SECTION_META[type]
                return (
                  <button
                    key={type}
                    onClick={() => addSection(type)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: i < SECTION_ORDER.length - 1 ? '1px solid #f1f5f9' : 'none',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{meta.emoji}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                        {meta.label}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                        {meta.placeholder.slice(0, 80)}…
                      </p>
                    </div>
                  </button>
                )
              })}
              <button
                onClick={() => setShowAddMenu(false)}
                style={{
                  width: '100%', padding: '10px 16px', background: '#f8fafc',
                  border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddMenu(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '12px 0', border: '2px dashed #cbd5e1', borderRadius: 8,
                background: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14, fontWeight: 600,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'
                ;(e.currentTarget as HTMLElement).style.color = '#4f46e5'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'
                ;(e.currentTarget as HTMLElement).style.color = '#64748b'
              }}
            >
              <Plus size={16} /> Add Section
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ExtendedWritingPanel
