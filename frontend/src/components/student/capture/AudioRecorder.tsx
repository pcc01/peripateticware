// frontend/src/components/student/AudioRecorder.tsx
// Phase 7 — Audio Capture (no ASR)
// Records audio using MediaRecorder API, stores as WebM/Opus or OGG/Opus.
// Displays a live MM:SS timer and simple amplitude waveform.

import { useEffect, useRef, useState } from "react";

interface AudioRecorderProps {
  /** Called with (audioBlob, durationSeconds) when user confirms keep */
  onSave: (blob: Blob, durationSeconds: number) => void;
  /** Maximum recording duration in seconds. Default: 300 (5 min) */
  maxDurationSeconds?: number;
  /** Called when user discards the recording */
  onDiscard?: () => void;
}

type RecordingState = "idle" | "recording" | "stopped";

export const AudioRecorder = ({
  onSave,
  maxDurationSeconds = 300,
  onDiscard,
}: AudioRecorderProps) => {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);        // seconds
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const analyserRef       = useRef<AnalyserNode | null>(null);
  const animFrameRef      = useRef<number | null>(null);
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedBlobRef      = useRef<Blob | null>(null);
  const mimeTypeRef       = useRef<string>("audio/webm;codecs=opus");

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const getWarnThreshold = () => Math.floor(maxDurationSeconds * 0.8);

  // --------------------------------------------------------------------------
  // Waveform drawing
  // --------------------------------------------------------------------------

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ef4444"; // red — recording indicator
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  // --------------------------------------------------------------------------
  // Start recording
  // --------------------------------------------------------------------------

  const startRecording = async () => {
    chunksRef.current = [];
    setElapsed(0);
    setAudioUrl(null);
    savedBlobRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Web Audio for waveform
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine best supported MIME type
      const preferred = "audio/webm;codecs=opus";
      const fallback  = "audio/ogg;codecs=opus";
      const mimeType  = MediaRecorder.isTypeSupported(preferred) ? preferred : fallback;
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        savedBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      recorder.start(100); // collect data every 100ms
      mediaRecorderRef.current = recorder;
      setRecordingState("recording");

      // Timer
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= maxDurationSeconds) {
            stopRecording();
            return maxDurationSeconds;
          }
          return prev + 1;
        });
      }, 1000);

      // Start waveform animation
      drawWaveform();
    } catch (err) {
      console.error("Microphone access denied or unavailable:", err);
      alert("Microphone access is required to record audio. Please grant permission and try again.");
    }
  };

  // --------------------------------------------------------------------------
  // Stop recording
  // --------------------------------------------------------------------------

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecordingState("stopped");
  };

  // --------------------------------------------------------------------------
  // Keep / Discard
  // --------------------------------------------------------------------------

  const handleKeep = () => {
    if (savedBlobRef.current) {
      onSave(savedBlobRef.current, elapsed);
    }
  };

  const handleDiscard = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setElapsed(0);
    setRecordingState("idle");
    savedBlobRef.current = null;
    onDiscard?.();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  const isWarning = elapsed >= getWarnThreshold() && recordingState === "recording";

  return (
    <div style={styles.container}>
      {/* Timer */}
      <div style={{ ...styles.timer, color: isWarning ? "#f59e0b" : "#e2e8f0" }}>
        {formatTime(elapsed)} / {formatTime(maxDurationSeconds)}
        {isWarning && <span style={styles.warningBadge}>Almost full</span>}
      </div>

      {/* Waveform canvas (visible during recording) */}
      {recordingState === "recording" && (
        <canvas ref={canvasRef} width={320} height={60} style={styles.canvas} />
      )}

      {/* Playback preview (visible after stopping) */}
      {recordingState === "stopped" && audioUrl && (
        <audio controls src={audioUrl} style={styles.previewPlayer} />
      )}

      {/* Controls */}
      <div style={styles.controls}>
        {recordingState === "idle" && (
          <button onClick={startRecording} style={styles.recordBtn} aria-label="Start recording">
            🎙️ Record
          </button>
        )}

        {recordingState === "recording" && (
          <button onClick={stopRecording} style={styles.stopBtn} aria-label="Stop recording">
            ⏹ Stop
          </button>
        )}

        {recordingState === "stopped" && (
          <>
            <button onClick={handleKeep} style={styles.keepBtn} aria-label="Keep recording">
              ✅ Keep
            </button>
            <button onClick={handleDiscard} style={styles.discardBtn} aria-label="Discard recording">
              🗑 Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------
// Styles (inline for portability; move to CSS module or Tailwind as preferred)
// --------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: 16,
    background: "#0f172a",
    borderRadius: 12,
    minWidth: 340,
  },
  timer: {
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 2,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  warningBadge: {
    fontSize: 12,
    fontWeight: "normal",
    background: "#92400e",
    color: "#fef3c7",
    padding: "2px 8px",
    borderRadius: 99,
  },
  canvas: {
    borderRadius: 8,
    width: 320,
    height: 60,
  },
  previewPlayer: {
    width: 320,
    marginTop: 4,
  },
  controls: {
    display: "flex",
    gap: 12,
  },
  recordBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 16,
    cursor: "pointer",
    fontWeight: "bold",
  },
  stopBtn: {
    background: "#475569",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 16,
    cursor: "pointer",
  },
  keepBtn: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 15,
    cursor: "pointer",
  },
  discardBtn: {
    background: "#374151",
    color: "#d1d5db",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 15,
    cursor: "pointer",
  },
};


// =============================================================================
// AudioPlayer.tsx
// Playback component with seek, play/pause, and speed control.
// =============================================================================

interface AudioPlayerProps {
  /** URL to the audio resource (blob URL or server URL) */
  src: string;
  /** Display label, e.g. "Field Note Recording — May 7, 2026" */
  label?: string;
  /** Duration in seconds (shown before audio loads metadata) */
  knownDurationSeconds?: number;
  /** Whether to show a download button */
  showDownload?: boolean;
}

export const AudioPlayer = ({
  src,
  label,
  knownDurationSeconds,
  showDownload = false,
}: AudioPlayerProps) => {
  const audioRef           = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(knownDurationSeconds ?? 0);
  const [speed, setSpeed]             = useState(1);
  const speeds                        = [1, 1.5, 2];

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleEnded = () => setIsPlaying(false);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const cycleSpeed = () => {
    const idx  = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div style={playerStyles.container}>
      {label && <div style={playerStyles.label}>{label}</div>}

      {/* Hidden HTML5 audio element */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        style={playerStyles.seekBar}
        aria-label="Audio seek"
      />

      {/* Time display */}
      <div style={playerStyles.timeRow}>
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div style={playerStyles.controls}>
        <button onClick={togglePlay} style={playerStyles.playBtn} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "⏸" : "▶"}
        </button>

        <button onClick={cycleSpeed} style={playerStyles.speedBtn} aria-label="Change playback speed">
          {speed}×
        </button>

        {showDownload && (
          <a href={src} download="recording" style={playerStyles.downloadLink} aria-label="Download recording">
            ⬇ Download
          </a>
        )}
      </div>
    </div>
  );
};

const playerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 16px",
    background: "#1e293b",
    borderRadius: 10,
    minWidth: 300,
  },
  label: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 4,
  },
  seekBar: {
    width: "100%",
    accentColor: "#3b82f6",
    cursor: "pointer",
  },
  timeRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  playBtn: {
    background: "#3b82f6",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 18px",
    fontSize: 18,
    cursor: "pointer",
  },
  speedBtn: {
    background: "#334155",
    color: "#cbd5e1",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: "bold",
  },
  downloadLink: {
    fontSize: 13,
    color: "#60a5fa",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: 6,
    background: "#1e3a5f",
  },
};


// =============================================================================
// TranscriptBlock — polls GET /api/v1/student/captures/:id until transcript appears
// =============================================================================

function TranscriptBlock({ captureId }: { captureId: string }) {
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(true);

  React.useEffect(() => {
    if (!captureId) return;
    const token = localStorage.getItem("auth_token") ?? "";
    let attempts = 0;
    const maxAttempts = 20; // poll for up to ~40s

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/v1/student/captures/${captureId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.transcript) {
            setTranscript(data.transcript);
            setPolling(false);
            clearInterval(interval);
          }
        }
      } catch { /* ignore */ }
      if (attempts >= maxAttempts) {
        setPolling(false);
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [captureId]);

  if (transcript) {
    return (
      <div style={{ marginTop: 8, padding: "8px 12px", background: "#f0fdf4", borderRadius: 8, fontSize: 13, color: "#166534" }}>
        <strong>Transcript:</strong> {transcript}
      </div>
    );
  }
  if (polling) {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", textAlign: "center" }}>
        ✍️ Transcribing…
      </div>
    );
  }
  return null;
}

// =============================================================================
// AudioCapture.tsx
// Wrapper component used inside CaptureToolbar.
// Handles: record → save blob → upload to server → show player.
// transcript is polled after upload (ASR enabled — karanchopda333/whisper via Ollama).
// =============================================================================

interface AudioCaptureProps {
  /** ID of the entity this audio is attached to (activity, field_note, peer_project_response) */
  contextId: string;
  contextType: "activity" | "field_note" | "peer_project_response";
  /** Called with the created StudentCapture object after upload succeeds */
  onCaptureCreated?: (capture: Record<string, unknown>) => void;
  maxDurationSeconds?: number;
}

type UploadState = "idle" | "uploading" | "done" | "error";

export const AudioCapture = ({
  contextId,
  contextType,
  onCaptureCreated,
  maxDurationSeconds = 300,
}: AudioCaptureProps) => {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [savedCapture, setSavedCapture] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRecorder, setShowRecorder] = useState(true);

  const getAuthToken = (): string => {
    // Replace with your actual auth token retrieval
    return localStorage.getItem("auth_token") ?? "";
  };

  const uploadAudio = async (blob: Blob, durationSeconds: number) => {
    setUploadState("uploading");
    setErrorMsg(null);

    try {
      const formData = new FormData();

      // Determine file extension from MIME type
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", blob, `recording.${ext}`);
      formData.append("capture_type", "audio");
      formData.append("duration_seconds", String(Math.round(durationSeconds)));
      formData.append(`${contextType}_id`, contextId);

      // Attach GPS if available
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              formData.append("latitude", String(pos.coords.latitude));
              formData.append("longitude", String(pos.coords.longitude));
              resolve();
            },
            () => resolve(), // ignore geolocation errors
            { timeout: 3000 }
          );
        });
      }

      const response = await fetch("/api/v1/student/captures/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.detail ?? `Upload failed (${response.status})`);
      }

      const capture = await response.json();
      setSavedCapture(capture);
      setUploadState("done");
      setShowRecorder(false);
      onCaptureCreated?.(capture);
    } catch (err) {
      console.error("Audio upload failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Upload failed. Will retry when online.");
      setUploadState("error");

      // TODO: queue for offline sync via IndexedDB / localforage
      // offlineQueue.enqueue({ type: "audio_upload", blob, contextId, contextType, durationSeconds });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showRecorder && (
        <AudioRecorder
          maxDurationSeconds={maxDurationSeconds}
          onSave={uploadAudio}
          onDiscard={() => setShowRecorder(false)}
        />
      )}

      {uploadState === "uploading" && (
        <div style={{ textAlign: "center", color: "#60a5fa", fontSize: 14 }}>
          ⬆️ Uploading recording…
        </div>
      )}

      {uploadState === "error" && (
        <div style={{ textAlign: "center", color: "#f87171", fontSize: 13 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {uploadState === "done" && savedCapture && (
        <>
          <div style={{ color: "#4ade80", fontSize: 13, textAlign: "center" }}>
            ✅ Recording saved
          </div>
          <AudioPlayer
            src={`/api/v1/student/captures/${savedCapture.id}/stream`}
            label={`Recorded ${new Date().toLocaleDateString()}`}
            knownDurationSeconds={savedCapture.duration_seconds as number}
            showDownload={true}
          />
          <TranscriptBlock captureId={savedCapture.id} />
        </>
      )}
    </div>
  );
};
