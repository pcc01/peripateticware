# Peripateticware Frontend - API Integration Guide

## Overview

The frontend communicates with a FastAPI backend via REST API and WebSockets for real-time features. All API calls are typed with TypeScript and wrapped in service classes for easy use.

---

## API Services

### Authentication Service

```typescript
import { useAuth } from '@hooks/useAuth'

const { login, register, logout, user } = useAuth()

// Login
await login({ email: 'student@school.edu', password: 'password' })

// Register
await register({
  email: 'teacher@school.edu',
  username: 'teacher123',
  password: 'password',
  full_name: 'Jane Smith',
  role: 'teacher'
})

// Logout
logout()
```

### Curriculum Service

```typescript
import curriculumService from '@services/curriculumService'

// List units
const units = await curriculumService.listUnits('Biology', 10)

// Create unit
const unit = await curriculumService.createUnit({
  title: 'Photosynthesis',
  description: 'Energy conversion in plants',
  subject: 'Biology',
  grade_level: 10,
  bloom_level: 4,
  marzano_level: 2,
  standards: ['NGSS-PS1-3']
})

// Get unit details
const unit = await curriculumService.getUnit('unit-123')

// Update unit
const updated = await curriculumService.updateUnit('unit-123', {
  description: 'Updated description'
})

// Get standards alignment
const alignment = await curriculumService.getStandardsAlignment('unit-123')
```

### Session Service

```typescript
import sessionService from '@services/sessionService'

// Create session
const session = await sessionService.createSession({
  title: 'Park Learning Walk',
  curriculum_id: 'unit-123',
  latitude: 40.7128,
  longitude: -74.0060,
  location_name: 'Central Park'
})

// Get session
const session = await sessionService.getSession('session-123')

// List user sessions
const sessions = await sessionService.listSessions()

// Update session (end, pause, etc.)
await sessionService.updateSession('session-123', {
  status: 'completed'
})

// Get evidence (privacy-filtered for role)
const evidence = await sessionService.getEvidence('session-123', userRole)

// Submit inquiry
const inquiry = await sessionService.submitInquiry('session-123', {
  timestamp: new Date().toISOString(),
  question: 'What is photosynthesis?',
  input_type: 'text'
})
```

### Inference Service (RAG & AI)

```typescript
import inferenceService from '@services/inferenceService'

// Process text inquiry with Socratic reasoning
const response = await inferenceService.processInquiry({
  session_id: 'session-123',
  input_type: 'text',
  text: 'How do plants make energy?',
  location: {
    latitude: 40.7128,
    longitude: -74.0060,
    location_name: 'Central Park'
  },
  curriculum_context: {
    topic: 'Photosynthesis',
    bloom_level: 4
  }
})

// Process multimodal input (image/audio)
const processed = await inferenceService.processMultimodal(
  'session-123',
  imageFile,
  'image'
)

// Retrieve relevant documents from RAG
const docs = await inferenceService.ragRetrieve(
  'photosynthesis and energy',
  10  // top_k
)

// Generate embeddings for semantic search
const embedding = await inferenceService.generateTextEmbedding(
  'What are the steps of the Calvin Cycle?'
)
```

---

## Privacy Filtering

All API responses are automatically filtered based on user role:

```typescript
import { Privacy } from '@utils/privacy'

// For teachers - returns full competency assessment
const evidence = await sessionService.getEvidence(sessionId, 'teacher')
// Contains: competency_assessment, original_ai_draft

// For students - returns only safe data
const evidence = await sessionService.getEvidence(sessionId, 'student')
// Strips: competency_assessment, original_ai_draft

// Manually filter evidence
const filtered = Privacy.filterEvidenceByRole(evidence, userRole)

// Check permissions
if (Privacy.canViewCompetencyAssessment(userRole)) {
  // Show competency analysis
}
```

---

## Real-Time Updates (WebSocket)

```typescript
import { useSessionWebSocket, useStudentLocations } from '@hooks/useSessionWebSocket'

// Subscribe to all events
const wsState = useSessionWebSocket('session-123')

// Track student locations in real-time
const studentLocations = useStudentLocations('session-123')
// Returns: { [studentId]: { latitude, longitude, accuracy, timestamp } }

// Track inquiry submissions
const inquiries = useInquiryUpdates('session-123')
```

**Expected WebSocket Events:**

```json
{
  "type": "location_update",
  "session_id": "session-123",
  "timestamp": "2024-04-25T10:30:00Z",
  "data": {
    "student_id": "student-456",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10.5
  }
}

{
  "type": "inquiry_submitted",
  "session_id": "session-123",
  "timestamp": "2024-04-25T10:31:00Z",
  "data": {
    "inquiry_id": "inq-789",
    "student_id": "student-456",
    "question": "What is photosynthesis?",
    "input_type": "text"
  }
}

{
  "type": "session_ended",
  "session_id": "session-123",
  "timestamp": "2024-04-25T11:30:00Z",
  "data": {
    "duration_minutes": 60,
    "total_inquiries": 12,
    "average_engagement": 8.5
  }
}
```

---

## Error Handling

All API calls are typed and should be wrapped in try/catch:

```typescript
try {
  const response = await curriculumService.createUnit(data)
} catch (error: any) {
  const message = error.response?.data?.detail || error.message
  console.error('Failed to create unit:', message)
}
```

Common error codes:
- `401` - Unauthorized (token expired, use `logout()`)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `422` - Validation error (check field names)
- `500` - Server error

---

## Batch Import

```typescript
import { BatchImport } from '@utils/batchImport'

// Parse CSV file
const csv = await file.text()
const rows = BatchImport.parseCSV(csv)

// Validate all rows
const result = BatchImport.validateImport(rows, curriculumId)

// result.valid contains ActivityCreateRequest[] ready to send
// result.errors contains validation failures with details

// Generate CSV template for users to download
const template = BatchImport.generateCSVTemplate()
```

---

## Authentication Flow

### Login Flow

```
1. User enters email/password
2. Frontend: POST /auth/login
3. Backend: Returns access_token + expires_in
4. Frontend: Stores token in localStorage/sessionStorage
5. Frontend: Redirects to dashboard
```

### Token Management

```typescript
// Interceptor automatically adds token to requests
headers: { Authorization: `Bearer ${token}` }

// When token expires (401 response):
1. Clear localStorage: removeItem('auth_token')
2. Clear user data: removeItem('user')
3. Redirect to /login
```

### Student Roster (Teacher Only)

```python
# Backend should support:
POST   /students              → Bulk import students
GET    /students              → List students
GET    /students/{id}         → Get student details
POST   /students/{id}/classes → Enroll in class
DELETE /students/{id}         → Remove student
```

---

## Rate Limiting

Expected rate limits (backend should implement):

```
- Authentication: 5 requests/minute
- API calls: 100 requests/minute per user
- WebSocket: Continuous (with heartbeat)
- File uploads: 10 files/minute, max 50MB each
```

---

## Compliance & Privacy

### FERPA Compliance

- Student data never exposed to other students
- Parent data only sent to authorized parents
- Teacher views filtered based on role
- Audit log sanitizes PII

### COPPA Compliance (Under-13)

```typescript
const classified = classifyUser(user, coppaApplies: true)
// Removes email from display data
// Tracks age appropriateness
```

### GDPR Compliance (EU)

```typescript
const profile = Privacy.getComplianceProfile('EU')
// Data residency: eu-west-1
// Retention: 3 years
// Right to be forgotten supported
```

---

## Testing API Integration

```bash
# Mock API responses in tests
import { vi } from 'vitest'
import * as curriculumService from '@services/curriculumService'

vi.mock('@services/curriculumService', () => ({
  default: {
    listUnits: vi.fn().mockResolvedValue([
      { curriculum_id: '123', title: 'Test Unit' }
    ])
  }
}))
```

---

## Environment Variables

```env
# API Configuration
VITE_API_URL=http://localhost:8010/api/v1
VITE_WEBSOCKET_URL=ws://localhost:8010/api/v1

# Feature Flags
VITE_ENABLE_PRIVACY_ENGINE=true
VITE_ENABLE_BATCH_IMPORT=true
VITE_ENABLE_REAL_TIME_MONITORING=true
```

---

**API Version:** 1.0  
**Last Updated:** 2024-04-25
