// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectCard Component
 * Displays a single project in list/grid view with quick actions
 * 
 * Features:
 * - Project summary display
 * - Status badge
 * - Activity count
 * - Timeline display
 * - Quick action buttons (edit, delete, view)
 * - Subject and grade indicators
 * - Duration indicator
 * - Hover effects
 */

import React from 'react';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ProjectListResponse, ProjectStatus } from '../../types/teacher';
import Button from '../common/Button';

interface ProjectCardProps {
  project: ProjectListResponse;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const STATUS_ICONS: Record<ProjectStatus, string> = {
  planning: '📋',
  active: '▶️',
  completed: '✓',
  archived: '📦',
};

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onEdit,
  onDelete,
  onView,
  compact = false,
}) => {
  const createdDate = formatDistanceToNow(new Date(project.created_at), {
    addSuffix: true,
  });

  // Calculate project progress
  const startDate = new Date(project.start_date);
  const endDate = project.end_date ? new Date(project.end_date) : null;
  const today = new Date();

  let progressPercent = 0;
  if (endDate) {
    const totalTime = endDate.getTime() - startDate.getTime();
    const elapsedTime = today.getTime() - startDate.getTime();
    progressPercent = Math.min(100, Math.max(0, (elapsedTime / totalTime) * 100));
  }

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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{STATUS_ICONS[project.status]}</span>
            <h3
              className={clsx(
                'font-semibold text-gray-900 dark:text-white truncate',
                compact ? 'text-sm' : 'text-base'
              )}
              title={project.title}
            >
              {project.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Created {createdDate}
          </p>
        </div>

        {/* Status Badge */}
        <span
          className={clsx(
            'px-2 py-1 rounded text-xs font-medium whitespace-nowrap',
            STATUS_COLORS[project.status]
          )}
        >
          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
        </span>
      </div>

      {/* Description */}
      {!compact && (
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">
          {project.description}
        </p>
      )}

      {/* Metadata Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Subject */}
        <span className="px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
          {project.subject}
        </span>

        {/* Grade Level */}
        <span className="px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
          Grade {project.grade_level}
        </span>

        {/* Duration */}
        <span className="px-2 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium">
          {project.duration_weeks} weeks
        </span>
      </div>

      {/* Activity Count */}
      <div className="mb-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Activities: {project.activity_count}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {project.activity_count === 0
              ? 'No activities'
              : `${project.activity_count} activity${project.activity_count !== 1 ? 'ies' : ''}`}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
            style={{ width: `${(project.activity_count / 10) * 100}%` }}
          />
        </div>
      </div>

      {/* Progress Bar */}
      {project.end_date && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Progress
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Timeline Info */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-3">
        <p>Start: {new Date(project.start_date).toLocaleDateString()}</p>
        {project.end_date && (
          <p>End: {new Date(project.end_date).toLocaleDateString()}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {onView && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onView(project.id)}
            className="flex-1"
          >
            View
          </Button>
        )}

        {onEdit && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(project.id)}
            className="flex-1"
          >
            Edit
          </Button>
        )}

        {onDelete && (
          <Button
            variant="error"
            size="sm"
            onClick={() => {
              if (confirm('Are you sure you want to delete this project?')) {
                onDelete(project.id);
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

export default ProjectCard;
