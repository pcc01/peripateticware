import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@hooks/useAuth'
import { CurriculumUnit } from '@types/curriculum'
import Card from '@components/common/Card'
import Button from '@components/common/Button'
import Badge from '@components/common/Badge'
import CurriculumEditor from '@components/teacher/CurriculumEditor'
import ActivityManager from '@components/teacher/ActivityManager'
import curriculumService from '@services/curriculumService'

const TeacherDashboard: React.FC = () => {
  const { t } = useTranslation(['teacher', 'common'])
  const { user } = useAuth()
  const [curriculumUnits, setCurriculumUnits] = useState<CurriculumUnit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCurriculum, setSelectedCurriculum] = useState<CurriculumUnit | null>(null)

  useEffect(() => {
    loadCurriculum()
  }, [])

  const loadCurriculum = async () => {
    try {
      const units = await curriculumService.listUnits()
      setCurriculumUnits(units)
    } catch (error) {
      console.error('Failed to load curriculum units:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCurriculumSaved = (unit: CurriculumUnit) => {
    setCurriculumUnits([unit, ...curriculumUnits])
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{t('teacher:dashboard.title')}</h1>
        <p className="text-xl text-color-text-secondary">
          {t('teacher:dashboard.welcome', { name: user?.full_name })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card title={t('teacher:dashboard.activeSessionsLabel')}>
          <p className="text-3xl font-bold text-color-primary">0</p>
        </Card>
        <Card title={t('teacher:dashboard.totalStudentsLabel')}>
          <p className="text-3xl font-bold text-color-success">0</p>
        </Card>
        <Card title={t('teacher:dashboard.curriculumUnitsLabel')}>
          <p className="text-3xl font-bold text-color-info">{curriculumUnits.length}</p>
        </Card>
      </div>

      {/* Curriculum Management */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">{t('teacher:curriculum.title')}</h2>
          <CurriculumEditor onSave={handleCurriculumSaved} />
        </div>

        {isLoading ? (
          <Card>
            <p className="text-center text-color-text-secondary">{t('common:loading')}</p>
          </Card>
        ) : curriculumUnits.length === 0 ? (
          <Card>
            <p className="text-center text-color-text-secondary">
              {t('common:noData')}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {curriculumUnits.map((unit) => (
              <Card
                key={unit.curriculum_id}
                title={unit.title}
                subtitle={unit.subject}
              >
                <p className="mb-4 line-clamp-2 text-color-text-secondary">
                  {unit.description}
                </p>

                <div className="flex gap-2 flex-wrap mb-4">
                  <Badge variant="info">{unit.subject}</Badge>
                  <Badge variant="secondary">
                    Grade {unit.grade_level}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedCurriculum(unit)}
                  >
                    {t('common:view')}
                  </Button>
                  {unit.curriculum_id === selectedCurriculum?.curriculum_id && (
                    <ActivityManager
                      curriculumId={unit.curriculum_id}
                    />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Selected Curriculum Detail */}
      {selectedCurriculum && (
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setSelectedCurriculum(null)}
            className="mb-4"
          >
            ← {t('common:back')}
          </Button>

          <Card title={selectedCurriculum.title}>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">{t('teacher:curriculum.description')}</h3>
                <p>{selectedCurriculum.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-sm mb-1">
                    {t('teacher:curriculum.bloomLevel')}
                  </h3>
                  <p className="text-color-text-secondary">
                    Level {selectedCurriculum.bloom_level}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1">
                    {t('teacher:curriculum.marzanoLevel')}
                  </h3>
                  <p className="text-color-text-secondary">
                    Level {selectedCurriculum.marzano_level}
                  </p>
                </div>
              </div>

              {selectedCurriculum.standards && selectedCurriculum.standards.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">
                    {t('teacher:curriculum.standards')}
                  </h3>
                  <ul className="list-disc list-inside space-y-1">
                    {selectedCurriculum.standards.map((standard, idx) => (
                      <li key={idx} className="text-color-text-secondary">
                        {standard}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default TeacherDashboard
