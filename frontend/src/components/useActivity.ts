// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * useActivity Custom Hook
 * Provides convenient access to activity store methods
 */

import { useTeacherStore } from '../stores/teacher';
import { Activity, ActivityFilters, ActivityFormData } from '../types/teacher';

export const useActivity = () => {
  const {
    activities,
    paginatedActivities,
    selectedActivity,
    loading,
    error,
    filters,
    fetchActivities,
    fetchActivity,
    createActivity,
    updateActivity,
    deleteActivity,
    publishActivity,
    archiveActivity,
    setFilters,
    clearError,
  } = useTeacherStore();

  return {
    // State
    activities,
    paginatedActivities,
    selectedActivity,
    loading,
    error,
    filters,

    // Actions
    fetchActivities,
    fetchActivity,
    createActivity,
    updateActivity,
    deleteActivity,
    publishActivity,
    archiveActivity,
    setFilters,
    clearError,

    // Computed
    hasActivities: activities.length > 0,
    isLoading: loading,
    hasError: error !== null,
  };
};

export default useActivity;

