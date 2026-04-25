import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityCreateRequest } from '@types/session'
import Button from '@components/common/Button'
import Modal from '@components/common/Modal'
import Badge from '@components/common/Badge'
import Card from '@components/common/Card'
import {
  parseCSV,
  parseJSON,
  validateImport,
  generateCSVTemplate,
  BatchImport,
} from '@utils/batchImport'

interface BatchImportModalProps {
  curriculumId: string
  onImportComplete: (activities: ActivityCreateRequest[]) => void
  isOpen: boolean
  onClose: () => void
}

const BatchImportModal: React.FC<BatchImportModalProps> = ({
  curriculumId,
  onImportComplete,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation(['teacher', 'common'])
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setIsProcessing(true)

    try {
      const content = await selectedFile.text()
      let rows

      if (selectedFile.name.endsWith('.csv')) {
        rows = BatchImport.parseCSV(content)
      } else if (selectedFile.name.endsWith('.json')) {
        rows = BatchImport.parseJSON(content)
      } else {
        throw new Error('File must be CSV or JSON')
      }

      const result = BatchImport.validateImport(rows, curriculumId)
      setImportResult(result)
      setStep('preview')
    } catch (error: any) {
      alert(`Error parsing file: ${error.message}`)
      setFile(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportActivities = async () => {
    if (!importResult?.valid.length) return

    setIsProcessing(true)
    try {
      // In production, you'd call the API to create activities in bulk
      // For now, just call the callback
      onImportComplete(importResult.valid)
      setStep('complete')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadTemplate = () => {
    const csv = BatchImport.generateCSVTemplate()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'activities-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('teacher:activities.createNewActivity')}
      size="lg"
      footer={
        step === 'upload' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common:cancel')}
            </Button>
          </>
        ) : step === 'preview' ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('upload')
                setFile(null)
                setImportResult(null)
              }}
            >
              {t('common:back')}
            </Button>
            <Button
              variant="primary"
              onClick={handleImportActivities}
              isLoading={isProcessing}
              disabled={!importResult?.valid.length}
            >
              {t('common:save')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={onClose}>
              {t('common:close')}
            </Button>
          </>
        )
      }
    >
      {/* Upload Step */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Import Activities from CSV or JSON</h3>
            <p className="text-sm text-color-text-secondary mb-4">
              Upload a file with multiple activities to create them all at once.
            </p>
          </div>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileSelect}
              className="hidden"
            />

            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              📁 Choose File (CSV or JSON)
            </Button>

            {file && <p className="text-sm text-color-success">✓ {file.name} selected</p>}
          </div>

          <div className="bg-color-bg-secondary p-4 rounded-lg">
            <h4 className="font-semibold text-sm mb-2">CSV Format Example:</h4>
            <pre className="text-xs overflow-x-auto">
{`name,latitude,longitude,location_name,difficulty,duration_minutes,objectives,instructions
Park Walk,40.7128,-74.0060,Central Park,easy,30,"Observation,Classification","Observe trees"`}
            </pre>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadTemplate}
              className="mt-3"
            >
              📥 Download Template
            </Button>
          </div>

          <div className="bg-color-info/10 text-color-info text-sm p-3 rounded">
            <strong>Required fields:</strong> name, latitude, longitude, location_name, difficulty,
            duration_minutes, instructions
          </div>
        </div>
      )}

      {/* Preview Step */}
      {step === 'preview' && importResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card title="Total Rows">
              <p className="text-2xl font-bold">{importResult.summary.total}</p>
            </Card>
            <Card title="Valid">
              <p className="text-2xl font-bold text-color-success">
                {importResult.summary.valid}
              </p>
            </Card>
            <Card title="Errors">
              <p className="text-2xl font-bold text-color-error">
                {importResult.summary.invalid}
              </p>
            </Card>
          </div>

          {/* Valid Activities */}
          {importResult.valid.length > 0 && (
            <Card title={`Valid Activities (${importResult.valid.length})`}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importResult.valid.map((activity, idx) => (
                  <div key={idx} className="text-sm p-2 bg-color-success/5 rounded">
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-xs text-color-text-secondary">
                      {activity.difficulty} • {activity.duration_minutes} min
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Errors */}
          {importResult.errors.length > 0 && (
            <Card title={`Errors (${importResult.errors.length})`}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importResult.errors.map((error, idx) => (
                  <div key={idx} className="text-sm p-2 bg-color-error/5 rounded">
                    <p className="font-medium text-color-error">
                      Row {error.rowIndex + 2}: {error.row.name || '(no name)'}
                    </p>
                    <ul className="text-xs text-color-text-secondary mt-1">
                      {error.errors.map((err, errIdx) => (
                        <li key={errIdx}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Complete Step */}
      {step === 'complete' && (
        <div className="text-center space-y-4">
          <div className="text-4xl">✨</div>
          <h3 className="font-semibold text-lg">Import Complete!</h3>
          <p className="text-color-text-secondary">
            {importResult?.summary.valid} activities have been created successfully.
          </p>
        </div>
      )}
    </Modal>
  )
}

export default BatchImportModal
