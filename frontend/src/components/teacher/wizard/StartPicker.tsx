// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ActivityWizard.module.css';
import type { StartKey } from './WizardShell';

interface StartPickerProps {
  onPick: (key: StartKey) => void;
}

/** "What do you want to start from?" — four radio cards. Picking one starts the wizard. */
export const StartPicker: React.FC<StartPickerProps> = ({ onPick }) => {
  const { t } = useTranslation('landing');
  const [value, setValue] = useState<StartKey | ''>('');

  const options: { key: StartKey; icon: string; title: string; note: string }[] = [
    {
      key: 'basics', icon: '📍',
      title: t('components_teacher_activitywizard.start_location', 'A location'),
      note: t('components_teacher_activitywizard.start_location_note', 'I know where students will be. Peri suggests what to do there.'),
    },
    {
      key: 'experience', icon: '🧭',
      title: t('components_teacher_activitywizard.start_type', 'An activity type'),
      note: t('components_teacher_activitywizard.start_type_note', 'Wayfaring walk or investigation. I will choose the place next.'),
    },
    {
      key: 'assessment', icon: '📐',
      title: t('components_teacher_activitywizard.start_assessment', 'An assessment'),
      note: t('components_teacher_activitywizard.start_assessment_note', 'Start from a standard, taxonomy level or rubric, then build backwards.'),
    },
    {
      key: 'outcomes', icon: '🎯',
      title: t('components_teacher_activitywizard.start_outcomes', 'Learning outcomes'),
      note: t('components_teacher_activitywizard.start_outcomes_note', 'I know what students should be able to do. Peri suggests matching standards.'),
    },
  ];

  return (
    <>
      <p className={styles.eyebrow}>{t('components_teacher_activitywizard.lets_begin', "Let's begin")}</p>
      <h2 className={styles.stepTitle} tabIndex={-1} data-step-title>
        {t('components_teacher_activitywizard.start_title', 'What do you want to start from?')}
      </h2>
      <p className={styles.lede}>
        {t('components_teacher_activitywizard.start_lede', 'Pick the part of the activity you already have in mind. Peri will ask for the rest, in the order that makes sense from there. You can change anything later.')}
      </p>
      <div className={`${styles.cards} ${styles.cardsTwo}`} role="group" aria-label={t('components_teacher_activitywizard.start_group', 'Start from')}>
        {options.map(o => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            className={`${styles.card} ${value === o.key ? styles.cardOn : ''}`}
            onClick={() => { setValue(o.key); onPick(o.key); }}
          >
            <span className={styles.cardIcon} aria-hidden="true">{o.icon}</span>
            <span className={styles.cardTitle}>{o.title}</span>
            <span className={styles.cardNote}>{o.note}</span>
          </button>
        ))}
      </div>
    </>
  );
};

export default StartPicker;
