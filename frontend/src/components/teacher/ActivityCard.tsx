/**
 * ActivityCard Component
 * Displays a single activity in list/grid view with quick actions
 * 
 * Features:
 * - Activity summary display
 * - Status badge
 * - Quick action buttons (edit, delete, publish, archive)
 * - Difficulty indicator
 * - Subject tag
 * - View count
 * - Created date
 * - Hover effects
 */

import React from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ActivityListResponse, ActivityStatus } from '../../types/teacher';
import Button from '../common/Button';

interface ActivityCardProps {
  activity: ActivityListResponse;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;
  onArchive?: (id: string) => void;
  compact?: boolean;
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Very Easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Very Hard',
};

const DIFFICULTY_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  2: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  4: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  5: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const STATUS_COLORS: Record<ActivityStatus, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  onEdit,
  onDelete,
  onPublish,
  onArchive,
  compact = false,
}) => {
  const createdDate = formatDistanceToNow(new Date(activity.created_at), {
    addSuffix: true,
  });

  return (
    <div
      className={clsx(
        'rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
        'shadow-sm hover:shadow-md transition-shadow duration-fast',
        compact ? 'p-3' : 'p-4'
      )}
    >
      {/* Header Section */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className={clsx(
              'font-semibold text-gray-900 dark:text-white truncate',
              compact ? 'text-sm' : 'text-base'
            )}
            title={activity.title}
          >
            {activity.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {createdDate}
          </p>
        </div>

        {/* Status Badge */}
        <span
          className={clsx(
            'px-2 py-1 rounded text-xs font-medium whitespace-nowrap',
            STATUS_COLORS[activity.status]
          )}
        >
          {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
        </span>
      </div>

      {/* Description */}
      {!compact && (
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">
          {activity.description}
        </p>
      )}

      {/* Metadata Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Subject */}
        <span className="px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
          {activity.subject}
        </span>

        {/* Grade Level */}
        <span className="px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
          Grade {activity.grade_level}
        </span>

        {/* Difficulty */}
        <span
          className={clsx(
            'px-2 py-1 rounded-full text-xs font-medium',
            DIFFICULTY_COLORS[activity.difficulty_level]
          )}
        >
          {DIFFICULTY_LABELS[activity.difficulty_level]}
        </span>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
        <div className="flex gap-3">
          <span>Duration: {activity.estimated_duration_minutes} min</span>
          <span>Views: {activity.view_count}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(activity.id)}
            className="flex-1"
          >
            Edit
          </Button>
        )}

        {activity.status === 'draft' && onPublish && (
          <Button
            variant="success"
            size="sm"
            onClick={() => onPublish(activity.id)}
            className="flex-1"
          >
            Publish
          </Button>
        )}

        {activity.status === 'published' && onArchive && (
          <Button
            variant="warning"
            size="sm"
            onClick={() => onArchive(activity.id)}
            className="flex-1"
          >
            Archive
          </Button>
        )}

        {onDelete && (
          <Button
            variant="error"
            size="sm"
            onClick={() => {
              if (confirm('Are you sure you want to delete this activity?')) {
                onDelete(activity.id);
              }
            }}
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
};

export default ActivityCard;
