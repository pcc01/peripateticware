/**
 * useProject Custom Hook
 * Provides convenient access to project store methods
 */

import { useProjectStore } from '../stores/teacher';
import { Project, ProjectFilters, ProjectFormData } from '../types/teacher';

export const useProject = () => {
  const {
    projects,
    paginatedProjects,
    selectedProject,
    loading,
    error,
    filters,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    addActivityToProject,
    removeActivityFromProject,
    reorderActivities,
    setFilters,
    clearError,
  } = useProjectStore();

  return {
    // State
    projects,
    paginatedProjects,
    selectedProject,
    loading,
    error,
    filters,

    // Actions
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    addActivityToProject,
    removeActivityFromProject,
    reorderActivities,
    setFilters,
    clearError,

    // Computed
    hasProjects: projects.length > 0,
    isLoading: loading,
    hasError: error !== null,
    projectCount: projects.length,
  };
};

export default useProject;
