// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurriculumCreateRequest, CurriculumUnit } from '@types/curriculum'
import { SUBJECTS, GRADE_LEVELS, BLOOM_LEVELS, MARZANO_LEVELS } from '@/config/constants'
import Card from '@components/common/Card'
import Input from '@components/common/Input'
import Select from '@components/common/Select'
import Button from '@components/common/Button'
import Modal from '@components/common/Modal'
import curriculumService from '@services/curriculumService'

interface CurriculumEditorProps {
  onSave?: (unit: CurriculumUnit) => void
  initialUnit?: CurriculumUnit
}

const CurriculumEditor: React.FC<CurriculumEditorProps> = ({ onSave, initialUnit }) => {
  const { t } = useTranslation(['teacher', 'curriculum', 'common'])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<CurriculumCreateRequest>(
    initialUnit || {
      title: '',
      description: '',
      subject: '',
      grade_level: 9,
      bloom_level: 1,
      marzano_level: 1,
      standards: [],
      content: { sections: [] },
    }
  )

  const subjectOptions = SUBJECTS.map((s) => ({ value: s, label: s }))
  const gradeLevelOptions = Object.entries(GRADE_LEVELS).map(([k, v]) => ({
    value: k,
    label: v,
  }))
  const bloomOptions = Object.entries(BLOOM_LEVELS).map(([k, v]) => ({
    value: k,
    label: `${v.name} - ${v.description}`,
  }))
  const marzanoOptions = Object.entries(MARZANO_LEVELS).map(([k, v]) => ({
    value: k,
    label: `${v.name} - ${v.description}`,
  }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const savedUnit = await curriculumService.createUnit(formData)
      onSave?.(savedUnit)
      setIsOpen(false)

      // Reset form
      setFormData({
        title: '',
        description: '',
        subject: '',
        grade_level: 9,
        bloom_level: 1,
        marzano_level: 1,
        standards: [],
        content: { sections: [] },
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save curriculum unit')
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof CurriculumCreateRequest, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="primary">
        {t('teacher:curriculum.createNewUnit')}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('teacher:curriculum.createNewUnit')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit} isLoading={isLoading}>
              {t('common:save')}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {error && (
            <div className="bg-color-error/10 text-color-error px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Input
            label={t('teacher:curriculum.unitTitle')}
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            required
          />

          <Input
            label={t('teacher:curriculum.description')}
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            multiline
            rows={3}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('teacher:curriculum.subject')}
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              options={subjectOptions}
              required
            />

            <Select
              label={t('teacher:curriculum.gradeLevel')}
              value={formData.grade_level}
              onChange={(e) => handleInputChange('grade_level', parseInt(e.target.value))}
              options={gradeLevelOptions}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('teacher:curriculum.bloomLevel')}
              value={formData.bloom_level}
              onChange={(e) => handleInputChange('bloom_level', parseInt(e.target.value))}
              options={bloomOptions}
            />

            <Select
              label={t('teacher:curriculum.marzanoLevel')}
              value={formData.marzano_level}
              onChange={(e) => handleInputChange('marzano_level', parseInt(e.target.value))}
              options={marzanoOptions}
            />
          </div>

          <Input
            label={t('teacher:curriculum.standards')}
            value={formData.standards?.join(', ') || ''}
            onChange={(e) => handleInputChange('standards', e.target.value.split(',').map((s) => s.trim()))}
            hint="Comma-separated list"
          />
        </form>
      </Modal>
    </>
  )
}

export default CurriculumEditor
