import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { LearningSession } from '@types/session'
import { CurriculumUnit } from '@types/curriculum'
import Card from '@components/common/Card'
import Button from '@components/common/Button'
import Badge from '@components/common/Badge'
import Input from '@components/common/Input'
import Select from '@components/common/Select'
import Modal from '@components/common/Modal'
import useGeolocation from '@hooks/useGeolocation'
import sessionService from '@services/sessionService'
import curriculumService from '@services/curriculumService'

const StudentDashboard: React.FC = () => {
  const { t } = useTranslation(['student', 'common'])
  const { user } = useAuth()
  const navigate = useNavigate()
  const { coordinates, getLocation } = useGeolocation()

  const [sessions, setSessions] = useState<LearningSession[]>([])
  const [curriculum, setCurriculum] = useState<CurriculumUnit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [selectedCurriculum, setSelectedCurriculum] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [sessionsData, curriculumData] = await Promise.all([
        sessionService.listSessions(),
        curriculumService.listUnits(),
      ])
      setSessions(sessionsData)
      setCurriculum(curriculumData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSession = async () => {
    if (!sessionTitle || !selectedCurriculum || !coordinates) {
      alert(t('common:required'))
      return
    }

    try {
      const newSession = await sessionService.createSession({
        title: sessionTitle,
        curriculum_id: selectedCurriculum,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        location_name: `Session Start (${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)})`,
      })

      setSessions([newSession, ...sessions])
      setIsCreateSessionOpen(false)
      setSessionTitle('')
      setSelectedCurriculum('')

      // Navigate to session
      navigate(`/session/${newSession.session_id}`)
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session')
    }
  }

  const curriculumOptions = curriculum.map((c) => ({
    value: c.curriculum_id,
    label: `${c.title} (Grade ${c.grade_level})`,
  }))

  const activeSessions = sessions.filter((s) => s.status === 'in_progress')
  const completedSessions = sessions.filter((s) => s.status === 'completed')

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{t('student:dashboard.title')}</h1>
        <p className="text-xl text-color-text-secondary">
          {t('student:dashboard.welcome', { name: user?.full_name })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card title={t('student:dashboard.totalMinutes')}>
          <p className="text-3xl font-bold text-color-primary">0</p>
        </Card>
        <Card title={t('student:dashboard.activitiesCompleted')}>
          <p className="text-3xl font-bold text-color-success">
            {completedSessions.length}
          </p>
        </Card>
        <Card title={t('student:dashboard.inProgressSessions')}>
          <p className="text-3xl font-bold text-color-warning">
            {activeSessions.length}
          </p>
        </Card>
        <Card>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              getLocation()
              setIsCreateSessionOpen(true)
            }}
          >
            {t('student:dashboard.startNewSession')}
          </Button>
        </Card>
      </div>

      {/* Create Session Modal */}
      <Modal
        isOpen={isCreateSessionOpen}
        onClose={() => setIsCreateSessionOpen(false)}
        title={t('student:session.createSession')}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsCreateSessionOpen(false)}
            >
              {t('common:cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSession}
              disabled={!sessionTitle || !selectedCurriculum || !coordinates}
            >
              {t('student:session.confirmStart')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!coordinates && (
            <div className="bg-color-warning/10 text-color-warning px-4 py-3 rounded text-sm">
              {t('common:loading')} GPS...
            </div>
          )}

          <Input
            label={t('student:session.sessionTitle')}
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            required
            placeholder={t('student:session.sessionTitle_placeholder')}
          />

          <Select
            label={t('student:session.selectCurriculum')}
            value={selectedCurriculum}
            onChange={(e) => setSelectedCurriculum(e.target.value)}
            options={curriculumOptions}
            required
          />

          {coordinates && (
            <div className="text-sm text-color-text-secondary">
              <p>{t('student:session.startLocation')}</p>
              <p className="font-mono">
                {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Sessions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">{t('student:dashboard.recentSessions')}</h2>

        {isLoading ? (
          <Card>
            <p className="text-center">{t('common:loading')}</p>
          </Card>
        ) : sessions.length === 0 ? (
          <Card>
            <p className="text-center text-color-text-secondary">
              {t('common:noData')}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card key={session.session_id}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">{session.title}</h3>
                    <p className="text-sm text-color-text-secondary">
                      {session.location.name}
                    </p>
                  </div>
                  <Badge
                    variant={
                      session.status === 'in_progress'
                        ? 'warning'
                        : session.status === 'completed'
                          ? 'success'
                          : 'secondary'
                    }
                  >
                    {session.status}
                  </Badge>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/session/${session.session_id}`)}
                    className="ml-4"
                  >
                    {session.status === 'in_progress'
                      ? t('common:view')
                      : t('common:view')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default StudentDashboard
