// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useTeacherStore } from '@/stores/teacher'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ActivityCard from './ActivityCard'

export function ActivityList() {
  const navigate = useNavigate()
  const {
    activities,
    loading,
    error,
    fetchActivities,
    totalPages,
    currentPage,
    setCurrentPage,
    clearError
  } = useTeacherStore()

  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    subject: '',
    grade_level: '',
    status: ''
  })

  // Fetch activities on mount and when page/filters change
  useEffect(() => {
    const params: any = { page }
    if (filters.subject) params.subject = filters.subject
    if (filters.grade_level) params.grade_level = parseInt(filters.grade_level)
    if (filters.status) params.status = filters.status

    fetchActivities(params).catch(console.error)
  }, [page, filters, fetchActivities])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    setCurrentPage(newPage)
    window.scrollTo(0, 0)
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setPage(1) // Reset to first page when filtering
  }

  const handleClearFilters = () => {
    setFilters({ subject: '', grade_level: '', status: '' })
    setPage(1)
  }

  return (
    <div className="activity-list-container p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Activities</h1>
          <p className="text-gray-600 mt-1">Manage your educational activities</p>
        </div>
        <button
          onClick={() => navigate('/teacher/activities/new')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          + Create Activity
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex justify-between items-center">
          <p className="text-red-800">{error}</p>
          <button
            onClick={clearError}
            className="text-red-600 hover:text-red-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Subject
            </label>
            <select
              value={filters.subject}
              onChange={(e) => handleFilterChange('subject', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Subjects</option>
              <option value="Science">Science</option>
              <option value="Math">Math</option>
              <option value="Language">Language</option>
              <option value="History">History</option>
              <option value="Art">Art</option>
              <option value="PE">PE</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Grade Level
            </label>
            <select
              value={filters.grade_level}
              onChange={(e) => handleFilterChange('grade_level', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Grades</option>
              {Array.from({ length: 10 }, (_, i) => i + 3).map(grade => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleClearFilters}
              className="w-full px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading activities...</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && activities.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-600 text-lg mb-4">No activities found</p>
          <p className="text-gray-500 mb-6">
            {Object.values(filters).some(v => v) 
              ? 'Try adjusting your filters' 
              : 'Create your first activity to get started'}
          </p>
          {!Object.values(filters).some(v => v) && (
            <button
              onClick={() => navigate('/teacher/activities/new')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Create Activity
            </button>
          )}
        </div>
      )}

      {/* Activities Grid */}
      {!loading && activities.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {activities.map(activity => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onEdit={(id) => navigate(`/teacher/activities/${id}/edit`)}
                onViewDetail={(id) => navigate(`/teacher/activities/${id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 font-semibold"
              >
                Previous
              </button>

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`px-3 py-2 rounded-lg font-semibold transition-colors ${
                      page === p
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 font-semibold"
              >
                Next
              </button>
            </div>
          )}

          {/* Results info */}
          <div className="text-center mt-6 text-gray-600">
            <p>Page {currentPage} of {totalPages}</p>
          </div>
        </>
      )}
    </div>
  )
}

export default ActivityList
