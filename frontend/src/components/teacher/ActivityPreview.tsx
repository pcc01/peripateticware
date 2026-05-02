// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ActivityPreview Component
 * Displays a real-time preview of an activity as it's being created/edited
 * Shows how the activity will appear to students
 * 
 * Features:
 * - Real-time preview updates
 * - Location visualization
 * - Learning objectives checklist
 * - Materials list
 * - Metadata display
 * - Side panel design
 */

import React from 'react';
import { clsx } from 'clsx';
import { Activity } from '../../types/teacher';
import LoadingSpinner from '../common/LoadingSpinner';

interface ActivityPreviewProps {
  activity?: Partial<Activity>;
  loading?: boolean;
}

const BLOOM_LEVELS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
];

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  inquiry: '🔍',
  discussion: '💬',
  hands_on: '🙌',
  virtual: '💻',
  hybrid: '🔄',
};

export const ActivityPreview: React.FC<ActivityPreviewProps> = ({
  activity,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg">
        <LoadingSpinner />
      </div>
    );
  }

  if (!activity || !activity.title) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg p-6 text-center">
        <div className="text-gray-400 dark:text-gray-500 text-5xl mb-4">👁</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">
          Activity Preview
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Fill in the form to see a preview of your activity
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 rounded-lg p-6">
      {/* Activity Header */}
      <div className="mb-6">
        {/* Activity Type & Status */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl">
            {ACTIVITY_TYPE_ICONS[activity.activity_type || 'inquiry']}
          </span>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {activity.title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {activity.activity_type && (
                <>
                  {activity.activity_type.charAt(0).toUpperCase() +
                    activity.activity_type.slice(1).replace('_', ' ')}
                  {activity.status && ` • ${activity.status.toUpperCase()}`}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Metadata Pills */}
        <div className="flex flex-wrap gap-2">
          {activity.grade_level && (
            <span className="inline-block px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
              Grade {activity.grade_level}
            </span>
          )}
          {activity.subject && (
            <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
              {activity.subject}
            </span>
          )}
          {activity.estimated_duration_minutes && (
            <span className="inline-block px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium">
              {activity.estimated_duration_minutes} min
            </span>
          )}
          {activity.difficulty_level && (
            <span className="inline-block px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium">
              Difficulty: {activity.difficulty_level}/5
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 dark:bg-gray-700 my-6" />

      {/* Description */}
      {activity.description && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            About This Activity
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {activity.description}
          </p>
        </div>
      )}

      {/* Learning Objectives */}
      {activity.learning_objectives && activity.learning_objectives.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Learning Objectives
          </h3>
          <ul className="space-y-2">
            {activity.learning_objectives.map((objective, idx) => (
              <li
                key={idx}
                className="flex gap-3 text-sm text-gray-700 dark:text-gray-300"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </span>
                <span>{objective}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bloom's Level */}
      {activity.bloom_level && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Cognitive Level
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">
              {activity.bloom_level}
            </span>
            <span>
              {BLOOM_LEVELS[activity.bloom_level - 1] || 'Unknown'}
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Bloom's Taxonomy Level
          </p>
        </div>
      )}

      {/* Location Info */}
      {activity.location_name && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Location
          </h3>
          <div className="bg-white dark:bg-gray-700 rounded-lg p-3 text-sm">
            <p className="text-gray-900 dark:text-white font-medium mb-1">
              {activity.location_name}
            </p>
            {activity.location_latitude && activity.location_longitude && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activity.location_latitude.toFixed(4)}, {activity.location_longitude.toFixed(4)}
              </p>
            )}
            {activity.location_radius_meters && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Trigger radius: {activity.location_radius_meters}m
              </p>
            )}
          </div>
        </div>
      )}

      {/* Materials */}
      {activity.materials_needed && activity.materials_needed.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Materials Needed
          </h3>
          <ul className="space-y-2">
            {activity.materials_needed.map((material, idx) => (
              <li
                key={idx}
                className="flex gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <span className="text-gray-400 dark:text-gray-500">▪</span>
                <span>{material}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resources */}
      {activity.resources && activity.resources.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Resources
          </h3>
          <ul className="space-y-2">
            {activity.resources.map((resource, idx) => (
              <li
                key={idx}
                className="text-sm"
              >
                {resource.url ? (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline inline-flex gap-1 items-center"
                  >
                    {resource.title || 'Resource Link'}
                    <span className="text-xs">↗</span>
                  </a>
                ) : (
                  <span className="text-gray-700 dark:text-gray-300">
                    {resource.title || 'Resource'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Curriculum Mapping */}
      {activity.curriculum_unit_ids && activity.curriculum_unit_ids.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Curriculum Standards
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mapped to {activity.curriculum_unit_ids.length} curriculum unit
            {activity.curriculum_unit_ids.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Footer Note */}
      <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          This is how your activity appears to students
        </p>
      </div>
    </div>
  );
};

export default ActivityPreview;
