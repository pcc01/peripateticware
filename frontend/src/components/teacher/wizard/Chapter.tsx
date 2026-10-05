// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ActivityWizard.module.css';
import { StepKey, useWizard } from './WizardShell';

interface ChapterProps {
  title: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Keeps the chapter open regardless of the teacher's toggle (a field inside has an error). */
  forceOpen?: boolean;
  children: React.ReactNode;
}

/** The existing collapsing "chapter" (native details) — kept inside every wizard pane. */
export const Chapter: React.FC<ChapterProps> = ({ title, badge, defaultOpen = false, forceOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={styles.chapter}
      open={open || forceOpen}
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={styles.chapterSummary}>
        <span className={styles.chevron} aria-hidden="true">▶</span>
        <h3 className={styles.chapterTitle}>{title}</h3>
        {badge != null && <span className={styles.badge}>{badge}</span>}
      </summary>
      <div className={styles.chapterBody}>{children}</div>
    </details>
  );
};

interface PaneHeaderProps {
  stepKey: StepKey;
  title: string;
  lede?: string;
}

/** "Step n of N" eyebrow, the focus target for step changes, and a one-line lede. */
export const PaneHeader: React.FC<PaneHeaderProps> = ({ stepKey, title, lede }) => {
  const { t } = useTranslation('landing');
  const { order } = useWizard();
  const n = order.indexOf(stepKey) + 1;
  return (
    <>
      <p className={styles.eyebrow}>
        {stepKey === 'review'
          ? t('components_teacher_activitywizard.last_step', 'Last step')
          : t('components_teacher_activitywizard.step_of', 'Step {{n}} of {{total}}', { n, total: order.length })}
      </p>
      <h2 className={styles.stepTitle} tabIndex={-1} data-step-title>{title}</h2>
      {lede && <p className={styles.lede}>{lede}</p>}
    </>
  );
};

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  icon?: string;
  title: React.ReactNode;
  note: React.ReactNode;
}

/** Radio-style card. Uses aria-pressed buttons: a plain group of toggles, no arrow-key radiogroup contract to honour. */
export const ChoiceCard: React.FC<ChoiceCardProps> = ({ selected, onSelect, icon, title, note }) => (
  <button type="button" aria-pressed={selected} onClick={onSelect} className={`${styles.card} ${selected ? styles.cardOn : ''}`}>
    {icon && <span className={styles.cardIcon} aria-hidden="true">{icon}</span>}
    <span className={styles.cardTitle}>{title}</span>
    <span className={styles.cardNote}>{note}</span>
  </button>
);
