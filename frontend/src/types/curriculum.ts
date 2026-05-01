# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

export interface CurriculumUnit {
  curriculum_id: string
  title: string
  description: string
  subject: string
  grade_level: number
  bloom_level: number
  marzano_level: number
  standards?: string[]
  content?: {
    sections: string[]
    [key: string]: any
  }
  created_by: string
  created_at: string
  updated_at: string
}

export interface CurriculumCreateRequest {
  title: string
  description: string
  subject: string
  grade_level: number
  bloom_level: number
  marzano_level: number
  standards?: string[]
  content?: {
    sections: string[]
    [key: string]: any
  }
}

export interface CurriculumUpdateRequest {
  title?: string
  description?: string
  subject?: string
  grade_level?: number
  bloom_level?: number
  marzano_level?: number
  standards?: string[]
  content?: {
    sections: string[]
    [key: string]: any
  }
}

export interface StandardsAlignment {
  curriculum_id: string
  title: string
  bloom: {
    level: number
    description: string
  }
  marzano: {
    level: number
    description: string
  }
}
