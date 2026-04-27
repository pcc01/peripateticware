// src/pages/ReportsPage.tsx

import React, { useState, useEffect } from 'react';
import { useParentAuthStore } from '../stores/parentAuthStore';
import { reportsApi, isApiError, getErrorMessage } from '../services/api';

type ReportType = 'weekly' | 'monthly';
type ExportFormat = 'pdf' | 'excel' | 'csv';

export default function ReportsPage() {
  const parent = useParentAuthStore((state) => state.parent);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch report when selection changes
  useEffect(() => {
    const fetchReport = async () => {
      if (!selectedChild || !parent?.id) {
        setReportData(null);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        if (reportType === 'weekly') {
          const data = await reportsApi.getWeeklyReport(parent.id, selectedChild);
          setReportData(data);
        } else {
          const data = await reportsApi.getMonthlyReport(parent.id, selectedChild);
          setReportData(data);
        }
      } catch (err) {
        const message = isApiError(err) ? err.message : getErrorMessage(err);
        setError(message);
        console.error('Failed to fetch report:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [selectedChild, reportType, parent?.id]);

  const currentReport = reportData || {};

  const handleExport = async () => {
    if (!selectedChild || !reportData?.id || !parent?.id) {
      setError('Cannot export: missing required data');
      return;
    }

    try {
      setIsExporting(true);
      const blob = await reportsApi.exportReport(parent.id, reportData.id, exportFormat);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${selectedChild}-${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = isApiError(err) ? err.message : getErrorMessage(err);
      setError(`Export failed: ${message}`);
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const currentReport = reportType === 'weekly' ? mockReports.weekly : mockReports.monthly;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          Progress Reports
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          View and export detailed progress reports for your children
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Child Selection */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              Select Child
            </label>
            <select
              value={selectedChild || ''}
              onChange={(e) => setSelectedChild(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-800"
            >
              <option value="">Choose a child...</option>
              {parent?.children?.map((child) => (
                <option key={child.childId} value={child.childId}>
                  {child.childName}
                </option>
              ))}
            </select>
          </div>

          {/* Report Type */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-800"
            >
              <option value="weekly">Weekly Report</option>
              <option value="monthly">Monthly Report</option>
            </select>
          </div>

          {/* Export Format */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              Export Format
            </label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-800"
            >
              <option value="pdf">PDF Document</option>
              <option value="excel">Excel Spreadsheet</option>
              <option value="csv">CSV Data</option>
            </select>
          </div>
        </div>
      </div>

      {selectedChild ? (
        <>
          {/* Report Content */}
          <div className="card mb-8">
            <div className="flex justify-between items-start mb-6 pb-6 border-b border-neutral-200 dark:border-neutral-700">
              <div>
                <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
                  {reportType === 'weekly' ? 'Weekly' : 'Monthly'} Report
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {reportType === 'weekly'
                    ? `${currentReport.weekStarting} to ${currentReport.weekEnding}`
                    : `${currentReport.month} ${currentReport.year}`
                  }
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="btn btn-primary"
              >
                {isExporting ? 'Exporting...' : `Export as ${exportFormat.toUpperCase()}`}
              </button>
            </div>

            {/* Report Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold mb-1">
                  ACTIVITIES COMPLETED
                </p>
                <p className="text-3xl font-bold text-primary">{currentReport.activitiesCompleted}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold mb-1">
                  TOTAL HOURS
                </p>
                <p className="text-3xl font-bold text-accent">{currentReport.totalHours}</p>
              </div>
            </div>

            {/* Highlights */}
            <div className="mb-6">
              <h3 className="font-bold text-neutral-900 dark:text-neutral-50 mb-3">
                ✨ Highlights
              </h3>
              <ul className="space-y-2">
                {currentReport.highlights.map((highlight, idx) => (
                  <li key={idx} className="text-sm text-neutral-700 dark:text-neutral-300 flex items-start">
                    <span className="text-success mr-3 mt-1">✓</span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth Areas / Recommendations */}
            <div>
              <h3 className="font-bold text-neutral-900 dark:text-neutral-50 mb-3">
                {reportType === 'monthly' ? '📈 Growth Areas' : '📋 Recommendations'}
              </h3>
              <ul className="space-y-2">
                {(reportType === 'monthly' ? currentReport.growthAreas : currentReport.recommendations).map((item, idx) => (
                  <li key={idx} className="text-sm text-neutral-700 dark:text-neutral-300">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Competencies (Monthly Only) */}
          {reportType === 'monthly' && (
            <div className="card">
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-4">
                Competencies Achieved
              </h2>
              <div className="space-y-4">
                {currentReport.competenciesAchieved.map((comp) => (
                  <div key={comp.id} className="pb-4 border-b border-neutral-200 dark:border-neutral-700 last:border-0">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{comp.name}</h4>
                      <span className="text-sm font-semibold text-primary">
                        Level {comp.level}/{comp.targetLevel}
                      </span>
                    </div>
                    <div className="bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${comp.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card text-center py-12">
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Select a child to view their progress reports
          </p>
        </div>
      )}
    </div>
  );
}
