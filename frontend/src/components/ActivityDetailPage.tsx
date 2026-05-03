// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ActivityDetailPage
 * Page for creating and editing activities with live preview
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity } from '../../types/teacher';
import { useTeacherStore } from '../../stores/teacher';
import ActivityBuilder from '../../components/ActivityBuilder';
import ActivityPreview from '../../components/teacher/ActivityPreview';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const ActivityDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { selectedActivity, loading, fetchActivity } = useTeacherStore();
  const [previewData, setPreviewData] = React.useState<Partial<Activity> | undefined>();

  useEffect(() => {
    if (id && id !== 'new') {
      fetchActivity(id);
    }
  }, [id, fetchActivity]);

  const handleSave = (activity: Activity) => {
    navigate('/teacher/activities', {
      state: { message: id ? 'Activity updated!' : 'Activity created!' },
    });
  };

  const handleCancel = () => {
    navigate('/teacher/activities');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {id && id !== 'new' ? '✏️ Edit Activity' : '✨ Create New Activity'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {id && id !== 'new'
            ? 'Update activity details and preview how it will appear to students'
            : 'Create a new learning activity with location triggers and curriculum mapping'}
        </p>
      </div>

      {/* Loading State */}
      {loading && id && id !== 'new' && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Main Content */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
              <ActivityBuilder
                activity={selectedActivity}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </div>
          </div>

          {/* Preview Section */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
              <div className="sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <ActivityPreview activity={previewData || selectedActivity} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityDetailPage;
