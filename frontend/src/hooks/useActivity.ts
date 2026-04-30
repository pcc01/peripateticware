/**
 * useActivity Custom Hook
 * Provides convenient access to activity store methods
 */

import { useActivityStore } from '../stores/teacher';
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
  } = useActivityStore();

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
