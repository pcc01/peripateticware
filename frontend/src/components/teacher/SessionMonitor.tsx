import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LearningSession } from '@types/session'
import Card from '@components/common/Card'
import Badge from '@components/common/Badge'
import Map from '@components/common/Map'
import { useStudentLocations, useInquiryUpdates, useSessionWebSocket } from '@hooks/useSessionWebSocket'

interface SessionMonitorProps {
  session: LearningSession
}

const SessionMonitor: React.FC<SessionMonitorProps> = ({ session }) => {
  const { t } = useTranslation(['teacher', 'common'])
  const wsState = useSessionWebSocket(session.session_id)
  const studentLocations = useStudentLocations(session.session_id)
  const inquiries = useInquiryUpdates(session.session_id)
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)

  // Convert student locations to map markers
  const markers = Object.entries(studentLocations).map(([studentId, location]) => ({
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      name: `Student ${studentId}`,
    },
    label: `📍 Student ${studentId.slice(-4)}`,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Live Map */}
      <div className="lg:col-span-2">
        <Card title={t('teacher:monitoring.liveMap')}>
          <Map
            center={[session.location.latitude, session.location.longitude]}
            zoom={14}
            height="500px"
            markers={markers}
            zones={[
              {
                id: 'session-zone',
                name: 'Activity Zone',
                location: session.location,
                shape: 'circle',
                radius: 500, // 500m zone
              },
            ]}
          />
        </Card>

        {/* Connection Status */}
        <div className="mt-4">
          <Badge variant={wsState.isConnected ? 'success' : 'error'} className="text-sm">
            {wsState.isConnected ? '🟢 Live' : '🔴 Disconnected'}
          </Badge>
          {wsState.error && <p className="text-sm text-color-error mt-2">{wsState.error}</p>}
        </div>
      </div>

      {/* Sidebar: Students & Activity */}
      <div className="space-y-4">
        {/* Active Students */}
        <Card title={t('teacher:monitoring.studentLocations')}>
          {Object.keys(studentLocations).length === 0 ? (
            <p className="text-sm text-color-text-secondary text-center py-4">
              {t('common:noData')}
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(studentLocations).map(([studentId, location]) => (
                <button
                  key={studentId}
                  onClick={() => setSelectedStudent(studentId)}
                  className={`w-full text-start p-3 rounded-lg border transition-colors ${
                    selectedStudent === studentId
                      ? 'border-color-primary bg-color-primary-light'
                      : 'border-color-border hover:border-color-primary'
                  }`}
                >
                  <p className="font-medium text-sm">Student {studentId.slice(-4)}</p>
                  <p className="text-xs text-color-text-secondary">
                    📍 {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </p>
                  <p className="text-xs text-color-text-tertiary">
                    ±{location.accuracy.toFixed(0)}m accuracy
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Inquiries */}
        <Card title={t('teacher:monitoring.inquiriesCount')}>
          <div className="text-3xl font-bold text-color-primary mb-3">
            {session.inquiry_log.length}
          </div>

          {inquiries.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {inquiries.slice(0, 5).map((inquiry, idx) => (
                <div key={idx} className="text-xs p-2 bg-color-bg-secondary rounded">
                  <p className="font-medium line-clamp-2">{inquiry.question || inquiry.text}</p>
                  <p className="text-color-text-tertiary text-xs mt-1">
                    {new Date(inquiry.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Session Controls */}
        <Card title={t('teacher:monitoring.title')}>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">{t('common:status')}:</span>
              <Badge variant="warning" size="sm" className="ml-2">
                {session.status}
              </Badge>
            </div>
            <div>
              <span className="font-medium">{t('teacher:sessions.startTime')}:</span>
              <p className="text-color-text-secondary text-xs">
                {new Date(session.created_at).toLocaleTimeString()}
              </p>
            </div>
            <div>
              <span className="font-medium">{t('teacher:sessions.location')}:</span>
              <p className="text-color-text-secondary text-xs">{session.location.name}</p>
            </div>
          </div>
        </Card>

        {/* Send Prompt */}
        <Card>
          <button className="w-full px-4 py-2 bg-color-primary text-white rounded-lg font-medium hover:bg-color-primary-dark transition-colors">
            {t('teacher:monitoring.sendPrompt')}
          </button>
        </Card>
      </div>
    </div>
  )
}

export default SessionMonitor
