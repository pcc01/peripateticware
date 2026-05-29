// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Upload, MapPin, Clock, Users, FileText, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { useApiData, useStudent } from '@/services/api';

/**
 * StudentActivityDetailPage
 * Route: /student/activities/:id
 * Accessible from: StudentDashboard → Activity Card Click or Navigation → Activities → Click
 * 
 * Uses: StudentService.getActivityDetail(id), submitEvidence(id, data)
 * Functions:
 * - Display activity instructions and phases
 * - Show current phase and progress
 * - Allow evidence submission (photos, text, audio, video)
 * - Display teacher feedback
 */

export const StudentActivityDetailPage: React.FC = () => {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getActivityDetail, submitEvidence } = useStudent();

  // State
  const [currentPhase, setCurrentPhase] = useState<'orient' | 'inquiry' | 'reflect'>('orient');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch activity details
  const { data: activity, loading, error } = useApiData(
    () => id ? getActivityDetail(id) : Promise.reject('No ID'),
    [id]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEvidenceFiles(Array.from(e.target.files));
    }
  };

  const handleSubmitEvidence = async () => {
    if (!id || !evidenceFiles.length) {
      alert('Please select at least one file');
      return;
    }

    setSubmitting(true);
    try {
      await submitEvidence(id, {
        phase: currentPhase,
        evidence: evidenceFiles.map((file) => ({
          type: file.type.startsWith('image/') ?
          'photo' :
          file.type.startsWith('audio/') ?
          'audio' :
          file.type.startsWith('video/') ?
          'video' :
          'text',
          title: evidenceTitle || file.name,
          description: evidenceDescription,
          file: file
        })),
        notes: notes
      });

      // Reset form
      setEvidenceFiles([]);
      setEvidenceTitle('');
      setEvidenceDescription('');
      setNotes('');

      alert('Evidence submitted successfully!');
    } catch (err) {
      console.error('Submission failed:', err);
      alert('Failed to submit evidence');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
      </div>);

  }

  if (error || !activity) {
    return (
      <div className="flex-1 bg-gray-50 p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-red-900 font-bold">{t("landing:error_loading_activity", "Error Loading Activity")}</h2>
          <p className="text-red-800 mt-2">{error?.message || 'Activity not found'}</p>
          <button
            onClick={() => navigate('/student/activities')}
            className="mt-4 px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800">{t("landing:studentactivitydetailpage.back_to_activities", "Back to Activities")}


          </button>
        </div>
      </div>);

  }

  return (
    <div className="flex-1 bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => navigate('/student/activities')}
            className="text-green-700 hover:text-green-800 font-medium mb-4 flex items-center gap-2">{t("landing:studentactivitydetailpage.back", "\u2190 Back")}


          </button>
          <h1 className="text-3xl font-bold text-gray-900">{activity.title}</h1>
          <p className="text-gray-600 mt-2">{activity.description}</p>

          <div className="flex gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <MapPin className="w-4 h-4" />
              {activity.location}
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Clock className="w-4 h-4" />{t("landing:due", "Due:")}
              {new Date(activity.due_date).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Users className="w-4 h-4" />
              {activity.subject}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phases */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              {/* Phase Tabs */}
              <div className="flex gap-4 border-b mb-6">
                {['orient', 'inquiry', 'reflect'].map((phase) =>
                <button
                  key={phase}
                  onClick={() => setCurrentPhase(phase as any)}
                  className={`pb-4 font-medium transition border-b-2 ${
                  currentPhase === phase ?
                  'border-green-700 text-green-700' :
                  'border-transparent text-gray-600 hover:text-gray-900'}`
                  }>
                  
                    {phase.charAt(0).toUpperCase() + phase.slice(1)}
                  </button>
                )}
              </div>

              {/* Current Phase Content */}
              {currentPhase === 'orient' &&
              <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    {activity.phases.orient.title}
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {activity.phases.orient.instructions}
                  </p>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>{t("landing:due", "Due:")}</strong> {new Date(activity.phases.orient.due_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              }

              {currentPhase === 'inquiry' &&
              <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    {activity.phases.inquiry.title}
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {activity.phases.inquiry.instructions}
                  </p>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>{t("landing:due", "Due:")}</strong> {new Date(activity.phases.inquiry.due_date).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Evidence Submission Form */}
                  <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-200">
                    <h3 className="font-bold text-lg text-gray-900 mb-4">
                      {t('pages.student.activity.submit_evidence', 'Submit Evidence')}
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('forms.title', 'Title')}
                        </label>
                        <input
                        type="text"
                        value={evidenceTitle}
                        onChange={(e) => setEvidenceTitle(e.target.value)}
                        placeholder={t("landing:eg_butterfly_photos", "e.g., Butterfly photos")}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                      
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('forms.description', 'Description')}
                        </label>
                        <textarea
                        value={evidenceDescription}
                        onChange={(e) => setEvidenceDescription(e.target.value)}
                        placeholder={t("landing:describe_what_you_found_or_observed", "Describe what you found or observed...")}
                        rows={3}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                      
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('forms.files', 'Upload Files')}
                        </label>
                        <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center cursor-pointer hover:bg-green-50 transition">
                          <input
                          type="file"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                          id="file-input" />
                        
                          <label htmlFor="file-input" className="cursor-pointer">
                            <div className="flex justify-center mb-2">
                              <Upload className="w-8 h-8 text-green-600" />
                            </div>
                            <p className="font-medium text-gray-900">
                              {evidenceFiles.length > 0 ?
                            `${evidenceFiles.length} file(s) selected` :
                            'Click to upload or drag and drop'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">{t("landing:png_jpg_mp4_mp3_or_txt_max_50mb_each", "PNG, JPG, MP4, MP3, or TXT (Max 50MB each)")}

                          </p>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('forms.notes', 'Notes')}
                        </label>
                        <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t("landing:additional_context_or_reflection", "Additional context or reflection...")}
                        rows={2}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                      
                      </div>

                      <button
                      onClick={handleSubmitEvidence}
                      disabled={submitting || evidenceFiles.length === 0}
                      className="w-full px-4 py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition">
                      
                        {submitting ?
                      <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>{t("landing:submitting", "Submitting...")}

                      </> :

                      <>
                            <CheckCircle className="w-5 h-5" />{t("landing:submit_evidence", "Submit Evidence")}

                      </>
                      }
                      </button>
                    </div>
                  </div>
                </div>
              }

              {currentPhase === 'reflect' &&
              <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    {activity.phases.reflect.title}
                  </h2>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {activity.phases.reflect.instructions}
                  </p>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>{t("landing:due", "Due:")}</strong> {new Date(activity.phases.reflect.due_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              }
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-6">
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                {t('common.progress', 'Progress')}
              </h3>

              {/* Phase Progress */}
              <div className="space-y-3">
                {['orient', 'inquiry', 'reflect'].map((phase) =>
                <div
                  key={phase}
                  className={`p-3 rounded-lg border-l-4 transition cursor-pointer ${
                  currentPhase === phase ?
                  'border-green-700 bg-green-50' :
                  'border-gray-200 hover:bg-gray-50'}`
                  }
                  onClick={() => setCurrentPhase(phase as any)}>
                  
                    <div className="flex justify-between items-center">
                      <span className="font-medium capitalize text-gray-900">{phase}</span>
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                        {phase === 'orient' && '📚'}
                        {phase === 'inquiry' && '🔍'}
                        {phase === 'reflect' && '💭'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Activity Info */}
              <div className="mt-6 pt-6 border-t space-y-3">
                <div>
                  <p className="text-xs text-gray-600 font-medium">{t("landing:studentactivitydetailpage.teacher", "Teacher")}</p>
                  <p className="text-sm text-gray-900">{activity.teacher.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">{t("landing:subject", "Subject")}</p>
                  <p className="text-sm text-gray-900">{activity.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium">{t("landing:studentactivitydetailpage.location", "Location")}</p>
                  <p className="text-sm text-gray-900">{activity.location}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);

};

export default StudentActivityDetailPage;