// src/pages/ChildProgressPage.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProgressStore } from '../stores/progressStore';
import { useParentAuthStore } from '../stores/parentAuthStore';
import { progressApi, isApiError, getErrorMessage } from '../services/api';
import { ChildProgress } from '../types/parent';

export default function ChildProgressPage() {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const parent = useParentAuthStore((state) => state.parent);
  const [childProgress, setChildProgress] = useState<ChildProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      if (!childId || !parent?.id) {
        setError('Child ID or parent not found');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const data = await progressApi.getChildProgress(parent.id, childId);
        setChildProgress(data);
      } catch (err) {
        const message = isApiError(err) ? err.message : getErrorMessage(err);
        setError(message);
        console.error('Failed to fetch progress:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProgress();
  }, [childId, parent?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading progress data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-4 text-primary hover:underline font-semibold"
        >
          ← Back to Dashboard
        </button>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (!childProgress) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-4 text-primary hover:underline font-semibold"
        >
          ← Back to Dashboard
        </button>
        <div className="text-gray-600">Child not found</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-4 text-primary hover:underline font-semibold text-sm"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          {childProgress.childName}'s Progress
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Grade {childProgress.grade} • Last active: {new Date(childProgress.lastActive).toLocaleDateString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-semibold">
            ACTIVITIES COMPLETED
          </p>
          <p className="text-3xl font-bold text-primary">{childProgress.activitiesCompleted}</p>
        </div>

        <div className="card">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-semibold">
            HOURS LEARNING
          </p>
          <p className="text-3xl font-bold text-accent">{childProgress.hoursLearned.toFixed(1)}</p>
        </div>

        <div className="card">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-semibold">
            ENGAGEMENT SCORE
          </p>
          <p className="text-3xl font-bold text-success">{childProgress.engagementScore}%</p>
        </div>

        <div className="card">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-1 font-semibold">
            COMPETENCIES
          </p>
          <p className="text-3xl font-bold text-info">{childProgress.competencies.length}</p>
        </div>
      </div>

      {/* Competencies */}
      <div className="card">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
          Competency Tracking
        </h2>

        <div className="space-y-6">
          {childProgress.competencies.map((comp) => (
            <div key={comp.id} className="pb-6 border-b border-neutral-200 dark:border-neutral-700 last:border-0 last:pb-0">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-50">
                    {comp.name}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                    {comp.description}
                  </p>
                </div>
                <span className="text-sm font-semibold text-primary">
                  Level {comp.level}/{comp.targetLevel}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden mb-2">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${Math.min(comp.progress, 100)}%` }}
                />
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-400 text-right">
                {comp.progress}% towards target
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <button className="btn btn-primary">View Weekly Report</button>
        <button className="btn btn-secondary">View Monthly Report</button>
        <button className="btn btn-secondary">Message Teacher</button>
      </div>
    </div>
  );
}
