// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * CSV Batch Import Utilities
 * Parses and validates CSV files for bulk activity import
 * Supports both CSV and JSON formats
 */

import { ActivityCreateRequest } from '@types/session'

export interface ImportRow {
  name: string
  latitude: string | number
  longitude: string | number
  location_name: string
  difficulty: 'easy' | 'medium' | 'hard'
  duration_minutes: string | number
  objectives: string // comma-separated
  instructions: string
  resources?: string // comma-separated
  tags?: string // comma-separated
}

export interface ImportResult {
  valid: ActivityCreateRequest[]
  errors: Array<{
    rowIndex: number
    row: Partial<ImportRow>
    errors: string[]
  }>
  summary: {
    total: number
    valid: number
    invalid: number
  }
}

/**
 * Parse CSV file (simple implementation without external library)
 */
export function parseCSV(content: string): ImportRow[] {
  const lines = content.split('\n').filter((line) => line.trim())
  if (lines.length < 2) {
    throw new Error('CSV must have header row and at least one data row')
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim())
  const rows: ImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: Record<string, any> = {}

    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() || ''
    })

    if (Object.values(row).some((val) => val)) {
      rows.push(row as ImportRow)
    }
  }

  return rows
}

/**
 * Simple CSV line parser (handles quoted values)
 */
function parseCSVLine(line: string): string[] {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/**
 * Parse JSON array of activities
 */
export function parseJSON(content: string): ImportRow[] {
  try {
    const data = JSON.parse(content)
    if (!Array.isArray(data)) {
      throw new Error('JSON must be an array of activities')
    }
    return data
  } catch (error: any) {
    throw new Error(`Invalid JSON: ${error.message}`)
  }
}

/**
 * Validate a single activity row
 */
export function validateRow(row: ImportRow, rowIndex: number): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!row.name || typeof row.name !== 'string' || !row.name.trim()) {
    errors.push('Activity name is required')
  }

  const lat = parseFloat(String(row.latitude))
  const lng = parseFloat(String(row.longitude))

  if (isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('Invalid latitude (must be between -90 and 90)')
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    errors.push('Invalid longitude (must be between -180 and 180)')
  }

  if (!row.location_name || !String(row.location_name).trim()) {
    errors.push('Location name is required')
  }

  if (!['easy', 'medium', 'hard'].includes(String(row.difficulty).toLowerCase())) {
    errors.push('Difficulty must be: easy, medium, or hard')
  }

  const duration = parseInt(String(row.duration_minutes))
  if (isNaN(duration) || duration <= 0 || duration > 480) {
    errors.push('Duration must be between 1 and 480 minutes')
  }

  if (!row.instructions || !String(row.instructions).trim()) {
    errors.push('Instructions are required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Convert validated row to ActivityCreateRequest
 */
export function rowToActivity(
  row: ImportRow,
  curriculumId: string
): ActivityCreateRequest {
  const objectives = String(row.objectives || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const resources = String(row.resources || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)

  const tags = String(row.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const radius = 100 // Default 100 meters

  return {
    name: row.name.trim(),
    curriculum_id: curriculumId,
    latitude: parseFloat(String(row.latitude)),
    longitude: parseFloat(String(row.longitude)),
    location_name: row.location_name.trim(),
    zone: {
      id: `zone-${Date.now()}-${Math.random()}`,
      name: `Zone for ${row.name}`,
      location: {
        latitude: parseFloat(String(row.latitude)),
        longitude: parseFloat(String(row.longitude)),
        name: row.location_name.trim(),
      },
      shape: 'circle',
      radius,
    },
    difficulty: String(row.difficulty).toLowerCase() as 'easy' | 'medium' | 'hard',
    duration_minutes: parseInt(String(row.duration_minutes)),
    objectives,
    instructions: row.instructions.trim(),
    resources,
    tags,
  }
}

/**
 * Validate and convert entire import file
 */
export function validateImport(rows: ImportRow[], curriculumId: string): ImportResult {
  const valid: ActivityCreateRequest[] = []
  const errors: ImportResult['errors'] = []

  rows.forEach((row, idx) => {
    const validation = validateRow(row, idx)

    if (validation.valid) {
      try {
        valid.push(rowToActivity(row, curriculumId))
      } catch (error: any) {
        errors.push({
          rowIndex: idx,
          row,
          errors: [error.message],
        })
      }
    } else {
      errors.push({
        rowIndex: idx,
        row,
        errors: validation.errors,
      })
    }
  })

  return {
    valid,
    errors,
    summary: {
      total: rows.length,
      valid: valid.length,
      invalid: errors.length,
    },
  }
}

/**
 * Generate CSV template with example data
 */
export function generateCSVTemplate(): string {
  const headers = [
    'name',
    'latitude',
    'longitude',
    'location_name',
    'difficulty',
    'duration_minutes',
    'objectives',
    'instructions',
    'resources',
    'tags',
  ]

  const examples = [
    [
      'Park Scavenger Hunt',
      '40.7128',
      '-74.0060',
      'Central Park NYC',
      'medium',
      '45',
      'Observation skills, Classification',
      'Find and photograph 5 different plant species',
      'Plant identification guide',
      'nature,observation',
    ],
    [
      'Water Quality Testing',
      '40.7489',
      '-73.9680',
      'Hudson River',
      'hard',
      '60',
      'Scientific measurement, Analysis',
      'Test water samples and record pH, temperature',
      'Testing kit, Lab notebook',
      'science,environment',
    ],
  ]

  const lines = [headers.join(','), ...examples.map((row) => row.join(','))]
  return lines.join('\n')
}

export const BatchImport = {
  parseCSV,
  parseJSON,
  validateRow,
  rowToActivity,
  validateImport,
  generateCSVTemplate,
}

export default BatchImport

