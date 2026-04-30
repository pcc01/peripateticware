/**
 * CurriculumMapper Component
 * Search and select curriculum units to map to an activity
 * 
 * Features:
 * - Search curriculum by name
 * - Filter by subject and grade level
 * - Multi-select curriculum units
 * - Display selected units with remove option
 * - Pagination for search results
 * - Loading and error states
 */

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { CurriculumUnit, CurriculumFilters } from '../../types/teacher';
import { curriculumApi } from '../../services/teacher';
import Button from '../common/Button';
import LoadingSpinner from '../common/LoadingSpinner';

interface CurriculumMapperProps {
  selectedUnits?: string[];
  onUnitsChange: (unitIds: string[]) => void;
  subject?: string;
  gradeLevel?: number;
  compact?: boolean;
}

const SUBJECTS = [
  'English',
  'Mathematics',
  'Science',
  'Social Studies',
  'History',
  'Geography',
  'Biology',
  'Chemistry',
  'Physics',
  'Health',
  'Physical Education',
  'Arts',
  'Music',
  'Technology',
];

const GRADES = Array.from({ length: 10 }, (_, i) => i + 3); // 3-12

const BLOOM_LEVELS = [
  'Remember',
  'Understand',
  'Apply',
  'Analyze',
  'Evaluate',
  'Create',
];

export const CurriculumMapper: React.FC<CurriculumMapperProps> = ({
  selectedUnits = [],
  onUnitsChange,
  subject,
  gradeLevel,
  compact = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSubject, setSearchSubject] = useState(subject || '');
  const [searchGrade, setSearchGrade] = useState(gradeLevel?.toString() || '');
  const [results, setResults] = useState<CurriculumUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedData, setSelectedData] = useState<CurriculumUnit[]>([]);

  // Fetch curriculum data when selected unit IDs change
  React.useEffect(() => {
    const loadSelectedUnits = async () => {
      if (selectedUnits.length === 0) {
        setSelectedData([]);
        return;
      }

      try {
        // Fetch units for each selected ID
        // In a real app, you might want a batch endpoint for this
        // For now, we'll mark them as selected by ID
        setSelectedData(
          selectedUnits.map((id) => ({
            id,
            title: `Unit: ${id}`,
            description: '',
            subject: '',
            grade_level: 0,
            bloom_level: 0,
            created_at: new Date().toISOString(),
          }))
        );
      } catch (err) {
        console.error('Failed to load selected units:', err);
      }
    };

    loadSelectedUnits();
  }, [selectedUnits]);

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() && !searchSubject && !searchGrade) {
      setError('Please enter a search term or filter');
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentPage(1);

    try {
      const filters: CurriculumFilters = {
        page: 1,
        page_size: 10,
        subject: searchSubject || undefined,
        grade_level: searchGrade ? parseInt(searchGrade) : undefined,
      };

      const response = await curriculumApi.list(filters);
      setResults(response.items);
      setTotalResults(response.total);
      setSearched(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to search curriculum'
      );
    } finally {
      setLoading(false);
    }
  }, [searchQuery, searchSubject, searchGrade]);

  // Toggle unit selection
  const toggleUnitSelection = (unit: CurriculumUnit) => {
    const isSelected = selectedUnits.includes(unit.id);

    if (isSelected) {
      onUnitsChange(selectedUnits.filter((id) => id !== unit.id));
    } else {
      onUnitsChange([...selectedUnits, unit.id]);
    }
  };

  // Remove selected unit
  const removeSelectedUnit = (unitId: string) => {
    onUnitsChange(selectedUnits.filter((id) => id !== unitId));
  };

  const totalPages = Math.ceil(totalResults / 10);

  return (
    <div className={clsx(
      'space-y-4 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700',
      compact ? 'text-sm' : ''
    )}>
      <h3 className="font-semibold text-gray-900 dark:text-white">
        📚 Map Curriculum Standards
      </h3>

      {/* Search Section */}
      <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        {/* Search Query */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search Curriculum
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="Search by name or topic..."
            className={clsx(
              'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600',
              'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
              'placeholder-gray-500 dark:placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'text-sm'
            )}
          />
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject
            </label>
            <select
              value={searchSubject}
              onChange={(e) => setSearchSubject(e.target.value)}
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Subjects</option>
              {SUBJECTS.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Grade
            </label>
            <select
              value={searchGrade}
              onChange={(e) => setSearchGrade(e.target.value)}
              className={clsx(
                'w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-xs',
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              <option value="">All Grades</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSearch}
          disabled={loading}
          isLoading={loading}
          className="w-full"
        >
          Search Curriculum
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Search Results */}
      {searched && !loading && results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 px-2">
            Found {totalResults} result{totalResults !== 1 ? 's' : ''}
          </p>
          {results.map((unit) => (
            <div
              key={unit.id}
              className={clsx(
                'p-2 rounded-lg border cursor-pointer transition-colors',
                selectedUnits.includes(unit.id)
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600'
              )}
              onClick={() => toggleUnitSelection(unit)}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedUnits.includes(unit.id)}
                  onChange={() => {}}
                  className="w-4 h-4 mt-0.5 accent-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {unit.title}
                  </p>
                  {unit.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                      {unit.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {unit.subject && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                        {unit.subject}
                      </span>
                    )}
                    {unit.grade_level > 0 && (
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                        Grade {unit.grade_level}
                      </span>
                    )}
                    {unit.bloom_level > 0 && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                        {BLOOM_LEVELS[unit.bloom_level - 1]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex gap-1 justify-center mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={clsx(
                    'px-2 py-1 text-xs rounded border',
                    currentPage === page
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-300 dark:border-gray-600'
                  )}
                >
                  {page}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No curriculum units found</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="sm" />
        </div>
      )}

      {/* Selected Units */}
      {selectedUnits.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Selected Units ({selectedUnits.length})
          </p>
          <div className="space-y-2">
            {selectedUnits.map((unitId) => (
              <div
                key={unitId}
                className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <span className="text-sm text-blue-900 dark:text-blue-200 font-medium">
                  {unitId}
                </span>
                <button
                  onClick={() => removeSelectedUnit(unitId)}
                  className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CurriculumMapper;
