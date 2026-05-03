// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectBuilder Component
 * Form for creating and editing learning projects
 * 
 * Features:
 * - Create new or edit existing project
 * - Title and description input
 * - Subject and grade level selection
 * - Duration weeks input
 * - Start and end date pickers
 * - Form validation with Zod
 * - Error handling
 * - Loading states
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Project, ProjectFormData } from '../../types/teacher';
import { useTeacherStore } from '../../stores/teacher';
import Button from '../common/Button';

// Validation schema
const projectSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000),
  grade_level: z.number().min(3).max(12),
  subject: z.string().min(1, 'Subject is required'),
  duration_weeks: z.number().min(1).max(52),
  start_date: z.string(),
  end_date: z.string().nullable(),
});

type ProjectFormFields = z.infer<typeof projectSchema>;

interface ProjectBuilderProps {
  project?: Project;
  onSave?: (project: Project) => void;
  onCancel?: () => void;
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
  'Other',
];

const GRADES = Array.from({ length: 10 }, (_, i) => i + 3); // 3-12

export const ProjectBuilder: React.FC<ProjectBuilderProps> = ({
  project,
  onSave,
  onCancel,
  compact = false,
}) => {
  const { createProject, updateProject, loading, error, clearError } =
    useTeacherStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<ProjectFormFields>({
    resolver: zodResolver(projectSchema),
    defaultValues: project
      ? {
          ...project,
          start_date: project.start_date
            ? new Date(project.start_date).toISOString().split('T')[0]
            : '',
          end_date: project.end_date
            ? new Date(project.end_date).toISOString().split('T')[0]
            : null,
        }
      : {
          title: '',
          description: '',
          grade_level: 6,
          subject: '',
          duration_weeks: 8,
          start_date: new Date().toISOString().split('T')[0],
          end_date: null,
        },
  });

  const startDate = watch('start_date');
  const endDate = watch('end_date');

  // Calculate weeks between dates
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const weeks = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
      if (weeks > 0) {
        // Auto-update duration_weeks if needed
        // This is optional - can be handled by form state
      }
    }
  }, [startDate, endDate]);

  const handleFormSubmit = async (data: ProjectFormFields) => {
    try {
      clearError();
      const formData: ProjectFormData = {
        title: data.title,
        description: data.description,
        grade_level: data.grade_level,
        subject: data.subject,
        duration_weeks: data.duration_weeks,
        start_date: new Date(data.start_date).toISOString(),
        end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
      };

      let result: Project;
      if (project?.id) {
        result = await updateProject(project.id, formData);
      } else {
        result = await createProject(formData);
      }

      reset();
      onSave?.(result);
    } catch (err) {
      console.error('Form submission error:', err);
      // Error is handled by store
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 flex items-start justify-between">
          <div>
            <p className="font-medium">Error Saving Project</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-red-800 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Project Title
        </label>
        <input
          type="text"
          {...register('title')}
          placeholder="e.g., Spring Biology Unit"
          className={clsx(
            'w-full px-4 py-2 rounded-lg border',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'placeholder-gray-500 dark:placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            errors.title
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600'
          )}
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.title.message}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Description
        </label>
        <textarea
          {...register('description')}
          placeholder="Describe the project and its goals..."
          rows={4}
          className={clsx(
            'w-full px-4 py-2 rounded-lg border',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'placeholder-gray-500 dark:placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            'resize-none',
            errors.description
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600'
          )}
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Subject & Grade Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Subject
          </label>
          <select
            {...register('subject')}
            className={clsx(
              'w-full px-4 py-2 rounded-lg border',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              errors.subject
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600'
            )}
          >
            <option value="">Select Subject</option>
            {SUBJECTS.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
          {errors.subject && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.subject.message}
            </p>
          )}
        </div>

        {/* Grade Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Grade Level
          </label>
          <select
            {...register('grade_level', { valueAsNumber: true })}
            className={clsx(
              'w-full px-4 py-2 rounded-lg border',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              errors.grade_level
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600'
            )}
          >
            {GRADES.map((grade) => (
              <option key={grade} value={grade}>
                Grade {grade}
              </option>
            ))}
          </select>
          {errors.grade_level && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.grade_level.message}
            </p>
          )}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Duration (weeks)
        </label>
        <input
          type="number"
          {...register('duration_weeks', { valueAsNumber: true })}
          min="1"
          max="52"
          className={clsx(
            'w-full px-4 py-2 rounded-lg border',
            'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
            'focus:outline-none focus:ring-2 focus:ring-blue-500',
            errors.duration_weeks
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600'
          )}
        />
        {errors.duration_weeks && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.duration_weeks.message}
          </p>
        )}
      </div>

      {/* Dates Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Start Date
          </label>
          <input
            type="date"
            {...register('start_date')}
            className={clsx(
              'w-full px-4 py-2 rounded-lg border',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              errors.start_date
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600'
            )}
          />
          {errors.start_date && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.start_date.message}
            </p>
          )}
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            End Date (optional)
          </label>
          <input
            type="date"
            {...register('end_date')}
            className={clsx(
              'w-full px-4 py-2 rounded-lg border',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              errors.end_date
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600'
            )}
          />
          {errors.end_date && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.end_date.message}
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="submit"
          variant="primary"
          className="flex-1"
          disabled={isSubmitting || loading}
          isLoading={isSubmitting || loading}
        >
          {project ? 'Update Project' : 'Create Project'}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

// Helper import for clsx
import { clsx } from 'clsx';

export default ProjectBuilder;
