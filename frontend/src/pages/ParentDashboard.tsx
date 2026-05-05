// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@hooks/useAuth'
import Card from '@components/common/Card'

const ParentDashboard: React.FC = () => {
  const { t } = useTranslation(['parent', 'common'])
  const { user } = useAuth()

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Parent Dashboard</h1>
        <p className="text-xl text-color-text-secondary">
          Welcome, {user?.full_name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card title="Children Enrolled">
          <p className="text-3xl font-bold text-color-primary">0</p>
        </Card>
        <Card title="Activities This Week">
          <p className="text-3xl font-bold text-color-success">0</p>
        </Card>
        <Card title="Learning Time">
          <p className="text-3xl font-bold text-color-info">0 hrs</p>
        </Card>
      </div>

      {/* Content */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Children's Progress</h2>
        <Card>
          <p className="text-center text-color-text-secondary">
            Parent dashboard coming soon...
          </p>
        </Card>
      </div>
    </div>
  )
}

export default ParentDashboard