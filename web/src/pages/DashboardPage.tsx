import React, { useEffect } from 'react';
import { useProgressStore } from '../stores/progressStore';
import { useParentAuthStore } from '../stores/parentAuthStore';

export default function DashboardPage() {
  const parent = useParentAuthStore((state) => state.parent);
  const children = useProgressStore((state) => state.children);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Children Linked
          </h3>
          <p className="text-3xl font-bold text-primary">
            {parent?.children?.length || 0}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            Activities This Week
          </h3>
          <p className="text-3xl font-bold text-accent">12</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            New Achievements
          </h3>
          <p className="text-3xl font-bold text-success">3</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
          Your Children
        </h2>
        {children.length > 0 ? (
          <div className="space-y-4">
            {children.map((child) => (
              <div key={child.childId} className="border-l-4 border-primary p-4 bg-primary/5">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {child.childName}
                </h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  Grade {child.grade} • {child.activitiesCompleted} activities completed
                </p>
              </div>
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
