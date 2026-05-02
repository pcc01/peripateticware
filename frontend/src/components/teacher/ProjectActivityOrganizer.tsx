// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectActivityOrganizer Component
 * Drag-drop interface for reordering activities in a project
 * 
 * Features:
 * - Display activities in project
 * - Drag-drop reordering
 * - Remove activity button
 * - Activity preview on hover
 * - Smooth animations
 * - Save/Cancel reordering changes
 * - Undo functionality
 */

import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { ActivityListResponse } from '../../types/teacher';
import Button from '../common/Button';

interface ProjectActivityOrganizerProps {
  projectId: string;
  activities: ActivityListResponse[];
  onReorder: (activities: { id: string; order: number }[]) => void;
  onRemove: (activityId: string) => void;
  loading?: boolean;
  compact?: boolean;
}

export const ProjectActivityOrganizer: React.FC<ProjectActivityOrganizerProps> = ({
  projectId,
  activities,
  onReorder,
  onRemove,
  loading = false,
  compact = false,
}) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [orderedActivities, setOrderedActivities] = useState(activities);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalOrder] = useState(activities);

  // Update ordered activities when props change
  useEffect(() => {
    setOrderedActivities(activities);
    setHasChanges(false);
  }, [activities]);

  // Handle drag start
  const handleDragStart = (activityId: string) => {
    setDraggedItem(activityId);
  };

  // Handle drag over
  const handleDragOver = (activityId: string) => {
    if (draggedItem && draggedItem !== activityId) {
      setDragOverItem(activityId);

      // Reorder items
      const draggedIdx = orderedActivities.findIndex((a) => a.id === draggedItem);
      const dragOverIdx = orderedActivities.findIndex((a) => a.id === activityId);

      const newOrder = [...orderedActivities];
      const temp = newOrder[draggedIdx];
      newOrder[draggedIdx] = newOrder[dragOverIdx];
      newOrder[dragOverIdx] = temp;

      setOrderedActivities(newOrder);
      setHasChanges(true);
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Handle save reordering
  const handleSaveOrder = () => {
    const reorderedActivities = orderedActivities.map((activity, index) => ({
      id: activity.id,
      order: index,
    }));
    onReorder(reorderedActivities);
  };

  // Handle undo
  const handleUndo = () => {
    setOrderedActivities(originalOrder);
    setHasChanges(false);
  };

  // Handle remove
  const handleRemoveActivity = (activityId: string) => {
    if (
      confirm(
        'Are you sure you want to remove this activity from the project? It will not be deleted.'
      )
    ) {
      onRemove(activityId);
    }
  };

  if (orderedActivities.length === 0) {
    return (
      <div className={clsx(
        'rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800 text-center',
        compact ? 'text-sm' : ''
      )}>
        <div className="text-gray-400 dark:text-gray-500 text-3xl mb-2">○</div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">No Activities</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          Add activities to organize them in this project
        </p>
      </div>
    );
  }

  return (
    <div className={clsx(
      'space-y-3 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700',
      compact ? 'text-sm' : ''
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          📋 Project Activities ({orderedActivities.length})
        </h3>
        {hasChanges && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUndo}
            >
              Undo
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveOrder}
              disabled={loading}
              isLoading={loading}
            >
              Save Order
            </Button>
          </div>
        )}
      </div>

      {/* Help Text */}
      {hasChanges && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-xs">
          Drag activities to reorder them. Click "Save Order" to apply changes.
        </div>
      )}

      {/* Activities List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {orderedActivities.map((activity, index) => (
          <div
            key={activity.id}
            draggable
            onDragStart={() => handleDragStart(activity.id)}
            onDragOver={() => handleDragOver(activity.id)}
            onDragEnd={handleDragEnd}
            className={clsx(
              'p-3 rounded-lg border-2 cursor-move transition-all duration-fast',
              draggedItem === activity.id
                ? 'opacity-50 border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                : dragOverItem === activity.id
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10 scale-105'
                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Drag Handle */}
              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                ⋮⋮
              </div>

              {/* Order Number */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300">
                {index + 1}
              </div>

              {/* Activity Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {activity.title}
                </h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                    {activity.subject}
                  </span>
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                    Grade {activity.grade_level}
                  </span>
                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                    {activity.estimated_duration_minutes} min
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={clsx(
                  'text-xs font-medium px-2 py-1 rounded whitespace-nowrap',
                  activity.status === 'published'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : activity.status === 'draft'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                )}
              >
                {activity.status === 'published' ? '✓' : activity.status === 'draft' ? '✎' : '⊘'}{' '}
                {activity.status}
              </span>

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveActivity(activity.id)}
                className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Remove activity from project"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Change Summary */}
      {hasChanges && (
        <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-xs">
          You have unsaved changes to the activity order. Click "Save Order" to apply them.
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-700">
        Showing {orderedActivities.length} activit{orderedActivities.length !== 1 ? 'ies' : 'y'}
      </p>
    </div>
  );
};

export default ProjectActivityOrganizer;
