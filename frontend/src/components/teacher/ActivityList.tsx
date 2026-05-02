// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ActivityList Component
 * Displays activities in grid/list view with filtering, search, and pagination
 * 
 * Features:
 * - Grid/List view toggle
 * - Filter by subject, grade level, difficulty, status
 * - Search by title
 * - Pagination
 * - Activity cards with quick actions
 * - Loading states
 * - Empty states
 */

import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useActivityStore } from '../../stores/teacher';
import { ActivityStatus } from '../../types/teacher';
import ActivityCard from './ActivityCard';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';

interface ActivityListProps {
  onActivitySelect?: (activityId: string) => void;
  showFilters?: boolean;
  compact?: boolean;
}

const SUBJECTS = [
  'English',
  'Mathematics',
  'Science',
  'Social Studies',
  'History',
  'Geography',
  'Biology',
  'Chemistry',
  'Physics',
  'Health',
  'Physical Education',
  'Arts',
  'Music',
  'Technology',
];

const STATUSES: ActivityStatus[] = ['draft', 'published', 'archived'];
const GRADES = Array.from({ length: 10 }, (_, i) => i + 3); // 3-12

export const ActivityList: React.FC<ActivityListProps> = ({
  onActivitySelect,
  showFilters = true,
  compact = false,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');

  const {
    activities,
    paginatedActivities,
    loading,
    error,
    filters,
    fetchActivities,
    deleteActivity,
    publishActivity,
    archiveActivity,
    setFilters,
    clearError,
  } = useActivityStore();

  // Fetch activities on component mount and when filters change
  useEffect(() => {
    fetchActivities(filters);
  }, [filters, fetchActivities]);

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    // Filter locally or we could add search to backend
    // For now, just update local state
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    setFilters({ [key]: value, page: 1 }); // Reset to page 1 on filter change
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    setFilters({ page: newPage });
  };

  // Filter activities locally by search term
  const filteredActivities = activities.filter((activity) =>
    activity.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={clsx(compact ? 'space-y-3' : 'space-y-4')}>
      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 flex items-start justify-between">
          <div className="flex-1">
            <p className="font-medium">Error Loading Activities</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Header Controls */}
      <div className={clsx(
        'flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between',
        compact ? 'text-sm' : ''
      )}>
        {/* Search Bar */}
        <div className="flex-1 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className={clsx(
              'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-800 text-gray-900 dark:text-white',
              'placeholder-gray-500 dark:placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              compact ? 'text-sm' : 'text-base'
            )}
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'px-3 py-1 rounded transition-colors',
              viewMode === 'grid'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            )}
            title="Grid View"
          >
            ⊞
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'px-3 py-1 rounded transition-colors',
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            )}
            title="List View"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={clsx(
          'grid gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        )}>
          {/* Subject Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject
            </label>
            <select
              value={filters.subject || ''}
              onChange={(e) => handleFilterChange('subject', e.target.value || undefined)}
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Subjects</option>
              {SUBJECTS.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          {/* Grade Level Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Grade Level
            </label>
            <select
              value={filters.grade_level || ''}
              onChange={(e) =>
                handleFilterChange('grade_level', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Grades</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
          </div>

          {/* Difficulty Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Difficulty
            </label>
            <select
              value={filters.difficulty || ''}
              onChange={(e) =>
                handleFilterChange('difficulty', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Levels</option>
              <option value="1">Very Easy</option>
              <option value="2">Easy</option>
              <option value="3">Medium</option>
              <option value="4">Hard</option>
              <option value="5">Very Hard</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredActivities.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 dark:text-gray-500 text-4xl mb-2">○</div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">No activities found</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Try adjusting your filters or create a new activity
          </p>
        </div>
      )}

      {/* Activities Grid/List */}
      {!loading && filteredActivities.length > 0 && (
        <div
          className={clsx(
            'grid gap-3',
            viewMode === 'grid'
              ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1'
          )}
        >
          {filteredActivities.map((activity) => (
            <div
              key={activity.id}
              onClick={() => onActivitySelect?.(activity.id)}
              className={clsx(
                onActivitySelect && 'cursor-pointer'
              )}
            >
              <ActivityCard
                activity={activity}
                onEdit={(id) => onActivitySelect?.(id)}
                onDelete={() => deleteActivity(activity.id)}
                onPublish={() => publishActivity(activity.id)}
                onArchive={() => archiveActivity(activity.id)}
                compact={compact}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && paginatedActivities && paginatedActivities.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(Math.max(1, filters.page - 1))}
            disabled={filters.page === 1}
          >
            ← Previous
          </Button>

          <div className="flex gap-1">
            {Array.from({ length: paginatedActivities.total_pages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={clsx(
                  'px-2 py-1 rounded text-sm font-medium transition-colors',
                  filters.page === page
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                )}
              >
                {page}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePageChange(Math.min(paginatedActivities.total_pages, filters.page + 1))}
            disabled={filters.page === paginatedActivities.total_pages}
          >
            Next →
          </Button>
        </div>
      )}

      {/* Results Info */}
      {!loading && paginatedActivities && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Showing {(filters.page - 1) * filters.page_size + 1}-
          {Math.min(filters.page * filters.page_size, paginatedActivities.total)} of{' '}
          {paginatedActivities.total} activities
        </p>
      )}
    </div>
  );
};

export default ActivityList;
