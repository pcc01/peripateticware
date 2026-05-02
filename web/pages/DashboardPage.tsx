// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// src/pages/DashboardPage.tsx

import React, { useEffect, useState } from 'react';
import { useParentAuthStore } from '../stores/parentAuthStore';
import { useProgressStore } from '../stores/progressStore';
import { childrenApi, progressApi, isApiError, getErrorMessage } from '../services/api';
import { ChildProgress } from '../types/parent';

export default function DashboardPage() {
  const parent = useParentAuthStore((state) => state.parent);
  const [children, setChildren] = useState<ChildProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!parent?.id) {
        setError('Parent ID not found');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Fetch linked children
        const childrenLinks = await childrenApi.listChildren(parent.id);

        // Fetch progress for each child
        const progressData = await Promise.all(
          childrenLinks.map((child: any) =>
            progressApi.getChildProgress(parent.id, child.childId)
              .catch(() => ({
                childId: child.childId,
                childName: child.childName,
                grade: 0,
                competencies: [],
                activitiesCompleted: 0,
                hoursLearned: 0,
                engagementScore: 0,
                lastActive: new Date().toISOString(),
              }))
          )
        );

        setChildren(progressData);
      } catch (err) {
        const message = isApiError(err) ? err.message : getErrorMessage(err);
        setError(message);
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [parent?.id]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          Welcome back, {parent?.name}!
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Monitor your children's learning progress
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Children Linked
          </h3>
          <p className="text-3xl font-bold text-primary">
            {children.length}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Activities This Week
          </h3>
          <p className="text-3xl font-bold text-accent">
            {children.reduce((sum, child) => sum + child.activitiesCompleted, 0)}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Avg. Engagement
          </h3>
          <p className="text-3xl font-bold text-success">
            {children.length > 0
              ? Math.round(children.reduce((sum, child) => sum + child.engagementScore, 0) / children.length)
              : 0}%
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
          Your Children
        </h2>
        {children.length > 0 ? (
          <div className="space-y-4">
            {children.map((child) => (
              <a
                key={child.childId}
                href={`/children/${child.childId}/progress`}
                className="block border-l-4 border-primary p-4 bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors"
              >
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {child.childName}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  Grade {child.grade} • {child.activitiesCompleted} activities completed
                  • {child.hoursLearned.toFixed(1)} hours of learning
                </p>
                <div className="flex items-center mt-2 gap-4">
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    Engagement: {child.engagementScore}%
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">
            No children linked yet. Add your child to get started.
          </p>
        )}
      </div>
    </div>
  );
}
