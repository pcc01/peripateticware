// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WikiLocationInfo } from '../WikiLocationInfo';
import styles from './ActivityWizard.module.css';

type WikiInfo = Parameters<React.ComponentProps<typeof WikiLocationInfo>['onInfoLoaded']>[0];

interface AboutPlaceDialogProps {
  open: boolean;
  onClose: () => void;
  locationName: string;
  latitude: number;
  longitude: number;
  subject?: string;
  onInfoLoaded: (info: WikiInfo) => void;
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "About this place" pop-out. The WikiLocationInfo instance stays mounted
 * (just hidden) whenever coordinates are set, so the Wikipedia/Wikidata lookup
 * runs as soon as a location is chosen — exactly as the old always-visible
 * Background & Context column did — and onInfoLoaded keeps saving
 * location_wiki_data on the activity. Opening the dialog only reveals it.
 *
 * Accessibility: role="dialog", aria-modal, labelled by the place name; focus
 * moves in on open, Tab is trapped, Escape and the scrim close it, and focus
 * returns to whatever opened it.
 */
export const AboutPlaceDialog: React.FC<AboutPlaceDialogProps> = ({
  open, onClose, locationName, latitude, longitude, subject, onInfoLoaded,
}) => {
  const { t } = useTranslation('landing');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const hasCoords = !!(latitude && longitude);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { openerRef.current?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!hasCoords) return null;

  return (
    <div
      className={`${styles.scrim} ${open ? '' : styles.scrimHidden}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="about-place-title" hidden={!open}>
        <div className={styles.dialogHead}>
          <div style={{ flex: 1 }}>
            <p className={styles.eyebrow}>{t('components_teacher_activitywizard.about_place', 'About this place')}</p>
            <h2 id="about-place-title" className={styles.dialogTitle}>{locationName || t('components_teacher_activitywizard.this_place', 'This place')}</h2>
          </div>
          <button ref={closeRef} type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('components_teacher_activitywizard.close_dialog', 'Close dialog')}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className={styles.dialogBody}>
          <WikiLocationInfo
            latitude={latitude}
            longitude={longitude}
            subject={subject}
            locationName={locationName}
            onInfoLoaded={onInfoLoaded}
          />
        </div>
        <div className={styles.dialogFoot}>
          <button type="button" className={styles.btn} onClick={onClose}>{t('components_teacher_activitywizard.close', 'Close')}</button>
        </div>
      </div>
    </div>
  );
};

export default AboutPlaceDialog;
