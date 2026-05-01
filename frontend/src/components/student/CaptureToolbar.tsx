import React, { useRef, useState } from 'react';
import { Camera, Mic, Type, Grid3x3, Ruler } from 'lucide-react';
import { CaptureType, CaptureFormData, SessionContext } from '../../types/student';
import { useCaptureStore } from '../../stores/student';

interface CaptureToolbarProps {
  sessionContext: SessionContext;
  onCaptureSaved?: (id: string) => void;
}

export const CaptureToolbar: React.FC<CaptureToolbarProps> = ({ sessionContext, onCaptureSaved }) => {
  const [activeType, setActiveType] = useState<CaptureType | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLMediaRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { loading, error } = useCaptureStore();

  const captureTypes: { type: CaptureType; icon: React.ReactNode; label: string }[] = [
    { type: 'photo', icon: <Camera className="w-5 h-5" />, label: 'Photo' },
    { type: 'video', icon: <Camera className="w-5 h-5" />, label: 'Video' },
    { type: 'audio', icon: <Mic className="w-5 h-5" />, label: 'Audio' },
    { type: 'text', icon: <Type className="w-5 h-5" />, label: 'Text' },
    { type: 'sketch', icon: <Grid3x3 className="w-5 h-5" />, label: 'Sketch' },
    { type: 'measurement', icon: <Ruler className="w-5 h-5" />, label: 'Measurement' },
  ];

  const handleTypeSelect = (type: CaptureType) => {
    setActiveType(type);
  };

  const handleFileCapture = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeType) return;
    
    const file = files[0];
    const data: CaptureFormData = {
      title: file.name,
      description: `Captured ${activeType}`,
      capture_type: activeType,
      file,
      learning_objectives: sessionContext.learning_objectives.map(o => o.id),
      competencies: sessionContext.competencies.map(c => c.id),
    };

    try {
      await useCaptureStore.getState().createCapture(sessionContext.session_id, data);
      setActiveType(null);
      onCaptureSaved?.(sessionContext.session_id);
    } catch (err) {
      console.error('Failed to save capture:', err);
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Saving...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600 text-center">{error}</div>;
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h3 className="font-semibold text-lg">Capture Evidence</h3>
      
      <div className="grid grid-cols-3 gap-2">
        {captureTypes.map((type) => (
          <button
            key={type.type}
            onClick={() => handleTypeSelect(type.type)}
            className={`p-3 rounded-lg border-2 transition ${
              activeType === type.type
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              {type.icon}
              <span className="text-xs font-medium">{type.label}</span>
            </div>
          </button>
        ))}
      </div>

      {activeType && (
        <div className="mt-4 p-4 bg-white border rounded-lg">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => handleFileCapture(e.target.files)}
            accept={activeType === 'photo' ? 'image/*' : activeType === 'video' ? 'video/*' : activeType === 'audio' ? 'audio/*' : '*'}
            className="w-full"
          />
          <canvas ref={canvasRef} className="hidden" />
          <video ref={videoRef} className="hidden" />
          <audio ref={audioRef} className="hidden" />
        </div>
      )}

      <div className="text-sm text-gray-600">
        <p className="font-medium">Activity:</p>
        <p>{sessionContext.activity_name}</p>
      </div>
    </div>
  );
};

export default CaptureToolbar;
