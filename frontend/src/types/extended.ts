export interface SessionContext { sessionId: string; session_id?: string; activity_name?: string; learning_objectives: any[]; competencies: any[]; }
export interface CaptureFormData { file: File; title: string; description?: string; capture_type: string; learning_objectives: string[]; competencies: string[]; }
export type ReflectionType = 'freeform' | 'guided' | 'evidence';