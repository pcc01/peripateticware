// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ActivityListPage
 * Full page for managing learning activities
 * 
 * Features:
 * - Activity list with filters
 * - Create new activity button
 * - Navigation
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ActivityList from '../../components/teacher/ActivityList';
import Button from '../../components/common/Button';

export const ActivityListPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            📚 Learning Activities
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create, manage, and organize learning activities for your students
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate('/teacher/activities/new')}
        >
          + New Activity
        </Button>
      </div>

      {/* Activity List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
        <ActivityList
          onActivitySelect={(activityId) => {
            navigate(`/teacher/activities/${activityId}/edit`);
          }}
          showFilters={true}
        />
      </div>
    </div>
  );
};

export default ActivityListPage;
