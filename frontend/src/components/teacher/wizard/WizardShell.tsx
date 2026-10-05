// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * WizardShell — the sliding-pane frame for the guided Create Activity flow.
 *
 * Presentational only: it owns "which step is showing" and the slide/rail/
 * footer chrome, nothing about the activity itself. Every pane stays mounted
 * (so typed values and open chapters survive Back/Next); off-screen panes are
 * `inert` and `visibility:hidden` so they leave the tab order and the
 * accessibility tree.
 *
 * Start-point behaviour: the teacher picks what they want to start from; that
 * step becomes first and the others follow in canonical order, ending at
 * Review. When editing an existing activity there is nothing to ask, so the
 * chooser is skipped (`skipStart`).
 */

import React, { createContext, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ActivityWizard.module.css';

export type StepKey = 'basics' | 'experience' | 'assessment' | 'outcomes' | 'review';
export type StartKey = Exclude<StepKey, 'review'>;

export const CANONICAL_ORDER: StartKey[] = ['basics', 'experience', 'assessment', 'outcomes'];

export function buildOrder(start: StartKey | null): StepKey[] {
  const first: StartKey = start ?? 'basics';
  return [first, ...CANONICAL_ORDER.filter(k => k !== first), 'review'];
}

export interface WizardApi {
  goTo: (key: StepKey) => void;
}

interface WizardContextValue extends WizardApi {
  /** The step currently showing, or null while the start chooser is up. */
  current: StepKey | null;
  /** Step order for this run, so a pane can say "Step 2 of 5". */
  order: StepKey[];
}

const WizardContext = createContext<WizardContextValue>({ goTo: () => undefined, current: null, order: buildOrder(null) });
export const useWizard = () => useContext(WizardContext);

interface WizardShellProps {
  panes: Record<StepKey, React.ReactNode>;
  labels: Record<StepKey, string>;
  /** Content of the "what do you want to start from?" pane. Receives the pick callback. */
  renderStart: (pick: (key: StartKey) => void) => React.ReactNode;
  /** Skip the chooser (editing an existing activity). */
  skipStart?: boolean;
  /** Return false to block leaving a step (e.g. validation on Basics). */
  canLeave?: (key: StepKey) => boolean;
  /** Label for the final submit button. */
  submitLabel: React.ReactNode;
  submitting?: boolean;
  /** Extra buttons shown beside Back on every step (e.g. Cancel). */
  footerExtra?: React.ReactNode;
  apiRef?: React.Ref<WizardApi>;
  /** Called whenever the showing step changes (null = start chooser). */
  onStepChange?: (key: StepKey | null) => void;
}

export const WizardShell: React.FC<WizardShellProps> = ({
  panes, labels, renderStart, skipStart, canLeave, submitLabel, submitting, footerExtra, apiRef, onStepChange,
}) => {
  const { t } = useTranslation('landing');
  const [order, setOrder] = useState<StepKey[]>(() => buildOrder(null));
  const [idx, setIdx] = useState<number>(skipStart ? 0 : -1); // -1 = start pane
  const [maxSeen, setMaxSeen] = useState(0);
  const [announce, setAnnounce] = useState('');
  const paneRefs = useRef<Record<string, HTMLElement | null>>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusTitle = useCallback((key: string) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // After the slide finishes, so focus does not jump while the pane is moving.
    focusTimer.current = setTimeout(() => {
      const el = paneRefs.current[key]?.querySelector<HTMLElement>('[data-step-title]');
      el?.focus({ preventScroll: true });
    }, 360);
  }, []);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

  const go = useCallback((i: number) => {
    setIdx(i);
    setMaxSeen(m => Math.max(m, i));
    const key = i < 0 ? 'start' : order[i];
    if (i >= 0) setAnnounce(
      t('components_teacher_activitywizard.step_announce', 'Step {{n}} of {{total}}: {{label}}', { n: i + 1, total: order.length, label: labels[order[i]] }),
    );
    scrollPaneTop(paneRefs.current[key]);
    focusTitle(key);
  }, [order, labels, t, focusTitle]);

  const goTo = useCallback((key: StepKey) => {
    const i = order.indexOf(key);
    if (i >= 0) go(i);
  }, [order, go]);

  useImperativeHandle(apiRef, () => ({ goTo }), [goTo]);

  const pick = (key: StartKey) => {
    const next = buildOrder(key);
    setOrder(next);
    setMaxSeen(0);
    setIdx(0);
    setAnnounce(
      t('components_teacher_activitywizard.step_announce', 'Step {{n}} of {{total}}: {{label}}', { n: 1, total: next.length, label: labels[next[0]] }),
    );
    focusTitle(next[0]);
  };

  const last = idx === order.length - 1;
  const onNext = () => {
    if (idx < 0 || last) return;
    if (canLeave && !canLeave(order[idx])) return;
    go(idx + 1);
  };
  const onBack = () => {
    if (idx === 0 && !skipStart) { go(-1); return; }
    if (idx > 0) go(idx - 1);
  };

  const paneClass = (i: number) =>
    `${styles.pane} ${i < idx ? styles.before : i > idx ? styles.after : ''}`;

  const started = idx >= 0;
  const currentKey: StepKey | null = started ? order[idx] : null;
  useEffect(() => { onStepChange?.(currentKey); }, [currentKey, onStepChange]);
  const progress = started && order.length > 1 ? (idx / (order.length - 1)) * 100 : 0;

  return (
    <WizardContext.Provider value={{ goTo, current: started ? order[idx] : null, order }}>
      <div className={styles.panel}>
        {started && (
          <nav className={styles.rail} aria-label={t('components_teacher_activitywizard.progress', 'Progress')}>
            <ol>
              {order.map((key, i) => (
                <li key={key} className={i < idx ? styles.done : i === idx ? styles.now : ''}>
                  <button
                    type="button"
                    className={styles.railBtn}
                    disabled={i > maxSeen}
                    aria-current={i === idx ? 'step' : undefined}
                    onClick={() => { if (i !== idx && (i < idx || !canLeave || canLeave(order[idx]))) go(i); }}
                  >
                    <span className={styles.dot} aria-hidden="true">{i < idx ? '✓' : i + 1}</span>
                    <span className={styles.railLabel}>{labels[key]}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ width: `${progress}%` }} /></div>
          </nav>
        )}

        <div className={styles.viewport}>
          {!skipStart && (
            <section
              ref={el => { paneRefs.current.start = el; }}
              className={`${styles.pane} ${started ? styles.before : ''}`}
              aria-label={t('components_teacher_activitywizard.start_pane', 'Choose where to start')}
              inert={started}
            >
              {renderStart(pick)}
            </section>
          )}
          {order.map((key, i) => (
            <section
              key={key}
              ref={el => { paneRefs.current[key] = el; }}
              className={paneClass(i)}
              aria-label={labels[key]}
              inert={i !== idx}
            >
              {React.isValidElement(panes[key]) ? panes[key] : <>{panes[key]}</>}
            </section>
          ))}
        </div>

        {started && (
          <div className={styles.footer}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack} disabled={idx === 0 && !!skipStart}>
              {idx === 0 && !skipStart
                ? t('components_teacher_activitywizard.change_start', 'Change start point')
                : t('components_teacher_activitywizard.back', 'Back')}
            </button>
            {footerExtra}
            <span className={styles.spacer} />
            {last ? (
              <button type="submit" className={styles.btn} disabled={submitting}>{submitLabel}</button>
            ) : (
              <button type="button" className={styles.btn} onClick={onNext}>
                {t('components_teacher_activitywizard.next', 'Next')}
              </button>
            )}
          </div>
        )}
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">{announce}</div>
    </WizardContext.Provider>
  );
};

function scrollPaneTop(el: HTMLElement | null | undefined) {
  if (el) el.scrollTop = 0;
}

export default WizardShell;
