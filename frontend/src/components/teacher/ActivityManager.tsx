import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityCreateRequest, Activity, ActivityZone, ZoneShape } from '@types/session'
import { Difficulty } from '@/config/constants'
import Card from '@components/common/Card'
import Input from '@components/common/Input'
import Select from '@components/common/Select'
import Button from '@components/common/Button'
import Modal from '@components/common/Modal'
import Map from '@components/common/Map'
import useGeolocation from '@hooks/useGeolocation'

interface ActivityManagerProps {
  curriculumId: string
  onActivityCreated?: (activity: Activity) => void
}

const ActivityManager: React.FC<ActivityManagerProps> = ({ curriculumId, onActivityCreated }) => {
  const { t } = useTranslation(['teacher', 'common'])
  const { coordinates } = useGeolocation()
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'basic' | 'location' | 'zone' | 'review'>(
    'basic'
  )
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState<ActivityCreateRequest>({
    name: '',
    curriculum_id: curriculumId,
    latitude: coordinates?.latitude || 40.7128,
    longitude: coordinates?.longitude || -74.006,
    location_name: '',
    zone: {
      id: '',
      name: '',
      location: {
        latitude: coordinates?.latitude || 40.7128,
        longitude: coordinates?.longitude || -74.006,
        name: '',
      },
      shape: ZoneShape.CIRCLE,
      radius: 100,
    },
    difficulty: Difficulty.MEDIUM,
    duration_minutes: 30,
    objectives: [],
    instructions: '',
    resources: [],
    tags: [],
  })

  const difficultyOptions = Object.values(Difficulty).map((d) => ({
    value: d,
    label: d.charAt(0).toUpperCase() + d.slice(1),
  }))

  const handleNext = () => {
    const steps: Array<'basic' | 'location' | 'zone' | 'review'> = ['basic', 'location', 'zone', 'review']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
    }
  }

  const handlePrevious = () => {
    const steps: Array<'basic' | 'location' | 'zone' | 'review'> = ['basic', 'location', 'zone', 'review']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      // TODO: Call activity service to create activity
      console.log('Creating activity:', formData)
      setIsOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="primary">
        {t('teacher:activities.createNewActivity')}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false)
          setStep('basic')
        }}
        title={t('teacher:activities.createNewActivity')}
        size="lg"
        footer={
          <div className="flex gap-2 justify-between w-full">
            <div>
              <Button
                variant="secondary"
                onClick={handlePrevious}
                disabled={step === 'basic'}
              >
                {t('common:previous')}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setIsOpen(false)}
              >
                {t('common:cancel')}
              </Button>
              {step === 'review' ? (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  isLoading={isLoading}
                >
                  {t('common:save')}
                </Button>
              ) : (
                <Button variant="primary" onClick={handleNext}>
                  {t('common:next')}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {/* Step 1: Basic Info */}
        {step === 'basic' && (
          <div className="space-y-4">
            <Input
              label={t('teacher:activities.activityName')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('teacher:activities.difficulty')}
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as Difficulty })}
                options={difficultyOptions}
              />

              <Input
                label={t('teacher:activities.duration')}
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: parseInt(e.target.value),
                  })
                }
              />
            </div>

            <Input
              label={t('teacher:activities.instructions')}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              multiline
              rows={4}
            />
          </div>
        )}

        {/* Step 2: Location */}
        {step === 'location' && (
          <div className="space-y-4">
            <Input
              label={t('teacher:activities.locationName')}
              value={formData.location_name}
              onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('teacher:activities.latitude')}
                type="number"
                step="0.0001"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
              />
              <Input
                label={t('teacher:activities.longitude')}
                type="number"
                step="0.0001"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
              />
            </div>

            {/* Mini map */}
            <Map
              center={[formData.latitude, formData.longitude]}
              zoom={15}
              height="300px"
              onLocationSelect={(location) =>
                setFormData({
                  ...formData,
                  latitude: location.latitude,
                  longitude: location.longitude,
                  location_name: location.name,
                })
              }
            />
          </div>
        )}

        {/* Step 3: Zone */}
        {step === 'zone' && (
          <div className="space-y-4">
            <Input
              label={t('teacher:activities.setZoneRadius')}
              type="number"
              value={formData.zone.radius || 100}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  zone: { ...formData.zone, radius: parseInt(e.target.value) },
                })
              }
              hint="Radius in meters for circular zone"
            />

            <Map
              center={[formData.latitude, formData.longitude]}
              zoom={15}
              height="300px"
              zones={[formData.zone]}
              editable
            />
          </div>
        )}

        {/* Step 4: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <Card title={t('teacher:activities.activityName')}>
              <p className="text-lg font-medium">{formData.name}</p>
            </Card>

            <Card title={t('teacher:activities.location')}>
              <p>{formData.location_name}</p>
              <p className="text-sm text-color-text-secondary">
                {formData.latitude.toFixed(4)}, {formData.longitude.toFixed(4)}
              </p>
            </Card>

            <Card title={t('teacher:activities.instructions')}>
              <p>{formData.instructions}</p>
            </Card>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">{t('teacher:activities.difficulty')}:</span>
                <p>{formData.difficulty}</p>
              </div>
              <div>
                <span className="font-medium">{t('teacher:activities.duration')}:</span>
                <p>{formData.duration_minutes} min</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default ActivityManager
