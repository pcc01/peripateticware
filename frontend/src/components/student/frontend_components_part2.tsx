// ==============================================================================
// frontend/src/components/student/NotebookEntry.tsx
// Reflective learning journal component
// ==============================================================================

import React, { useState } from 'react';
import { NotebookEntryType } from '../../types/student';
import { notebookService } from '../../services/notebookService';
import { RichTextEditor } from './RichTextEditor';
import { useNotebook } from '../../hooks/useNotebook';

interface NotebookEntryProps {
  activityId: string;
  onSave?: (entry: any) => void;
}

const REFLECTION_PROMPTS = {
  [NotebookEntryType.REFLECTION]: "What surprised you about this activity?",
  [NotebookEntryType.QUESTION]: "What questions do you have about what you discovered?",
  [NotebookEntryType.DISCOVERY]: "What did you learn from this experience?",
  [NotebookEntryType.HYPOTHESIS]: "What do you think will happen next if you...",
  [NotebookEntryType.FREEFORM]: "Write your thoughts and reflections..."
};

export const NotebookEntry: React.FC<NotebookEntryProps> = ({
  activityId,
  onSave
}) => {
  const [entryType, setEntryType] = useState<NotebookEntryType>(NotebookEntryType.REFLECTION);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkedCaptures, setLinkedCaptures] = useState<string[]>([]);
  
  const { entries, addEntry } = useNotebook();

  const handleSave = async () => {
    setSaving(true);
    try {
      const entry = await addEntry({
        entryType,
        content,
        activityId,
        learningObjectivesTagged: [],
        competenciesAddressed: []
      });

      onSave?.(entry);
      setContent('');
      setLinkedCaptures([]);
    } catch (error) {
      console.error('Failed to save entry:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notebook-entry">
      <div className="entry-type-selector">
        {Object.values(NotebookEntryType).map((type) => (
          <button
            key={type}
            className={`entry-type ${entryType === type ? 'active' : ''}`}
            onClick={() => setEntryType(type as NotebookEntryType)}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <div className="prompt-box">
        <p><strong>Prompt:</strong> {REFLECTION_PROMPTS[entryType]}</p>
      </div>

      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Write your reflection..."
      />

      <div className="entry-stats">
        <span>{content.length} characters</span>
        <span>{content.split(/\s+/).filter(w => w).length} words</span>
      </div>

      <div className="entry-actions">
        <button
          onClick={handleSave}
          disabled={!content.trim() || saving}
          className="btn-primary"
        >
          {saving ? 'Saving...' : '✓ Save Entry'}
        </button>
      </div>

      {linkedCaptures.length > 0 && (
        <div className="linked-captures">
          <h4>📸 Linked Evidence ({linkedCaptures.length})</h4>
          {linkedCaptures.map((id) => (
            <div key={id} className="linked-capture">
              <span>{id}</span>
              <button onClick={() => setLinkedCaptures(linkedCaptures.filter(c => c !== id))}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/RichTextEditor.tsx
// Markdown rich text editor for journal entries
// ==============================================================================

import React, { useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder
}) => {
  const [preview, setPreview] = useState(false);

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    
    const newValue = 
      value.substring(0, start) +
      before + selected + after +
      value.substring(end);
    
    onChange(newValue);

    setTimeout(() => {
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
      textarea.focus();
    }, 0);
  };

  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar">
        <button onClick={() => insertMarkdown('**', '**')} title="Bold">
          <strong>B</strong>
        </button>
        <button onClick={() => insertMarkdown('_', '_')} title="Italic">
          <em>I</em>
        </button>
        <button onClick={() => insertMarkdown('~~', '~~')} title="Strikethrough">
          <s>S</s>
        </button>
        <button onClick={() => insertMarkdown('`', '`')} title="Code">
          &lt;/&gt;
        </button>
        <button onClick={() => insertMarkdown('- ', '')} title="List">
          ≡
        </button>
        <button onClick={() => insertMarkdown('> ', '')} title="Quote">
          &quot;
        </button>
        <button onClick={() => setPreview(!preview)} className={preview ? 'active' : ''}>
          👁️ Preview
        </button>
      </div>

      {!preview ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="editor-textarea"
          rows={8}
        />
      ) : (
        <div className="editor-preview markdown">
          {value.split('\n').map((line, i) => {
            // Simple markdown rendering
            if (line.startsWith('# ')) return <h1 key={i}>{line.substring(2)}</h1>;
            if (line.startsWith('## ')) return <h2 key={i}>{line.substring(3)}</h2>;
            if (line.startsWith('- ')) return <li key={i}>{line.substring(2)}</li>;
            if (line.startsWith('> ')) return <blockquote key={i}>{line.substring(2)}</blockquote>;
            return <p key={i}>{line}</p>;
          })}
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/EvidencePortfolio.tsx
// Gallery view of all student evidence
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { StudentCapture } from '../../types/student';
import { portfolioService } from '../../services/portfolioService';
import { EvidenceGallery } from './EvidenceGallery';
import { TimelineView } from './TimelineView';

interface EvidencePortfolioProps {
  activityId?: string;
}

type ViewMode = 'gallery' | 'timeline' | 'list';

export const EvidencePortfolio: React.FC<EvidencePortfolioProps> = ({
  activityId
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'photo' | 'video' | 'audio'>('all');

  useEffect(() => {
    loadPortfolio();
  }, [activityId]);

  const loadPortfolio = async () => {
    setLoading(true);
    try {
      const data = await portfolioService.getPortfolio(activityId);
      setPortfolio(data);
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredCaptures = () => {
    if (!portfolio?.captures) return [];
    if (filter === 'all') return portfolio.captures;
    return portfolio.captures.filter((c: StudentCapture) => c.capture_type === filter);
  };

  const handleExportPDF = async () => {
    try {
      const blob = await portfolioService.exportPDF(activityId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_${Date.now()}.pdf`;
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleExportZIP = async () => {
    try {
      const blob = await portfolioService.exportZIP(activityId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio_${Date.now()}.zip`;
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading portfolio...</div>;
  }

  const captures = getFilteredCaptures();

  return (
    <div className="evidence-portfolio">
      <div className="portfolio-header">
        <h2>📚 Evidence Portfolio</h2>
        <p>{captures.length} pieces of evidence collected</p>
      </div>

      {/* Controls */}
      <div className="portfolio-controls">
        <div className="view-modes">
          <button
            className={viewMode === 'gallery' ? 'active' : ''}
            onClick={() => setViewMode('gallery')}
          >
            Grid
          </button>
          <button
            className={viewMode === 'timeline' ? 'active' : ''}
            onClick={() => setViewMode('timeline')}
          >
            Timeline
          </button>
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>

        <div className="filters">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'photo' ? 'active' : ''}
            onClick={() => setFilter('photo')}
          >
            📸 Photos
          </button>
          <button
            className={filter === 'video' ? 'active' : ''}
            onClick={() => setFilter('video')}
          >
            🎥 Videos
          </button>
          <button
            className={filter === 'audio' ? 'active' : ''}
            onClick={() => setFilter('audio')}
          >
            🎙️ Audio
          </button>
        </div>

        <div className="export-options">
          <button onClick={handleExportPDF} className="btn-secondary">
            📄 Export PDF
          </button>
          <button onClick={handleExportZIP} className="btn-secondary">
            📦 Export ZIP
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'gallery' && (
        <EvidenceGallery captures={captures} />
      )}

      {viewMode === 'timeline' && (
        <TimelineView 
          captures={captures}
          entries={portfolio?.notebook_entries || []}
        />
      )}

      {viewMode === 'list' && (
        <div className="evidence-list">
          {captures.map((capture) => (
            <div key={capture.id} className="evidence-item">
              <span>{capture.capture_type.toUpperCase()}</span>
              <span>{capture.description || 'No description'}</span>
              <span>{new Date(capture.captured_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/EvidenceGallery.tsx
// Grid gallery of evidence
// ==============================================================================

import React, { useState } from 'react';
import { StudentCapture } from '../../types/student';

interface EvidenceGalleryProps {
  captures: StudentCapture[];
}

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({
  captures
}) => {
  const [selectedCapture, setSelectedCapture] = useState<StudentCapture | null>(null);

  return (
    <div className="evidence-gallery">
      <div className="gallery-grid">
        {captures.map((capture) => (
          <div
            key={capture.id}
            className="gallery-item"
            onClick={() => setSelectedCapture(capture)}
          >
            <div className="item-type-badge">
              {capture.capture_type === 'photo' && '📸'}
              {capture.capture_type === 'video' && '🎥'}
              {capture.capture_type === 'audio' && '🎙️'}
              {capture.capture_type === 'text' && '📝'}
              {capture.capture_type === 'sketch' && '🎨'}
            </div>
            
            {capture.capture_type === 'photo' && (
              <img src={capture.file_path} alt="Capture" />
            )}
            
            <div className="item-info">
              <p>{capture.description || 'No description'}</p>
              <small>{new Date(capture.captured_at).toLocaleDateString()}</small>
            </div>
          </div>
        ))}
      </div>

      {selectedCapture && (
        <div className="gallery-modal" onClick={() => setSelectedCapture(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedCapture(null)}>
              ✕
            </button>

            {selectedCapture.capture_type === 'photo' && (
              <img src={selectedCapture.file_path} alt="Capture" />
            )}

            <div className="modal-info">
              <h3>{selectedCapture.description}</h3>
              <p><strong>Type:</strong> {selectedCapture.capture_type}</p>
              <p><strong>Captured:</strong> {new Date(selectedCapture.captured_at).toLocaleString()}</p>
              
              {selectedCapture.transcript && (
                <div className="transcript-section">
                  <h4>Transcript</h4>
                  <p>{selectedCapture.transcript}</p>
                  <small>Confidence: {(selectedCapture.transcript_confidence || 0 * 100).toFixed(0)}%</small>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/TimelineView.tsx
// Chronological timeline of activities and evidence
// ==============================================================================

import React from 'react';
import { StudentCapture } from '../../types/student';

interface TimelineViewProps {
  captures: StudentCapture[];
  entries: any[];
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  captures,
  entries
}) => {
  // Combine and sort by date
  const combined = [
    ...captures.map(c => ({ ...c, type: 'capture', date: new Date(c.captured_at) })),
    ...entries.map(e => ({ ...e, type: 'entry', date: new Date(e.created_at) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="timeline-view">
      <div className="timeline">
        {combined.map((item, i) => (
          <div key={i} className={`timeline-item ${item.type}`}>
            <div className="timeline-marker">
              {item.type === 'capture' && (
                <span>{
                  item.capture_type === 'photo' ? '📸' :
                  item.capture_type === 'video' ? '🎥' :
                  item.capture_type === 'audio' ? '🎙️' :
                  item.capture_type === 'sketch' ? '🎨' : '📝'
                }</span>
              )}
              {item.type === 'entry' && <span>📝</span>}
            </div>
            
            <div className="timeline-content">
              <p className="date">{item.date.toLocaleDateString()}</p>
              
              {item.type === 'capture' && (
                <>
                  <p className="title">{item.description || 'Unnamed capture'}</p>
                  <small>{item.capture_type}</small>
                </>
              )}
              
              {item.type === 'entry' && (
                <>
                  <p className="title">Reflection</p>
                  <p className="preview">{item.content.substring(0, 100)}...</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/ProgressDashboard.tsx
// Student learning progress and competency tracking
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { portfolioService } from '../../services/portfolioService';
import { CompetencyTracker } from './CompetencyTracker';
import { GrowthChart } from './GrowthChart';

export const ProgressDashboard: React.FC = () => {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [portfolioData, comptData] = await Promise.all([
        portfolioService.getPortfolio(),
        portfolioService.getCompetencies()
      ]);
      setPortfolio(portfolioData);
      setCompetencies(comptData);
    } catch (error) {
      console.error('Failed to load progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading progress...</div>;
  }

  const stats = {
    activitiesCompleted: 0, // would come from backend
    evidenceCollected: portfolio?.captures?.length || 0,
    entriesWritten: portfolio?.notebook_entries?.length || 0,
    hoursSpent: 0 // would come from backend
  };

  return (
    <div className="progress-dashboard">
      <h2>📈 Your Learning Progress</h2>

      {/* Stats Summary */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.activitiesCompleted}</div>
          <div className="stat-label">Activities Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.evidenceCollected}</div>
          <div className="stat-label">Evidence Pieces</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.entriesWritten}</div>
          <div className="stat-label">Reflections Written</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.hoursSpent}</div>
          <div className="stat-label">Hours Learning</div>
        </div>
      </div>

      {/* Competency Tracker */}
      <CompetencyTracker competencies={competencies} />

      {/* Growth Chart */}
      <GrowthChart captures={portfolio?.captures || []} />
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/CompetencyTracker.tsx
// Progress bars for each competency
// ==============================================================================

import React from 'react';

interface CompetencyTrackerProps {
  competencies: any[];
}

export const CompetencyTracker: React.FC<CompetencyTrackerProps> = ({
  competencies
}) => {
  return (
    <div className="competency-tracker">
      <h3>Competencies</h3>
      
      {competencies.length === 0 ? (
        <p>No competencies yet</p>
      ) : (
        <div className="competencies-list">
          {competencies.map((comp) => (
            <div key={comp.id} className="competency-item">
              <div className="competency-header">
                <h4>{comp.competency_name}</h4>
                <span className={`status ${comp.status}`}>{comp.status}</span>
              </div>
              
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${comp.progress_percent}%` }}
                />
              </div>
              
              <div className="competency-info">
                <small>{comp.progress_percent}% complete</small>
                <small>{comp.evidence_count} evidence pieces</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/GrowthChart.tsx
// Visualization of learning growth over time
// ==============================================================================

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { StudentCapture } from '../../types/student';

interface GrowthChartProps {
  captures: StudentCapture[];
}

export const GrowthChart: React.FC<GrowthChartProps> = ({
  captures
}) => {
  // Group captures by week
  const data = captures.reduce((acc: any[], capture) => {
    const date = new Date(capture.captured_at);
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    
    const weekKey = weekStart.toISOString().split('T')[0];
    const existing = acc.find(d => d.week === weekKey);
    
    if (existing) {
      existing.count++;
    } else {
      acc.push({ week: weekKey, count: 1 });
    }
    
    return acc;
  }, []);

  return (
    <div className="growth-chart">
      <h3>Evidence Collection Trend</h3>
      
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#8884d8" 
              name="Evidence Collected"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p>No data yet</p>
      )}
    </div>
  );
};


// ==============================================================================
// frontend/src/components/student/AnnotationTool.tsx
// Mark up and explain evidence
// ==============================================================================

import React, { useRef, useState } from 'react';
import { StudentCapture, AnnotationType } from '../../types/student';

interface AnnotationToolProps {
  capture: StudentCapture;
  onSave?: (annotation: any) => void;
}

export const AnnotationTool: React.FC<AnnotationToolProps> = ({
  capture,
  onSave
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotationType, setAnnotationType] = useState<AnnotationType>(AnnotationType.TEXT_LABEL);
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [explanation, setExplanation] = useState('');

  const startDrawing = (e: React.MouseEvent) => {
    setIsDrawing(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleSaveAnnotation = () => {
    if (explanation.trim()) {
      const newAnnotation = {
        type: annotationType,
        explanation,
        timestamp: Date.now()
      };
      
      setAnnotations([...annotations, newAnnotation]);
      setExplanation('');
    }
  };

  return (
    <div className="annotation-tool">
      <h3>🏷️ Annotate Evidence</h3>

      {capture.capture_type === 'photo' && (
        <div className="annotation-canvas-container">
          <img 
            src={capture.file_path} 
            alt="Capture to annotate"
            className="annotation-image"
          />
          
          <canvas
            ref={canvasRef}
            className="annotation-canvas"
            onMouseDown={startDrawing}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>
      )}

      <div className="annotation-controls">
        <div className="type-selector">
          {Object.values(AnnotationType).map((type) => (
            <button
              key={type}
              className={`${annotationType === type ? 'active' : ''}`}
              onClick={() => setAnnotationType(type as AnnotationType)}
            >
              {type}
            </button>
          ))}
        </div>

        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Explain why this evidence is important..."
          rows={4}
        />

        <button onClick={handleSaveAnnotation} className="btn-primary">
          ✓ Add Annotation
        </button>
      </div>

      {annotations.length > 0 && (
        <div className="annotations-list">
          <h4>Annotations ({annotations.length})</h4>
          {annotations.map((ann, i) => (
            <div key={i} className="annotation-item">
              <span className="type">{ann.type}</span>
              <p>{ann.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
