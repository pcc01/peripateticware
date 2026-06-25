// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityCreateRequest } from '@/types/session';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import Badge from '@/components/common/Badge';
import Card from '@/components/common/Card';
import {
  parseCSV,
  parseJSON,
  validateImport,
  generateCSVTemplate,
  BatchImport } from
'@utils/batchImport';

interface BatchImportModalProps {
  curriculumId: string;
  onImportComplete: (activities: ActivityCreateRequest[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

const BatchImportModal: React.FC<BatchImportModalProps> = ({
  curriculumId,
  onImportComplete,
  isOpen,
  onClose
}) => {
  const { t } = useTranslation(['TEACHER', 'common']);
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const content = await selectedFile.text();
      let rows;

      if (selectedFile.name.endsWith('.csv')) {
        rows = parseCSV(content);
      } else if (selectedFile.name.endsWith('.json')) {
        rows = parseJSON(content);
      } else {
        throw new Error('File must be CSV or JSON');
      }

      const result = validateImport(rows, curriculumId ? [curriculumId] : []);
      setImportResult(result);
      setStep('preview');
    } catch (error: any) {
      alert(`Error parsing file: ${error.message}`);
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportActivities = async () => {
    if (!importResult?.valid.length) return;

    setIsProcessing(true);
    try {
      // In production, you'd call the API to create activities in bulk
      // For now, just call the callback
      onImportComplete(importResult.valid);
      setStep('complete');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate(['title','description','subject','grade_level']);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activities-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('teacher:activities.createNewActivity')}
      size="lg"
      footer={
      step === 'upload' ?
      <>
            <Button variant="secondary" onClick={onClose}>
              {t('common:cancel')}
            </Button>
          </> :
      step === 'preview' ?
      <>
            <Button
          variant="secondary"
          onClick={() => {
            setStep('upload');
            setFile(null);
            setImportResult(null);
          }}>
          
              {t('common:back')}
            </Button>
            <Button
          variant="primary"
          onClick={handleImportActivities}
          isLoading={isProcessing}
          disabled={!importResult?.valid.length}>
          
              {t('common:save')}
            </Button>
          </> :

      <>
            <Button variant="primary" onClick={onClose}>
              {t('common:close')}
            </Button>
          </>

      }>
      
      {/* Upload Step */}
      {step === 'upload' &&
      <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">{t("landing:import_activities_from_csv_or_json", "Import Activities from CSV or JSON")}</h3>
            <p className="text-sm text-color-text-secondary mb-4">{t("landing:upload_a_file_with_multiple_activities_t", "Upload a file with multiple activities to create them all at once.")}

          </p>
          </div>

          <div className="space-y-3">
            <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileSelect}
            className="hidden" />
          

            <Button
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            className="w-full">{t("landing:choose_file_csv_or_json", "\uD83D\uDCC1 Choose File (CSV or JSON)")}


          </Button>

            {file && <p className="text-sm text-color-success">✓ {file.name}{t("landing:selected", "selected")}</p>}
          </div>

          <div className="bg-color-bg-secondary p-4 rounded-lg">
            <h4 className="font-semibold text-sm mb-2">{t("landing:csv_format_example", "CSV Format Example:")}</h4>
            <pre className="text-xs overflow-x-auto">
{`name,latitude,longitude,location_name,difficulty,duration_minutes,objectives,instructions
Park Walk,40.7128,-74.0060,Central Park,easy,30,"Observation,Classification","Observe trees"`}
            </pre>
            <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadTemplate}
            className="mt-3">{t("landing:download_template", "\uD83D\uDCE5 Download Template")}


          </Button>
          </div>

          <div className="bg-color-info/10 text-color-info text-sm p-3 rounded">
            <strong>{t("landing:required_fields", "Required fields:")}</strong>{t("landing:name_latitude_longitude_locationname_dif", "name, latitude, longitude, location_name, difficulty,\n            duration_minutes, instructions")}

        </div>
        </div>
      }

      {/* Preview Step */}
      {step === 'preview' && importResult &&
      <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card title={t("landing:total_rows", "Total Rows")}>
              <p className="text-2xl font-bold">{importResult.summary.total}</p>
            </Card>
            <Card title={t("landing:valid", "Valid")}>
              <p className="text-2xl font-bold text-color-success">
                {importResult.summary.valid}
              </p>
            </Card>
            <Card title={t("landing:errors", "Errors")}>
              <p className="text-2xl font-bold text-color-error">
                {importResult.summary.invalid}
              </p>
            </Card>
          </div>

          {/* Valid Activities */}
          {importResult.valid.length > 0 &&
        <Card title={`Valid Activities (${importResult.valid.length})`}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importResult.valid.map((activity, idx) =>
            <div key={idx} className="text-sm p-2 bg-color-success/5 rounded">
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-xs text-color-text-secondary">
                      {activity.difficulty} • {activity.duration_minutes}{t("landing:min", "min")}
              </p>
                  </div>
            )}
              </div>
            </Card>
        }

          {/* Errors */}
          {importResult.errors.length > 0 &&
        <Card title={`Errors (${importResult.errors.length})`}>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importResult.errors.map((error, idx) =>
            <div key={idx} className="text-sm p-2 bg-color-error/5 rounded">
                    <p className="font-medium text-color-error">{t("landing:row", "Row")}
                {error.rowIndex + 2}: {error.row.name || '(no name)'}
                    </p>
                    <ul className="text-xs text-color-text-secondary mt-1">
                      {error.errors.map((err, errIdx) =>
                <li key={errIdx}>• {err}</li>
                )}
                    </ul>
                  </div>
            )}
              </div>
            </Card>
        }
        </div>
      }

      {/* Complete Step */}
      {step === 'complete' &&
      <div className="text-center space-y-4">
          <div className="text-4xl">✨</div>
          <h3 className="font-semibold text-lg">{t("landing:import_complete", "Import Complete!")}</h3>
          <p className="text-color-text-secondary">
            {importResult?.summary.valid}{t("landing:activities_have_been_created_successfull", "activities have been created successfully.")}
        </p>
        </div>
      }
    </Modal>);

};

export default BatchImportModal;