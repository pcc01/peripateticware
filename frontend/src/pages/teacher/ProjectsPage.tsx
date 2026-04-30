/**
 * ProjectsPage
 * Full page for managing learning projects
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../stores/teacher';
import { Project, ProjectFilters } from '../../types/teacher';
import ProjectCard from '../../components/teacher/ProjectCard';
import ProjectBuilder from '../../components/teacher/ProjectBuilder';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [showNewProject, setShowNewProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    projects,
    paginatedProjects,
    loading,
    error,
    filters,
    fetchProjects,
    deleteProject,
    setFilters,
  } = useProjectStore();

  useEffect(() => {
    fetchProjects(filters);
  }, [filters, fetchProjects]);

  // Filter locally by search
  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleProjectSave = (project: Project) => {
    setShowNewProject(false);
    // Refresh projects list
    fetchProjects(filters);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            🎯 Projects
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Organize activities into structured learning projects
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setShowNewProject(true)}
        >
          + New Project
        </Button>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Create New Project
              </h2>
              <ProjectBuilder
                onSave={handleProjectSave}
                onCancel={() => setShowNewProject(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredProjects.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-gray-400 dark:text-gray-500 text-5xl mb-4">○</div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">No Projects</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Create your first project to organize activities
          </p>
        </div>
      )}

      {/* Projects Grid */}
      {!loading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onView={(id) => navigate(`/teacher/projects/${id}`)}
              onEdit={(id) => navigate(`/teacher/projects/${id}`)}
              onDelete={handleDeleteProject}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {paginatedProjects && paginatedProjects.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
            disabled={filters.page === 1}
          >
            ← Previous
          </Button>
          <div className="flex gap-1">
            {Array.from({ length: paginatedProjects.total_pages }, (_, i) => i + 1).map(
              (page) => (
                <button
                  key={page}
                  onClick={() => setFilters({ page })}
                  className={`px-2 py-1 rounded text-sm font-medium ${
                    filters.page === page
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setFilters({ page: Math.min(paginatedProjects.total_pages, filters.page + 1) })
            }
            disabled={filters.page === paginatedProjects.total_pages}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
