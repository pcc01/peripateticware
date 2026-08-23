// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ImageCaptionModal -- small popover used by AdminBlogEditorPage to collect
 * alt text / caption / attribution for a body image, either right after
 * it's uploaded ("insert" mode) or when an admin wants to edit those on an
 * image already in the post ("edit" mode). Caption/attribution are both
 * optional -- leaving them blank just inserts a plain ![alt](url) with no
 * "^caption | attribution" tag line, same as before this existed.
 */

import React from 'react';

export interface CaptionModalState {
  mode: 'insert' | 'edit';
  url: string;
  alt: string;
  caption: string;
  attribution: string;
  /** edit mode only -- the content offsets of the image (+ its existing
   *  caption line, if any) being edited, so the caller can splice the
   *  rebuilt markdown back into the same spot. */
  spanIndex?: number;
  spanLength?: number;
}

interface Props {
  state: CaptionModalState;
  onChange: (next: CaptionModalState) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImageCaptionModal({ state, onChange, onConfirm, onCancel }: Props) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
    fontSize: '0.9rem', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 };

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg, var(--surface))', borderRadius: 14, maxWidth: 440, width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img src={state.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            {state.mode === 'insert' ? 'Add caption?' : 'Edit image caption'}
          </h3>
        </div>

        <div>
          <label style={labelStyle}>Alt text <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(for screen readers)</span></label>
          <input style={inputStyle} value={state.alt} onChange={(e) => onChange({ ...state, alt: e.target.value })} placeholder="Describe the image" />
        </div>
        <div>
          <label style={labelStyle}>Caption <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional -- shown under the image)</span></label>
          <input style={inputStyle} value={state.caption} onChange={(e) => onChange({ ...state, caption: e.target.value })} placeholder="A trail marker on the ridge" />
        </div>
        <div>
          <label style={labelStyle}>Attribution <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional -- e.g. photo credit)</span></label>
          <input style={inputStyle} value={state.attribution} onChange={(e) => onChange({ ...state, attribution: e.target.value })} placeholder="Photo: Jane Doe" />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            {state.mode === 'insert' ? 'Insert Image' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
