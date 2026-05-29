import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * CaptureToolbar — MERGED VERSION (Phase 7 update)
 * Audio now routes through AudioCapture (30s max, WebM/Opus, no ASR).
 * All other capture types unchanged.
 */

import React, { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Camera, Grid3x3, Mic, Ruler, Type } from 'lucide-react';
import type { CaptureType, CaptureFormData, SessionContext } from '../../types/student';
import { useCaptureStore } from '../../stores/student';
import { AudioCapture } from '../student/AudioCapture';
import type { AudioCaptureResult } from '../../types/phase7';

interface CaptureToolbarProps {
  sessionContext: SessionContext;
  onCaptureSaved?: (id: string) => void;
  /** Context for audio uploads — defaults to 'activity' */
  audioContextType?: 'activity' | 'field_note' | 'peer_project_response';
  audioContextId?: string;
  audioMaxSeconds?: number;
}

export const CaptureToolbar: React.FC<CaptureToolbarProps> = ({
  sessionContext,
  onCaptureSaved,
  audioContextType = 'activity',
  audioContextId,
  audioMaxSeconds = 30
}) => {
  const { t } = useTranslation('landing');
  const [activeType, setActiveType] = useState<CaptureType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { loading, error } = useCaptureStore();

  const nonAudioTypes: {type: CaptureType;icon: React.ReactNode;label: string;}[] = [
  { type: 'photo', icon: <Camera className="w-5 h-5" />, label: 'Photo' },
  { type: 'video', icon: <Camera className="w-5 h-5" />, label: 'Video' },
  { type: 'text', icon: <Type className="w-5 h-5" />, label: 'Text' },
  { type: 'sketch', icon: <Grid3x3 className="w-5 h-5" />, label: 'Sketch' },
  { type: 'measurement', icon: <Ruler className="w-5 h-5" />, label: 'Measure' }];


  const handleTypeSelect = (type: CaptureType) => {
    setActiveType((prev) => prev === type ? null : type);
  };

  const handleFileCapture = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeType) return;
    const file = files[0];
    const data: CaptureFormData = {
      title: file.name,
      description: `Captured ${activeType}`,
      capture_type: activeType,
      file,
      learning_objectives: sessionContext.learning_objectives.map((o) => o.id),
      competencies: sessionContext.competencies.map((c) => c.id)
    };
    try {
      await useCaptureStore.getState().createCapture(sessionContext.session_id, data);
      setActiveType(null);
      onCaptureSaved?.(sessionContext.session_id);
    } catch (err) {
      console.error('Failed to save capture:', err);
    }
  };

  const handleAudioCaptured = (result: AudioCaptureResult) => {
    setActiveType(null);
    onCaptureSaved?.(result.id);
  };

  if (loading) {
    return (
      <div className={clsx('p-[var(--spacing-4)] text-center',
      'text-[var(--color-gray-600)]')}>{t("landing:saving", "Saving...")}

      </div>);

  }

  if (error) {
    return (
      <div className={clsx('p-[var(--spacing-4)] text-center',
      'text-[var(--color-error-600)] bg-[var(--color-error-50)]',
      'border border-[var(--color-error-200)] rounded-[var(--radius-md)]')}>
        {error}
      </div>);

  }

  return (
    <div className={clsx(
      'space-y-4 p-[var(--spacing-4)]',
      'border border-[var(--color-gray-200)] rounded-[var(--radius-lg)]',
      'bg-[var(--color-gray-50)]'
    )}>
      <h3 className="font-semibold text-lg text-[var(--color-gray-900)]">{t("landing:capture_evidence", "Capture Evidence")}

      </h3>

      <div className="grid grid-cols-3 gap-2">
        {nonAudioTypes.map((ct) =>
        <button
          key={ct.type}
          onClick={() => handleTypeSelect(ct.type)}
          className={clsx(
            'p-3 rounded-lg border-2 transition text-sm',
            activeType === ct.type ?
            'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' :
            'border-[var(--color-gray-200)] bg-white hover:border-[var(--color-gray-300)]'
          )}>
          
            <div className="flex flex-col items-center gap-1">
              {ct.icon}
              <span className="text-xs font-medium">{ct.label}</span>
            </div>
          </button>
        )}

        {/* Audio — opens inline AudioCapture (30s cap, no ASR) */}
        <button
          onClick={() => handleTypeSelect('audio')}
          className={clsx(
            'p-3 rounded-lg border-2 transition text-sm',
            activeType === 'audio' ?
            'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' :
            'border-[var(--color-gray-200)] bg-white hover:border-[var(--color-gray-300)]'
          )}>
          
          <div className="flex flex-col items-center gap-1">
            <Mic className="w-5 h-5" />
            <span className="text-xs font-medium">{t("landing:audio", "Audio")}</span>
          </div>
        </button>
      </div>

      {/* File input for non-audio types */}
      {activeType && activeType !== 'audio' &&
      <div className="mt-2 p-3 bg-white border rounded-lg">
          <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => handleFileCapture(e.target.files)}
          accept={
          activeType === 'photo' ? 'image/*' :
          activeType === 'video' ? 'video/*' :
          activeType === 'sketch' ? 'image/*' :
          '*'
          }
          className="w-full text-sm" />
        
          <canvas ref={canvasRef} className="hidden" />
          <video ref={videoRef} className="hidden" />
        </div>
      }

      {/* AudioCapture — inline, 30s max, uploads, transcript=null */}
      {activeType === 'audio' &&
      <AudioCapture
        contextType={audioContextType}
        contextId={audioContextId || sessionContext.session_id}
        maxSeconds={audioMaxSeconds}
        onCaptured={handleAudioCaptured}
        onError={(msg) => console.error('Audio capture error:', msg)} />

      }

      <div className="text-sm text-[var(--color-gray-600)] border-t pt-2">
        <span className="font-medium">{t("landing:capturetoolbar.activity", "Activity:")}</span> {sessionContext.activity_name}
      </div>
    </div>);

};

export default CaptureToolbar;