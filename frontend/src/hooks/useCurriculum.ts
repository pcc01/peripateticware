# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

/**
 * useCurriculum Custom Hook
 * Provides curriculum search and management functionality
 */

import { useState, useCallback } from 'react';
import { CurriculumUnit, CurriculumFilters, PaginatedCurriculumResponse } from '../types/teacher';
import { curriculumApi } from '../services/teacher';

export const useCurriculum = () => {
  const [curriculum, setCurriculum] = useState<CurriculumUnit[]>([]);
  const [paginatedCurriculum, setPaginatedCurriculum] =
    useState<PaginatedCurriculumResponse | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<CurriculumUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search curriculum
  const search = useCallback(async (filters: CurriculumFilters) => {
    setLoading(true);
    setError(null);

    try {
      const response = await curriculumApi.list(filters);
      setCurriculum(response.items);
      setPaginatedCurriculum(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle unit selection
  const toggleUnit = useCallback((unit: CurriculumUnit) => {
    setSelectedUnits((prev) => {
      const isSelected = prev.some((u) => u.id === unit.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== unit.id);
      } else {
        return [...prev, unit];
      }
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedUnits([]);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    curriculum,
    paginatedCurriculum,
    selectedUnits,
    loading,
    error,

    // Actions
    search,
    toggleUnit,
    clearSelection,
    clearError,

    // Computed
    hasResults: curriculum.length > 0,
    selectedCount: selectedUnits.length,
  };
};

export default useCurriculum;
