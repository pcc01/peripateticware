// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useParams, useNavigate } from 'react-router-dom'
import { useTeacherStore } from '@/stores/teacher'
import { useEffect } from 'react'

const ActivityPreview = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentActivity, getActivity, loading, error } = useTeacherStore()

  useEffect(() => {
    if (id) {
      getActivity(id).catch(console.error)
    }
  }, [id, getActivity])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading activity...</p>
        </div>
      </div>
    )
  }

  if (error || !currentActivity) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-800">
          <p className="font-semibold">Error</p>
          <p>{error || 'Activity not found'}</p>
          <button
            onClick={() => navigate('/teacher/activities')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Back to Activities
          </button>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {currentActivity.title}
          </h1>
          <span className={`inline-block px-4 py-1 rounded-full font-semibold text-sm ${getStatusColor(currentActivity.status)}`}>
            {currentActivity.status.charAt(0).toUpperCase() + currentActivity.status.slice(1)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/teacher/activities/${currentActivity.id}/edit`)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            Edit
          </button>
          <button
            onClick={() => navigate('/teacher/activities')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
          >
            Back
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow p-8 space-y-6">
        {/* Description */}
        {currentActivity.description && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Description</h2>
            <p className="text-gray-700 leading-relaxed">{currentActivity.description}</p>
          </section>
        )}

        {/* Basic Information */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Grade Level</p>
              <p className="text-lg text-gray-900">Grade {currentActivity.grade_level}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Subject</p>
              <p className="text-lg text-gray-900">{currentActivity.subject}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Difficulty</p>
              <p className="text-lg text-gray-900">
                {'★'.repeat(currentActivity.difficulty_level)}{'☆'.repeat(5 - currentActivity.difficulty_level)}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Duration</p>
              <p className="text-lg text-gray-900">{currentActivity.estimated_duration_minutes} minutes</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Activity Type</p>
              <p className="text-lg text-gray-900 capitalize">{currentActivity.activity_type}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-1">Bloom's Level</p>
              <p className="text-lg text-gray-900 capitalize">{currentActivity.bloom_level}</p>
            </div>
          </div>
        </section>

        {/* Location */}
        {currentActivity.location_name && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Location</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">Name</p>
                <p className="text-lg text-gray-900">{currentActivity.location_name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">Radius</p>
                <p className="text-lg text-gray-900">{currentActivity.location_radius_meters}m</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">Latitude</p>
                <p className="text-lg text-gray-900">{currentActivity.location_latitude.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">Longitude</p>
                <p className="text-lg text-gray-900">{currentActivity.location_longitude.toFixed(4)}</p>
              </div>
            </div>
          </section>
        )}

        {/* Materials */}
        {currentActivity.materials_needed && currentActivity.materials_needed.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Materials Needed</h2>
            <div className="flex flex-wrap gap-2">
              {currentActivity.materials_needed.map((material, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-semibold"
                >
                  {material}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Resources */}
        {currentActivity.resources && currentActivity.resources.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Resources</h2>
            <div className="flex flex-wrap gap-2">
              {currentActivity.resources.map((resource, index) => (
                <span
                  key={index}
                  className="bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-semibold"
                >
                  {resource}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Learning Objectives */}
        {currentActivity.learning_objectives && currentActivity.learning_objectives.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Learning Objectives</h2>
            <ul className="space-y-2">
              {currentActivity.learning_objectives.map((objective, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 p-3 bg-green-50 rounded-lg"
                >
                  <span className="text-green-600 font-bold mt-1">✓</span>
                  <span className="text-gray-900">{objective}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Metadata */}
        <section className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-gray-600 font-semibold">Created</p>
              <p className="text-gray-900">{new Date(currentActivity.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">Last Updated</p>
              <p className="text-gray-900">{new Date(currentActivity.updated_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-gray-600 font-semibold">Shareable</p>
              <p className="text-gray-900">{currentActivity.is_shareable ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default ActivityPreview
