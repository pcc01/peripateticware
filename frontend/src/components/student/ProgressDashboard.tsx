// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react';
import { TrendingUp, Target, Zap } from 'lucide-react';
import { ProgressDashboard as ProgressDashboardType } from '../../types/student';
import { useProgressStore } from '../../stores/student';

interface ProgressDashboardProps {
  studentId: string;
}

const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ studentId }) => {
  const { dashboard, competencies, loading, error } = useProgressStore();

  React.useEffect(() => {
    useProgressStore.getState().fetchProgressDashboard(studentId);
    useProgressStore.getState().fetchCompetencies(studentId);
  }, [studentId]);

  if (loading) return <div className="p-4 text-center">Loading progress...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!dashboard) return <div className="p-4 text-gray-600">No progress data available</div>;

  return (
    <div className="space-y-6 p-4">
      <h3 className="font-semibold text-lg">Learning Progress</h3>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Activities</p>
              <p className="text-2xl font-bold">{dashboard.activities_completed}</p>
            </div>
            <Target className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Captures</p>
              <p className="text-2xl font-bold">{dashboard.total_captures}</p>
            </div>
            <Zap className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div>
            <p className="text-gray-600 text-sm">Streak</p>
            <p className="text-2xl font-bold">{dashboard.engagement_streak_days} days</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div>
            <p className="text-gray-600 text-sm">Competencies</p>
            <p className="text-2xl font-bold">{dashboard.competencies.length}</p>
          </div>
        </div>
      </div>

      {/* Competencies */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Competency Progress
        </h4>
        <div className="space-y-3">
          {competencies.slice(0, 5).map(comp => (
            <div key={comp.competency_id}>
              <div className="flex justify-between text-sm mb-1">
                <span>{comp.competency_name}</span>
                <span className="font-medium">{comp.progress_percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${comp.progress_percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Engagement Trend */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-4">Weekly Engagement</h4>
        <div className="flex items-end gap-2 h-32">
          {dashboard.weekly_engagement.map((value, index) => (
            <div
              key={index}
              className="flex-1 bg-blue-500 rounded-t"
              style={{ height: `${(value / Math.max(...dashboard.weekly_engagement)) * 100}%` }}
              title={`Day ${index + 1}: ${value} activities`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProgressDashboard;
