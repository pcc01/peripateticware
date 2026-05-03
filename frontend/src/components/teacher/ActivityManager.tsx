// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useTeacherStore } from '@/stores/teacher'
import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Activity, CreateActivityInput } from '@/types/teacher'

const ActivityManager = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activities, getActivity, createActivity, updateActivity, loading, error, clearCurrentActivity } = useTeacherStore()

  const isEditing = !!id
  const [formData, setFormData] = useState<CreateActivityInput>({
    title: '',
    description: '',
    grade_level: 5,
    subject: 'Science',
    difficulty_level: 3,
    location_latitude: 47.6839,
    location_longitude: -122.3081,
    location_radius_meters: 500,
    location_name: '',
    estimated_duration_minutes: 45,
    materials_needed: [],
    resources: [],
    learning_objectives: [],
    curriculum_unit_ids: [],
    bloom_level: 'understand',
    activity_type: 'outdoor',
    is_shareable: false
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [newMaterial, setNewMaterial] = useState('')
  const [newObjective, setNewObjective] = useState('')
  const [newResource, setNewResource] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load existing activity if editing
  useEffect(() => {
    if (isEditing && id) {
      getActivity(id)
        .then(activity => {
          setFormData({
            title: activity.title,
            description: activity.description,
            grade_level: activity.grade_level,
            subject: activity.subject,
            difficulty_level: activity.difficulty_level,
            location_latitude: activity.location_latitude,
            location_longitude: activity.location_longitude,
            location_radius_meters: activity.location_radius_meters,
            location_name: activity.location_name,
            estimated_duration_minutes: activity.estimated_duration_minutes,
            materials_needed: activity.materials_needed,
            resources: activity.resources,
            learning_objectives: activity.learning_objectives,
            curriculum_unit_ids: activity.curriculum_unit_ids,
            bloom_level: activity.bloom_level,
            activity_type: activity.activity_type,
            is_shareable: activity.is_shareable
          })
        })
        .catch(err => {
          setSubmitError('Failed to load activity: ' + err.message)
        })
    }

    return () => {
      clearCurrentActivity()
    }
  }, [isEditing, id, getActivity, clearCurrentActivity])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required'
    } else if (formData.title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters'
    } else if (formData.title.length > 200) {
      newErrors.title = 'Title must be less than 200 characters'
    }

    if (!formData.subject) {
      newErrors.subject = 'Subject is required'
    }

    if (!formData.grade_level || formData.grade_level < 3 || formData.grade_level > 12) {
      newErrors.grade_level = 'Grade must be between 3 and 12'
    }

    if (formData.difficulty_level && (formData.difficulty_level < 1 || formData.difficulty_level > 5)) {
      newErrors.difficulty_level = 'Difficulty must be between 1 and 5'
    }

    if (formData.estimated_duration_minutes && formData.estimated_duration_minutes < 1) {
      newErrors.estimated_duration_minutes = 'Duration must be at least 1 minute'
    }

    if (formData.location_latitude && (formData.location_latitude < -90 || formData.location_latitude > 90)) {
      newErrors.location_latitude = 'Latitude must be between -90 and 90'
    }

    if (formData.location_longitude && (formData.location_longitude < -180 || formData.location_longitude > 180)) {
      newErrors.location_longitude = 'Longitude must be between -180 and 180'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setIsSubmitting(true)

    if (!validateForm()) {
      setIsSubmitting(false)
      return
    }

    try {
      if (isEditing && id) {
        await updateActivity(id, formData)
      } else {
        await createActivity(formData)
      }

      navigate('/teacher/activities')
    } catch (error: any) {
      setSubmitError(error.message || 'An error occurred while saving')
      setIsSubmitting(false)
    }
  }

  const handleAddMaterial = () => {
    if (newMaterial.trim()) {
      setFormData({
        ...formData,
        materials_needed: [...(formData.materials_needed || []), newMaterial.trim()]
      })
      setNewMaterial('')
    }
  }

  const handleRemoveMaterial = (index: number) => {
    setFormData({
      ...formData,
      materials_needed: formData.materials_needed?.filter((_, i) => i !== index) || []
    })
  }

  const handleAddObjective = () => {
    if (newObjective.trim()) {
      setFormData({
        ...formData,
        learning_objectives: [...(formData.learning_objectives || []), newObjective.trim()]
      })
      setNewObjective('')
    }
  }

  const handleRemoveObjective = (index: number) => {
    setFormData({
      ...formData,
      learning_objectives: formData.learning_objectives?.filter((_, i) => i !== index) || []
    })
  }

  const handleAddResource = () => {
    if (newResource.trim()) {
      setFormData({
        ...formData,
        resources: [...(formData.resources || []), newResource.trim()]
      })
      setNewResource('')
    }
  }

  const handleRemoveResource = (index: number) => {
    setFormData({
      ...formData,
      resources: formData.resources?.filter((_, i) => i !== index) || []
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-4xl font-bold mb-2">
        {isEditing ? 'Edit Activity' : 'Create Activity'}
      </h1>
      <p className="text-gray-600 mb-6">
        {isEditing ? 'Update your activity details' : 'Create a new educational activity'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg p-8 shadow">
        {/* Error Alert */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error</p>
            <p>{submitError}</p>
          </div>
        )}

        {/* Basic Information Section */}
        <div className="border-b border-gray-200 pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Basic Information</h2>

          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter activity title"
              maxLength={200}
            />
            {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            <p className="text-gray-500 text-xs mt-1">{formData.title?.length || 0}/200</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter activity description"
              rows={4}
            />
          </div>
        </div>

        {/* Academic Information Section */}
        <div className="border-b border-gray-200 pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Academic Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade Level */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Grade Level <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.grade_level}
                onChange={(e) => setFormData({ ...formData, grade_level: parseInt(e.target.value) })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.grade_level ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {Array.from({ length: 10 }, (_, i) => i + 3).map(grade => (
                  <option key={grade} value={grade}>Grade {grade}</option>
                ))}
              </select>
              {errors.grade_level && <p className="text-red-500 text-sm mt-1">{errors.grade_level}</p>}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.subject ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="Science">Science</option>
                <option value="Math">Math</option>
                <option value="Language">Language</option>
                <option value="History">History</option>
                <option value="Art">Art</option>
                <option value="PE">PE</option>
              </select>
              {errors.subject && <p className="text-red-500 text-sm mt-1">{errors.subject}</p>}
            </div>

            {/* Difficulty Level */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Difficulty Level: {formData.difficulty_level}/5
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={formData.difficulty_level || 3}
                  onChange={(e) => setFormData({ ...formData, difficulty_level: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-sm font-semibold text-gray-600">
                  {'★'.repeat(formData.difficulty_level || 3)}{'☆'.repeat(5 - (formData.difficulty_level || 3))}
                </span>
              </div>
            </div>

            {/* Bloom's Level */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Bloom's Taxonomy Level
              </label>
              <select
                value={formData.bloom_level}
                onChange={(e) => setFormData({ ...formData, bloom_level: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="remember">Remember</option>
                <option value="understand">Understand</option>
                <option value="apply">Apply</option>
                <option value="analyze">Analyze</option>
                <option value="evaluate">Evaluate</option>
                <option value="create">Create</option>
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Estimated Duration (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={formData.estimated_duration_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_duration_minutes: parseInt(e.target.value) || 0 })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.estimated_duration_minutes ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.estimated_duration_minutes && (
                <p className="text-red-500 text-sm mt-1">{errors.estimated_duration_minutes}</p>
              )}
            </div>

            {/* Activity Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Activity Type
              </label>
              <select
                value={formData.activity_type}
                onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="outdoor">Outdoor</option>
                <option value="indoor">Indoor</option>
                <option value="virtual">Virtual</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location Information Section */}
        <div className="border-b border-gray-200 pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Location Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.location_latitude}
                onChange={(e) => setFormData({ ...formData, location_latitude: parseFloat(e.target.value) || 0 })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.location_latitude ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., 47.6839"
              />
              {errors.location_latitude && <p className="text-red-500 text-sm mt-1">{errors.location_latitude}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={formData.location_longitude}
                onChange={(e) => setFormData({ ...formData, location_longitude: parseFloat(e.target.value) || 0 })}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.location_longitude ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., -122.3081"
              />
              {errors.location_longitude && <p className="text-red-500 text-sm mt-1">{errors.location_longitude}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Location Name
            </label>
            <input
              type="text"
              value={formData.location_name}
              onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Downtown Park, Science Museum"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 mt-4">
              Location Radius (meters)
            </label>
            <input
              type="number"
              min="1"
              value={formData.location_radius_meters}
              onChange={(e) => setFormData({ ...formData, location_radius_meters: parseInt(e.target.value) || 500 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="500"
            />
          </div>
        </div>

        {/* Materials Section */}
        <div className="border-b border-gray-200 pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Materials & Resources</h2>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Materials Needed
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newMaterial}
                onChange={(e) => setNewMaterial(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Microscopes, Beakers, Worksheets"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMaterial())}
              />
              <button
                type="button"
                onClick={handleAddMaterial}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.materials_needed || []).map((material, index) => (
                <div
                  key={index}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full flex items-center gap-2"
                >
                  <span>{material}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(index)}
                    className="font-bold hover:text-blue-900"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Additional Resources
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newResource}
                onChange={(e) => setNewResource(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Online videos, PDF guides, websites"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddResource())}
              />
              <button
                type="button"
                onClick={handleAddResource}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.resources || []).map((resource, index) => (
                <div
                  key={index}
                  className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full flex items-center gap-2"
                >
                  <span>{resource}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveResource(index)}
                    className="font-bold hover:text-purple-900"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Learning Objectives Section */}
        <div className="border-b border-gray-200 pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Learning Objectives</h2>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newObjective}
              onChange={(e) => setNewObjective(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Understand photosynthesis process"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddObjective())}
            />
            <button
              type="button"
              onClick={handleAddObjective}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(formData.learning_objectives || []).map((objective, index) => (
              <div
                key={index}
                className="bg-green-100 text-green-800 px-3 py-1 rounded-full flex items-center gap-2"
              >
                <span>{objective}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveObjective(index)}
                  className="font-bold hover:text-green-900"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Options */}
        <div className="pb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Additional Options</h2>
          
          <div className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50">
            <input
              type="checkbox"
              id="shareable"
              checked={formData.is_shareable || false}
              onChange={(e) => setFormData({ ...formData, is_shareable: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="shareable" className="ml-3 text-sm font-semibold text-gray-700 cursor-pointer flex-1">
              Make this activity shareable with other teachers
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting || loading ? (
              <span className="flex items-center justify-center">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                Saving...
              </span>
            ) : (
              isEditing ? 'Update Activity' : 'Create Activity'
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/teacher/activities')}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default ActivityManager
