// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectDetailPage
 * Page for viewing and editing a specific project with activity management
 * Currently a placeholder - full project management coming in Phase 5
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'

const ProjectDetailPage: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          📋 Projects
        </h1>
        <p className="text-gray-600">
          Project management is in development and coming in Phase 5
        </p>
      </div>

      {/* Feature Coming Soon */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🚀</div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Projects Coming Soon
          </h2>
          
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Project management allows you to organize multiple activities into cohesive learning experiences.
          </p>

          <div className="bg-white rounded-lg p-6 mb-6 text-left">
            <h3 className="font-semibold text-gray-900 mb-4">Planned Features:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>✅ Create and manage projects</li>
              <li>✅ Organize activities within projects</li>
              <li>✅ Set project timelines</li>
              <li>✅ Track project progress</li>
              <li>✅ Share projects with other teachers</li>
            </ul>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/teacher/activities')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Go to Activities
            </button>
            <button
              onClick={() => navigate('/teacher')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Development Info */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <p className="font-semibold mb-2">📅 Timeline:</p>
        <p>Projects are scheduled for Phase 5 (Months 7+). For now, manage activities directly in the Activities section.</p>
      </div>
    </div>
  )
}

export default ProjectDetailPage
