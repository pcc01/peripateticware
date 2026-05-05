// ==============================================================================
// frontend/src/components/student/ActivityEngagementScreen.tsx
// Main activity interface for students
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity } from '../../types/activity';
import { CaptureToolbar } from './CaptureToolbar';
import { NotebookEntry } from './NotebookEntry';
import { useCapture } from '../../hooks/useCapture';

interface ActivityEngagementScreenProps {
  activity?: Activity;
}

export const ActivityEngagementScreen: React.FC<ActivityEngagementScreenProps> = ({
  activity: initialActivity
}) => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  
  const [activity, setActivity] = useState<Activity | null>(initialActivity || null);
  const [currentPhase, setCurrentPhase] = useState<'orientation' | 'inquiry' | 'reflection'>('orientation');
  const [progress, setProgress] = useState(0);
  const [gpsTriggered, setGpsTriggered] = useState(false);
  
  const { captures } = useCapture();

  useEffect(() => {
    // Fetch activity if not provided
    if (!activity && activityId) {
      fetch(`/api/v1/activities/${activityId}`)
        .then(r => r.json())
        .then(setActivity)
        .catch(console.error);
    }

    // Setup geofencing (if browser supports)
    setupGeofencing();
  }, [activityId, activity]);

  const setupGeofencing = () => {
    if ('geolocation' in navigator && activity?.location) {
      navigator.geolocation.watchPosition(
        (position) => {
          const distance = calculateDistance(
            position.coords.latitude,
            position.coords.longitude,
            activity!.location.latitude,
            activity!.location.longitude
          );

          if (distance < 100) { // Within 100 meters
            setGpsTriggered(true);
          }
        },
        (error) => console.error('Geolocation error:', error)
      );
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handlePhaseComplete = () => {
    if (currentPhase === 'orientation') {
      setCurrentPhase('inquiry');
      setProgress(33);
    } else if (currentPhase === 'inquiry') {
      setCurrentPhase('reflection');
      setProgress(66);
    } else {
      setProgress(100);
      // Activity complete
      setTimeout(() => navigate('/student/dashboard'), 2000);
    }
  };

  if (!activity) {
    return <div className="loading">Loading activity...</div>;
  }

  return (
    <div className="activity-engagement-screen">
      {/* Header */}
      <div className="activity-header">
        <h1>{activity.title}</h1>
        <div className="progress-bar">
          <div className="progress" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="phase-indicator">
          <span className={currentPhase === 'orientation' ? 'active' : ''}>🔍 Orientation</span>
          <span className={currentPhase === 'inquiry' ? 'active' : ''}>❓ Inquiry</span>
          <span className={currentPhase === 'reflection' ? 'active' : ''}>📝 Reflection</span>
        </div>
      </div>

      {/* GPS Status */}
      {!gpsTriggered && activity.location && (
        <div className="gps-alert">
          📍 Move closer to the activity location to start
        </div>
      )}

      {/* Content Area */}
      <div className="activity-content">
        {currentPhase === 'orientation' && (
          <div className="phase-content">
            <h2>Learning Objectives</h2>
            <ul>
              {activity.objectives?.map((obj, i) => (
                <li key={i}>{obj}</li>
              ))}
            </ul>
            <p>{activity.description}</p>
            <button onClick={handlePhaseComplete}>Start Inquiry →</button>
          </div>
        )}

        {currentPhase === 'inquiry' && (
          <div className="phase-content">
            <h2>Guided Inquiry</h2>
            <div className="prompts">
              {activity.inquiry_prompts?.map((prompt, i) => (
                <div key={i} className="prompt">
                  <p>{prompt}</p>
                </div>
              ))}
            </div>
            
            {/* Capture Toolbar */}
            <CaptureToolbar 
              activityId={activity.id}
              onCapture={(capture) => {
                console.log('Captured:', capture);
              }}
            />

            <button onClick={handlePhaseComplete}>Complete Inquiry →</button>
          </div>
        )}

        {currentPhase === 'reflection' && (
          <div className="phase-content">
            <h2>Reflection</h2>
            <p>Reflect on what you discovered during this activity.</p>
            
            <NotebookEntry
              activityId={activity.id}
              onSave={(entry) => {
                console.log('Notebook saved:', entry);
                handlePhaseComplete();
              }}
            />
          </div>
        )}
      </div>

      {/* Capture Count */}
      <div className="capture-counter">
        📸 {captures.length} captures collected
      </div>
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/CaptureToolbar.tsx
// Quick access to evidence collection tools
// ==============================================================================

import React, { useRef, useState } from 'react';
import { CaptureType } from '../../types/student';
import { PhotoCapture } from './PhotoCapture';
import { VideoCapture } from './VideoCapture';
import { AudioCapture } from './AudioCapture';
import { SketchPad } from './SketchPad';
import { useCapture } from '../../hooks/useCapture';

interface CaptureToolbarProps {
  activityId: string;
  onCapture?: (capture: any) => void;
}

export const CaptureToolbar: React.FC<CaptureToolbarProps> = ({
  activityId,
  onCapture
}) => {
  const [activeTool, setActiveTool] = useState<CaptureType | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  
  const { addCapture } = useCapture();

  // Get current location
  React.useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        }
      );
    }
  }, []);

  const handleCapture = async (file: Blob, type: CaptureType, metadata?: any) => {
    const capture = await addCapture(
      new File([file], `capture_${Date.now()}`, { type: file.type }),
      type,
      {
        activityId,
        latitude: location?.lat,
        longitude: location?.lon,
        ...metadata
      }
    );

    onCapture?.(capture);
    setActiveTool(null);
  };

  return (
    <div className="capture-toolbar">
      {activeTool === null && (
        <div className="toolbar-buttons">
          <button onClick={() => setActiveTool(CaptureType.PHOTO)} className="btn-photo">
            📸 Photo
          </button>
          <button onClick={() => setActiveTool(CaptureType.VIDEO)} className="btn-video">
            🎥 Video
          </button>
          <button onClick={() => setActiveTool(CaptureType.AUDIO)} className="btn-audio">
            🎙️ Audio
          </button>
          <button onClick={() => setActiveTool(CaptureType.TEXT)} className="btn-text">
            📝 Notes
          </button>
          <button onClick={() => setActiveTool(CaptureType.SKETCH)} className="btn-sketch">
            🎨 Sketch
          </button>
        </div>
      )}

      {activeTool === CaptureType.PHOTO && (
        <PhotoCapture 
          onCapture={(file) => handleCapture(file, CaptureType.PHOTO)}
          onCancel={() => setActiveTool(null)}
        />
      )}

      {activeTool === CaptureType.VIDEO && (
        <VideoCapture
          onCapture={(file) => handleCapture(file, CaptureType.VIDEO)}
          onCancel={() => setActiveTool(null)}
        />
      )}

      {activeTool === CaptureType.AUDIO && (
        <AudioCapture
          onCapture={(file) => handleCapture(file, CaptureType.AUDIO)}
          onCancel={() => setActiveTool(null)}
        />
      )}

      {activeTool === CaptureType.SKETCH && (
        <SketchPad
          onCapture={(file) => handleCapture(file, CaptureType.SKETCH)}
          onCancel={() => setActiveTool(null)}
        />
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/AudioCapture.tsx
// Audio recording with ASR (speech-to-text)
// ==============================================================================

import React, { useState, useRef } from 'react';
import { asrService } from '../../services/asrService';

interface AudioCaptureProps {
  onCapture: (audioBlob: Blob) => void;
  onCancel: () => void;
}

export const AudioCapture: React.FC<AudioCaptureProps> = ({
  onCapture,
  onCancel
}) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        onCapture(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      
      // Stop all tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="audio-capture">
      <h3>🎙️ Record Audio</h3>
      
      {recording && (
        <div className="recording-indicator">
          🔴 Recording...
        </div>
      )}

      <div className="controls">
        {!recording ? (
          <button onClick={startRecording} className="btn-primary">
            Start Recording
          </button>
        ) : (
          <button onClick={stopRecording} className="btn-danger">
            Stop Recording
          </button>
        )}
        
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>

      {transcript && (
        <div className="transcript">
          <h4>Transcript</h4>
          <p>{transcript}</p>
        </div>
      )}

      {transcribing && (
        <div className="transcribing">
          ⏳ Transcribing audio...
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/PhotoCapture.tsx
// Photo capture with device camera
// ==============================================================================

import React, { useRef, useState } from 'react';

interface PhotoCaptureProps {
  onCapture: (photoBlob: Blob) => void;
  onCancel: () => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  onCapture,
  onCancel
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  React.useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Camera access denied:', error);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(imageData);
      }
    }
  };

  const confirmCapture = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
      }
    }, 'image/jpeg', 0.95);
  };

  if (capturedImage) {
    return (
      <div className="photo-capture">
        <h3>📸 Photo Captured</h3>
        <img src={capturedImage} alt="Captured" />
        <div className="controls">
          <button onClick={confirmCapture} className="btn-primary">
            ✓ Use Photo
          </button>
          <button onClick={() => setCapturedImage(null)} className="btn-secondary">
            🔄 Retake
          </button>
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="photo-capture">
      <h3>📸 Camera</h3>
      <video ref={videoRef} autoPlay playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      <div className="controls">
        <button onClick={capturePhoto} className="btn-primary">
          📸 Take Photo
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/VideoCapture.tsx
// Video recording
// ==============================================================================

import React, { useRef, useState } from 'react';

interface VideoCaptureProps {
  onCapture: (videoBlob: Blob) => void;
  onCancel: () => void;
  maxDuration?: number; // seconds, default 300 (5 min)
}

export const VideoCapture: React.FC<VideoCaptureProps> = ({
  onCapture,
  onCancel,
  maxDuration = 300
}) => {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true
      });

      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = (event) => {
        videoChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        onCapture(videoBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];
      
      mediaRecorder.start();
      setRecording(true);
      setDuration(0);

      // Timer
      timerRef.current = setInterval(() => {
        setDuration(d => {
          if (d >= maxDuration) {
            stopRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Camera/microphone access denied:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  return (
    <div className="video-capture">
      <h3>🎥 Video</h3>
      
      {recording && (
        <div className="recording-info">
          <div className="recording-indicator">🔴 Recording...</div>
          <div className="duration">{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</div>
        </div>
      )}

      <div className="controls">
        {!recording ? (
          <button onClick={startRecording} className="btn-primary">
            🎥 Start Recording
          </button>
        ) : (
          <button onClick={stopRecording} className="btn-danger">
            Stop Recording
          </button>
        )}
        
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/SketchPad.tsx
// Drawing canvas for sketches
// ==============================================================================

import React, { useRef, useState } from 'react';
import Konva from 'konva';

interface SketchPadProps {
  onCapture: (sketchBlob: Blob) => void;
  onCancel: () => void;
}

export const SketchPad: React.FC<SketchPadProps> = ({
  onCapture,
  onCancel
}) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);

  React.useEffect(() => {
    const stage = new Konva.Stage({
      container: 'sketch-canvas',
      width: window.innerWidth - 40,
      height: 400
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    let isPaint = false;

    stage.on('mousedown', () => {
      isPaint = true;
      const pos = stage.getPointerPosition();
      if (pos) {
        layer.add(
          new Konva.Circle({
            x: pos.x,
            y: pos.y,
            radius: brushSize,
            fill: color
          })
        );
      }
    });

    stage.on('mousemove', () => {
      if (!isPaint) return;
      const pos = stage.getPointerPosition();
      if (pos) {
        layer.add(
          new Konva.Circle({
            x: pos.x,
            y: pos.y,
            radius: brushSize,
            fill: color
          })
        );
        layer.batchDraw();
      }
    });

    stage.on('mouseup', () => {
      isPaint = false;
    });

    stageRef.current = stage;
  }, [color, brushSize]);

  const saveSketch = () => {
    const canvas = stageRef.current?.toCanvas();
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          onCapture(blob);
        }
      }, 'image/png');
    }
  };

  const clearSketch = () => {
    stageRef.current?.getLayers()[0].destroyChildren();
    stageRef.current?.getLayers()[0].batchDraw();
  };

  return (
    <div className="sketch-pad">
      <h3>🎨 Sketch</h3>
      
      <div className="sketch-controls">
        <div className="color-picker">
          <label>Color:</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
        
        <div className="brush-size">
          <label>Brush Size:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
          />
        </div>
      </div>

      <div id="sketch-canvas" style={{ border: '1px solid #ccc', margin: '10px 0' }} />

      <div className="controls">
        <button onClick={saveSketch} className="btn-primary">
          ✓ Save Sketch
        </button>
        <button onClick={clearSketch} className="btn-secondary">
          🗑️ Clear
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
};
