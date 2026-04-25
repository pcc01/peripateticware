/**
 * App-wide constants
 * Separated from code for easy maintenance and internationalization
 */

// User roles
export enum UserRole {
  STUDENT = 'student',
  TEACHER = 'teacher',
  PARENT = 'parent',
  ADMIN = 'admin',
}

// Session statuses
export enum SessionStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Bloom's Taxonomy Levels (Anderson & Krathwohl, 2001)
export const BLOOM_LEVELS = {
  1: { name: 'Remember', description: 'Recall facts and basic concepts' },
  2: { name: 'Understand', description: 'Explain ideas or concepts' },
  3: { name: 'Apply', description: 'Use information in new situations' },
  4: { name: 'Analyze', description: 'Draw connections among ideas' },
  5: { name: 'Evaluate', description: 'Justify a decision or choice' },
  6: { name: 'Create', description: 'Produce new or original work' },
} as const

// Marzano's Framework Levels
export const MARZANO_LEVELS = {
  1: { name: 'Retrieval', description: 'Recall and recognize information' },
  2: { name: 'Comprehension', description: 'Understand and organize information' },
  3: { name: 'Analysis', description: 'Analyze, compare, and categorize' },
  4: { name: 'Knowledge Utilization', description: 'Apply and make decisions' },
} as const

// Activity difficulty levels
export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

// Subjects
export const SUBJECTS = [
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'Literature',
  'History',
  'Geography',
  'Ecology',
]

// Grade levels
export const GRADE_LEVELS = {
  9: 'Grade 9',
  10: 'Grade 10',
  11: 'Grade 11',
  12: 'Grade 12',
}

// Map config for Leaflet
export const MAP_CONFIG = {
  DEFAULT_CENTER: [40.7128, -74.0060] as [number, number], // NYC as default
  DEFAULT_ZOOM: 13,
  MIN_ZOOM: 10,
  MAX_ZOOM: 18,
  ATTRIBUTION:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

// Activity zone shapes (pre-defined)
export enum ZoneShape {
  CIRCLE = 'circle',
  RECTANGLE = 'rectangle',
  POLYGON = 'polygon',
}

// Geolocation config
export const GEOLOCATION_CONFIG = {
  TIMEOUT: 10000, // 10 seconds
  ENABLE_HIGH_ACCURACY: true,
  MAX_AGE: 300000, // 5 minutes cache
}

// Input types for inquiry
export enum InputType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
}

// Feature flags
export const FEATURES = {
  PRIVACY_ENGINE: true, // Teacher-only competency assessment
  AI_ARTIFACT_RETENTION: true, // Store original AI responses
  BATCH_IMPORT: true, // CSV/JSON import for activities
  REAL_TIME_MONITORING: true, // Teacher session monitoring
}

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
}

// Cache durations (in milliseconds)
export const CACHE_DURATION = {
  CURRICULUM: 1000 * 60 * 60, // 1 hour
  SESSIONS: 1000 * 60 * 5, // 5 minutes
  USER_PROFILE: 1000 * 60 * 60, // 1 hour
}

// Accessibility
export const WCAG_LEVEL = 'AAA' as const
