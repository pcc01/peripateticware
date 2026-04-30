/**
 * ProjectDetailPage
 * Page for viewing and editing a specific project with activity management
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../stores/teacher';
import { useActivityStore } from '../../stores/teacher';
import { ActivityListResponse, Project } from '../../types/teacher';
import ProjectBuilder from '../../components/teacher/ProjectBuilder';
import ProjectActivityOrganizer from '../../components/teacher/ProjectActivityOrganizer';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(!id || id === 'new');
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const {
    selectedProject,
    loading: projectLoading,
    fetchProject,
    updateProject,
    addActivityToProject,
  } = useProjectStore();

  const { activities: allActivities, fetchActivities } = useActivityStore();

  useEffect(() => {
    if (id && id !== 'new') {
      fetchProject(id);
    }
  }, [id, fetchProject]);

  useEffect(() => {
    // Fetch available activities
    fetchActivities({
      status: 'published',
      page: 1,
      page_size: 100,
    });
  }, [fetchActivities]);

  const handleSaveProject = (project: Project) => {
    setEditMode(false);
  };

  const handleAddActivity = async () => {
    if (selectedActivityId && selectedProject) {
      try {
        await addActivityToProject(
          selectedProject.id,
          selectedActivityId,
          selectedProject.activities?.length || 0
        );
        setShowAddActivity(false);
        setSelectedActivityId(null);
      } catch (err) {
        console.error('Failed to add activity:', err);
      }
    }
  };

  // Get activities not in project
  const availableActivities = selectedProject
    ? allActivities.filter(
        (a) => !selectedProject.activities?.some((pa) => pa.id === a.id)
      )
    : [];

  if (projectLoading && id && id !== 'new') {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!editMode && selectedProject && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {selectedProject.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {selectedProject.description}
            </p>
          </div>
          <Button variant="primary" onClick={() => setEditMode(true)}>
            ✏️ Edit Project
          </Button>
        </div>
      )}

      {/* Edit Mode */}
      {editMode && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {selectedProject ? 'Edit Project' : 'Create New Project'}
          </h2>
          <ProjectBuilder
            project={selectedProject}
            onSave={handleSaveProject}
            onCancel={() => {
              if (!selectedProject) {
                navigate('/teacher/projects');
              } else {
                setEditMode(false);
              }
            }}
          />
        </div>
      )}

      {/* Activity Organization Section */}
      {!editMode && selectedProject && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Activities in Project
            </h2>
            {availableActivities.length > 0 && (
              <Button variant="primary" onClick={() => setShowAddActivity(true)}>
                + Add Activity
              </Button>
            )}
          </div>

          {/* Activity Organizer */}
          <ProjectActivityOrganizer
            projectId={selectedProject.id}
            activities={selectedProject.activities || []}
            onReorder={async (activities) => {
              // Reorder activities
              try {
                // This would be called on the store
              } catch (err) {
                console.error('Failed to reorder:', err);
              }
            }}
            onRemove={async (activityId) => {
              // Remove activity from project
              try {
                // This would be called on the store
              } catch (err) {
                console.error('Failed to remove:', err);
              }
            }}
          />

          {/* Add Activity Modal */}
          {showAddActivity && (
            <Modal
              isOpen={showAddActivity}
              onClose={() => {
                setShowAddActivity(false);
                setSelectedActivityId(null);
              }}
              title="Add Activity to Project"
            >
              {availableActivities.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    No available activities. Create or publish activities first.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {availableActivities.map((activity) => (
                      <label
                        key={activity.id}
                        className="flex items-center p-3 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <input
                          type="radio"
                          name="activity"
                          value={activity.id}
                          checked={selectedActivityId === activity.id}
                          onChange={(e) => setSelectedActivityId(e.target.value)}
                          className="accent-blue-500"
                        />
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {activity.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {activity.subject} • Grade {activity.grade_level}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={handleAddActivity}
                      disabled={!selectedActivityId}
                    >
                      Add Activity
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setShowAddActivity(false);
                        setSelectedActivityId(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Modal>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectDetailPage;
