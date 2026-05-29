import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/components/student/AudioPlayer.tsx

import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  durationSeconds?: number;
  label?: string;
}

const FORMAT_TIME = (secs: number) =>
`${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, durationSeconds, label }) => {
  const { t } = useTranslation('landing');
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => {setIsPlaying(false);setCurrentTime(0);};
    const onError = () => setError('Could not load audio');

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setError('Playback failed'));
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  };

  const handleRateChange = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const progress = duration > 0 ? currentTime / duration * 100 : 0;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" />
      {label && <p className="text-xs text-gray-500 truncate">{label}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Progress slider */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="w-full h-1.5 accent-blue-600 cursor-pointer" />
      

      <div className="flex items-center justify-between gap-2">
        {/* Time */}
        <span className="text-xs text-gray-500 tabular-nums min-w-[72px]">
          {FORMAT_TIME(currentTime)} / {FORMAT_TIME(duration)}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRestart}
            className="p-1 text-gray-500 hover:text-gray-700 rounded"
            title={t("landing:restart", "Restart")}>
            
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={togglePlay}
            className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition">
            
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button
            onClick={handleRateChange}
            className="text-xs px-1.5 py-0.5 bg-gray-200 rounded hover:bg-gray-300 tabular-nums">
            
            {playbackRate}×
          </button>
        </div>

        {/* Visual progress */}
        <div className="text-xs text-gray-400">{Math.round(progress)}%</div>
      </div>
    </div>);

};

// ============================================================================
// AudioCapture — recorder + upload wrapper
// ============================================================================

// frontend/src/components/student/AudioCapture.tsx

import { Loader2 } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { audioApi } from '../../services/phase7Api';
import type { AudioCaptureResult } from '../../types/phase7';

interface AudioCaptureProps {
  contextType: 'activity' | 'field_note' | 'peer_project_response';
  contextId?: string;
  maxSeconds?: number;
  onCaptured: (result: AudioCaptureResult) => void;
  onError?: (message: string) => void;
  location?: {lat: number;lng: number;};
}

export const AudioCapture: React.FC<AudioCaptureProps> = ({
  contextType,
  contextId,
  maxSeconds = 30,
  onCaptured,
  onError,
  location
}) => {
  const { t } = useTranslation('landing');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<AudioCaptureResult | null>(null);

  const handleRecordingComplete = async (blob: Blob, durationSeconds: number) => {
    setUploading(true);
    setUploadError(null);
    try {
      const capture = await audioApi.upload(blob, durationSeconds, contextType, contextId, location);
      setResult(capture);
      onCaptured(capture);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Upload failed. Please try again.';
      setUploadError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  if (uploading) {
    return (
      <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
        <span className="text-sm text-blue-700">{t("landing:uploading_audio", "Uploading audio\u2026")}</span>
      </div>);

  }

  if (result) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-green-600 font-medium">{t("landing:audio_recorded", "\u2713 Audio recorded (")}{result.duration_seconds}{t("landing:audiocapture.s", "s)")}</p>
        <AudioPlayer
          src={audioApi.streamUrl(result.id)}
          durationSeconds={result.duration_seconds}
          label="Your recording" />
        
      </div>);

  }

  return (
    <div className="space-y-2">
      <AudioRecorder
        maxSeconds={maxSeconds}
        onRecordingComplete={handleRecordingComplete} />
      
      {uploadError &&
      <div className="text-sm text-red-600 bg-red-50 rounded p-2">{uploadError}</div>
      }
    </div>);

};

export default AudioCapture;