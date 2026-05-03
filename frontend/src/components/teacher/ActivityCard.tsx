// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { Activity } from '@/types/teacher'
import { useTeacherStore } from '@/stores/teacher'
import { useState } from 'react'

interface ActivityCardProps {
  activity: Activity
  onEdit: (id: string) => void
  onViewDetail: (id: string) => void
}

const ActivityCard = ({ activity, onEdit, onViewDetail }: ActivityCardProps) => {
  const { deleteActivity, loading } = useTeacherStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      published: 'bg-green-100 text-green-800 border-green-200',
      archived: 'bg-gray-100 text-gray-800 border-gray-200'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getSubjectColor = (subject: string) => {
    const colors: Record<string, string> = {
      Science: 'bg-blue-50 text-blue-700',
      Math: 'bg-purple-50 text-purple-700',
      Language: 'bg-green-50 text-green-700',
      History: 'bg-amber-50 text-amber-700',
      Art: 'bg-pink-50 text-pink-700',
      PE: 'bg-red-50 text-red-700'
    }
    return colors[subject] || 'bg-gray-50 text-gray-700'
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteActivity(activity.id)
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('Delete failed:', error)
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-200 flex flex-col h-full">
        {/* Top section with status */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-start">
          <h3 className="text-lg font-bold text-gray-900 flex-1 pr-2 line-clamp-2">
            {activity.title}
          </h3>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${getStatusColor(activity.status)}`}>
            {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
          </span>
        </div>

        {/* Content section */}
        <div className="p-4 flex-grow">
          {/* Description */}
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {activity.description || 'No description provided'}
          </p>

          {/* Subject badge */}
          <div className="mb-4">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getSubjectColor(activity.subject)}`}>
              {activity.subject}
            </span>
          </div>

          {/* Metadata grid */}
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Grade Level:</span>
              <span className="font-semibold text-gray-900">Grade {activity.grade_level}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Difficulty:</span>
              <span className="font-semibold text-gray-900">
                {'★'.repeat(activity.difficulty_level)}{'☆'.repeat(5 - activity.difficulty_level)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-semibold text-gray-900">{activity.estimated_duration_minutes}m</span>
            </div>

            {activity.location_name && (
              <div className="flex justify-between">
                <span className="text-gray-600">Location:</span>
                <span className="font-semibold text-gray-900 text-right">{activity.location_name}</span>
              </div>
            )}

            {activity.materials_needed && activity.materials_needed.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-gray-600">Materials:</span>
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  {activity.materials_needed.length} items
                </span>
              </div>
            )}

            {activity.learning_objectives && activity.learning_objectives.length > 0 && (
              <div className="flex justify-between items-start">
                <span className="text-gray-600">Objectives:</span>
                <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                  {activity.learning_objectives.length} objectives
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="border-t border-gray-200 p-4 flex gap-2">
          <button
            onClick={() => onViewDetail(activity.id)}
            className="flex-1 px-3 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
          >
            View
          </button>
          <button
            onClick={() => onEdit(activity.id)}
            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-sm"
          >
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-semibold text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Activity?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>"{activity.title}"</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ActivityCard
