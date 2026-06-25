// src/utils/batchImport.ts
// Utility functions for batch importing activities/curriculum from CSV or JSON

export interface BatchImport {
  type: 'csv' | 'json'
  rows: Record<string, unknown>[]
  errors: string[]
  valid: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

export function parseJSON(text: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

export function validateImport(rows: Record<string, unknown>[], requiredFields: string[] = ['title']): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  rows.forEach((row, i) => {
    requiredFields.forEach(field => {
      if (!row[field]) errors.push(`Row ${i + 1}: missing required field "${field}"`)
    })
  })
  return { valid: errors.length === 0, errors, warnings }
}

export function generateCSVTemplate(fields: string[]): string {
  return fields.join(',') + '\n' + fields.map(() => '').join(',')
}

export const batchImport = { parseCSV, parseJSON, validateImport, generateCSVTemplate }
