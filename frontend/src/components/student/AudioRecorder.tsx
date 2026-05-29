import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/components/student/AudioRecorder.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square, Trash2 } from 'lucide-react';
import type { AudioRecordingState } from '../../types/phase7';

interface AudioRecorderProps {
  maxSeconds?: number;
  onRecordingComplete: (blob: Blob, durationSeconds: number) => void;
  onDiscard?: () => void;
  disabled?: boolean;
}

const FORMAT_TIME = (secs: number) =>
`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  maxSeconds = 30,
  onRecordingComplete,
  onDiscard,
  disabled = false
}) => {
  const { t } = useTranslation('landing');
  const [state, setState] = useState<AudioRecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);

  // Canvas waveform
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b82f6';
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;
      if (i === 0) ctx.moveTo(x, y);else
      ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Choose best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ?
      'audio/webm;codecs=opus' :
      MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ?
      'audio/ogg;codecs=opus' :
      'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(recorded);
        setBlob(recorded);
        setBlobUrl(url);
        setDuration(elapsed);
        setState('stopped');
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        // Clean up analyser
        analyser.disconnect();
        audioCtx.close();
      };

      recorder.start(100); // collect data every 100ms
      setState('recording');
      setElapsed(0);

      // Timer + auto-stop at maxSeconds
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= maxSeconds) {
            stopRecording();
          }
          return next;
        });
      }, 1000);

      // Start waveform animation
      drawWaveform();
    } catch (err: any) {
      setError(err.name === 'NotAllowedError' ?
      'Microphone access denied. Please allow microphone in your browser settings.' :
      'Could not access microphone.');
      setState('error');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  };

  const handleKeep = () => {
    if (blob && duration > 0) {
      onRecordingComplete(blob, duration);
      setState('done');
    }
  };

  const handleDiscard = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setBlob(null);
    setDuration(0);
    setElapsed(0);
    setState('idle');
    onDiscard?.();
  };

  const progress = Math.min(elapsed / maxSeconds * 100, 100);
  const remaining = maxSeconds - elapsed;
  const isNearEnd = remaining <= 5 && state === 'recording';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">{t("landing:audio_recording", "Audio Recording")}</h4>
        <span className="text-xs text-gray-400">{t("landing:max", "Max")}{maxSeconds}{t("landing:audiorecorder.s", "s")}</span>
      </div>

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        width={320}
        height={48}
        className="w-full rounded bg-gray-50 border" />
      

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${
          isNearEnd ? 'bg-red-500' : 'bg-blue-500'}`
          }
          style={{ width: `${progress}%` }} />
        
      </div>

      {/* Timer */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{FORMAT_TIME(elapsed)}</span>
        <span className={isNearEnd ? 'text-red-500 font-semibold' : ''}>
          {state === 'recording' ? `${remaining}s left` : FORMAT_TIME(maxSeconds)}
        </span>
      </div>

      {/* Error */}
      {error &&
      <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>
      }

      {/* Controls */}
      <div className="flex gap-2 justify-center">
        {state === 'idle' &&
        <button
          onClick={startRecording}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition text-sm font-medium">


          
            <Mic className="w-4 h-4" />{t("landing:start_recording", "Start Recording")}

        </button>
        }

        {state === 'recording' &&
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg
                       hover:bg-red-700 transition text-sm font-medium animate-pulse">

          
            <Square className="w-4 h-4 fill-current" />{t("landing:stop", "Stop")}

        </button>
        }

        {state === 'stopped' && blobUrl &&
        <>
            <audio src={blobUrl} controls className="flex-1 h-8" />
            <button
            onClick={handleKeep}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700
                         transition text-sm font-medium">{t("landing:keep", "Keep")}



          </button>
            <button
            onClick={handleDiscard}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600
                         rounded-lg hover:bg-gray-200 transition text-sm">

            
              <Trash2 className="w-3 h-3" />{t("landing:discard", "Discard")}

          </button>
          </>
        }

        {state === 'done' &&
        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
            <MicOff className="w-4 h-4" />{t("landing:audiorecorder.recording_saved", "Recording saved (")}
          {FORMAT_TIME(duration)})
          </div>
        }
      </div>
    </div>);

};

export default AudioRecorder;