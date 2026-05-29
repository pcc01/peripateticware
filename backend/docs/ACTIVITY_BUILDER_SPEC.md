# 🎯 Activity Builder Development Specification

**Date:** April 30, 2026  
**Priority:** HIGHEST - Core teacher feature  
**Timeline:** 2-3 weeks (MVP)  
**Developer:** Solo

---

## 📋 Overview

The Activity Builder allows teachers to:
1. Create learning activities (title, description, objectives, location triggers)
2. Organize activities into projects
3. Map activities to curriculum units
4. Manage activity lifecycle (create, read, update, delete)
5. Monitor student engagement with activities

---

## 🗄️ Database Schema

### New Models to Add

#### 1. Activity Model
```python
class Activity(Base):
    __tablename__ = "activities"
    
    id = UUID (primary key)
    teacher_id = UUID (FK → users)
    
    # Basic Info
    title = String(255) - indexed
    description = Text
    learning_objectives = JSONB - list of objectives
    
    # Location Trigger
    location_latitude = Float
    location_longitude = Float
    location_radius_meters = Integer (default 100)
    location_name = String(255)
    
    # Metadata
    grade_level = Integer (3-12)
    subject = String(100) - indexed
    difficulty_level = Integer (1-5)
    estimated_duration_minutes = Integer
    
    # Materials/Resources
    materials_needed = JSONB - list of materials
    resources = JSONB - URLs, references, etc.
    
    # Curriculum Mapping
    curriculum_unit_ids = ARRAY(UUID) - links to CurriculumUnit
    bloom_level = Integer (1-6)
    
    # Activity Type
    activity_type = Enum (inquiry, discussion, hands-on, virtual, hybrid)
    
    # Status & Visibility
    status = Enum (draft, published, archived)
    is_active = Boolean
    is_shareable = Boolean (can other teachers use)
    
    # Metadata
    view_count = Integer (for popularity)
    created_at = DateTime
    updated_at = DateTime
    published_at = DateTime (nullable)
    
    # Relationships
    teacher = relationship("User")
    projects = relationship("Project", secondary="project_activities")
    sessions = relationship("LearningSession", back_populates="activity")
```

#### 2. Project Model
```python
class Project(Base):
    __tablename__ = "projects"
    
    id = UUID (primary key)
    teacher_id = UUID (FK → users)
    
    # Basic Info
    title = String(255) - indexed
    description = Text
    
    # Scope
    grade_level = Integer
    subject = String(100) - indexed
    duration_weeks = Integer
    
    # Organization
    activities = relationship("Activity", secondary="project_activities")
    
    # Status
    status = Enum (planning, active, completed, archived)
    start_date = DateTime
    end_date = DateTime (nullable)
    
    # Metadata
    created_at = DateTime
    updated_at = DateTime
```

#### 3. ProjectActivity Association Table
```python
class ProjectActivity(Base):
    __tablename__ = "project_activities"
    
    id = UUID (primary key)
    project_id = UUID (FK)
    activity_id = UUID (FK)
    order = Integer - for sequencing within project
    created_at = DateTime
```

#### 4. ActivitySession Association
Add to existing LearningSession:
```python
activity_id = UUID (FK → Activity) - nullable
# Relationship
activity = relationship("Activity", back_populates="sessions")
```

---

## 🔌 API Endpoints

### Activity Endpoints

```
POST   /api/v1/teacher/activities
  Create new activity
  Auth: Teacher role required
  Request: ActivityCreate schema
  Response: Activity (201)

GET    /api/v1/teacher/activities
  List all activities for teacher
  Auth: Teacher role required
  Query params: ?status=published&subject=math&page=1&limit=20
  Response: PaginatedResponse[Activity]

GET    /api/v1/teacher/activities/{id}
  Get activity detail
  Auth: Teacher role required
  Response: Activity (200)

PUT    /api/v1/teacher/activities/{id}
  Update activity
  Auth: Teacher role required (owner only)
  Request: ActivityUpdate schema
  Response: Activity (200)

DELETE /api/v1/teacher/activities/{id}
  Delete activity
  Auth: Teacher role required (owner only)
  Response: 204 No Content

POST   /api/v1/teacher/activities/{id}/publish
  Publish activity (move from draft to published)
  Auth: Teacher role required
  Response: Activity (200)

POST   /api/v1/teacher/activities/{id}/archive
  Archive activity
  Auth: Teacher role required
  Response: Activity (200)
```

### Project Endpoints

```
POST   /api/v1/teacher/projects
  Create new project
  Auth: Teacher role required
  Request: ProjectCreate schema
  Response: Project (201)

GET    /api/v1/teacher/projects
  List all projects for teacher
  Auth: Teacher role required
  Query params: ?status=active&page=1&limit=20
  Response: PaginatedResponse[Project]

GET    /api/v1/teacher/projects/{id}
  Get project detail with activities
  Auth: Teacher role required
  Response: Project (200)

PUT    /api/v1/teacher/projects/{id}
  Update project
  Auth: Teacher role required
  Request: ProjectUpdate schema
  Response: Project (200)

DELETE /api/v1/teacher/projects/{id}
  Delete project (also unlinks activities)
  Auth: Teacher role required
  Response: 204 No Content

POST   /api/v1/teacher/projects/{id}/activities
  Add activity to project
  Auth: Teacher role required
  Request: { activity_id: UUID, order: int }
  Response: Project (200)

DELETE /api/v1/teacher/projects/{id}/activities/{activity_id}
  Remove activity from project
  Auth: Teacher role required
  Response: 204 No Content

PUT    /api/v1/teacher/projects/{id}/reorder
  Reorder activities in project
  Auth: Teacher role required
  Request: { activities: [{ id: UUID, order: int }, ...] }
  Response: Project (200)
```

### Curriculum Endpoints (for mapping)

```
GET    /api/v1/curriculum/units
  List curriculum units for mapping
  Query params: ?subject=math&grade_level=8&page=1&limit=50
  Response: PaginatedResponse[CurriculumUnit]
```

---

## 📦 Pydantic Schemas

### Activity Schemas

```python
class ActivityBase(BaseModel):
    title: str (min 3, max 255)
    description: str
    location_latitude: float
    location_longitude: float
    location_radius_meters: int = 100
    location_name: str
    grade_level: int (3-12)
    subject: str
    difficulty_level: int (1-5)
    estimated_duration_minutes: int
    materials_needed: list[str] = []
    resources: list[dict] = []
    learning_objectives: list[str]
    curriculum_unit_ids: list[UUID] = []
    bloom_level: int (1-6)
    activity_type: ActivityType enum
    is_shareable: bool = False

class ActivityCreate(ActivityBase):
    pass

class ActivityUpdate(BaseModel):
    title: Optional[str]
    description: Optional[str]
    location_latitude: Optional[float]
    location_longitude: Optional[float]
    location_radius_meters: Optional[int]
    location_name: Optional[str]
    grade_level: Optional[int]
    subject: Optional[str]
    difficulty_level: Optional[int]
    estimated_duration_minutes: Optional[int]
    materials_needed: Optional[list[str]]
    resources: Optional[list[dict]]
    learning_objectives: Optional[list[str]]
    curriculum_unit_ids: Optional[list[UUID]]
    bloom_level: Optional[int]
    activity_type: Optional[ActivityType]
    is_shareable: Optional[bool]

class ActivityResponse(ActivityBase):
    id: UUID
    teacher_id: UUID
    status: str
    is_active: bool
    view_count: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
```

### Project Schemas

```python
class ProjectBase(BaseModel):
    title: str (min 3, max 255)
    description: str
    grade_level: int
    subject: str
    duration_weeks: int
    start_date: datetime
    end_date: Optional[datetime]

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    title: Optional[str]
    description: Optional[str]
    grade_level: Optional[int]
    subject: Optional[str]
    duration_weeks: Optional[int]
    start_date: Optional[datetime]
    end_date: Optional[datetime]

class ProjectResponse(ProjectBase):
    id: UUID
    teacher_id: UUID
    status: str
    activities: list[ActivityResponse]
    created_at: datetime
    updated_at: datetime
```

---

## 🎨 Frontend Components

### Pages

1. **TeacherDashboardPage**
   - Overview of activities & projects
   - Quick stats (# activities, # projects)
   - Recent activities
   - Navigation to builder

2. **ActivityBuilderPage**
   - Main activity creation/editing form
   - Located at `/teacher/activities/new` or `/teacher/activities/{id}/edit`
   - Side panel with preview
   - Curriculum mapping sidebar

3. **ActivityListPage**
   - Browse all activities
   - Filter by: status, subject, grade level, difficulty
   - Sort by: created, updated, popularity
   - Cards showing activity preview
   - Bulk actions (archive, delete)

4. **ProjectsPage**
   - List of projects
   - Create/edit project
   - View activities in project
   - Drag-drop to reorder activities

### Components

1. **ActivityBuilder.tsx**
   - Form with sections:
     - Basic Info (title, description)
     - Location Setup (map picker + radius)
     - Learning Objectives
     - Curriculum Mapping
     - Metadata (grade, subject, difficulty, duration)
     - Materials & Resources
     - Activity Type selection
   - Auto-save to draft

2. **ActivityPreview.tsx**
   - Shows activity as it appears to students
   - Real-time preview as teacher types
   - Location map preview

3. **CurriculumMapper.tsx**
   - Search curriculum units
   - Multi-select for mapping
   - Shows mapped units with X to remove

4. **ActivityList.tsx**
   - Grid/list view toggle
   - Filter sidebar
   - Search bar
   - Pagination

5. **ProjectBuilder.tsx**
   - Create/edit project form
   - Activity selector
   - Drag-drop reordering
   - Preview project timeline

6. **LocationPicker.tsx**
   - Map component (Mapbox/Leaflet)
   - Search location by address
   - Radius adjustment slider
   - Preview trigger zone

---

## 🧪 Test Plan

### Backend Tests

1. **Activity CRUD**
   - Create activity (valid, invalid)
   - Read activity (by ID, list with filters)
   - Update activity (partial, full)
   - Delete activity
   - Authorization (owner only)

2. **Project CRUD**
   - Create project
   - Add/remove activities
   - Reorder activities
   - Delete project (cascading)

3. **Activity-Project Association**
   - Link activity to project
   - Activity appears in project
   - Unlink activity (activity remains, just removed from project)
   - Reorder activities in project

4. **Curriculum Mapping**
   - Link curriculum units to activity
   - Filter activities by curriculum
   - Update curriculum links

5. **Validation**
   - Location radius > 0
   - Bloom level 1-6
   - Difficulty 1-5
   - Duration > 0
   - Title/description not empty
   - Teacher ownership

### Frontend Tests (Vitest)

1. **Activity Builder Form**
   - Form renders
   - Input validation
   - Auto-save functionality
   - File upload (future)

2. **Location Picker**
   - Map loads
   - Address search works
   - Radius adjustment

3. **Curriculum Mapper**
   - Search works
   - Selection works
   - Removal works

4. **Activity List**
   - Pagination works
   - Filtering works
   - Sorting works

---

## 📊 Data Validation Rules

### Activity
- Title: 3-255 characters, required
- Description: 10-5000 characters, required
- Location radius: 10-10000 meters
- Grade level: 3-12
- Difficulty: 1-5
- Duration: 5-480 minutes
- Bloom level: 1-6
- Activity type: inquiry, discussion, hands-on, virtual, hybrid
- Learning objectives: at least 1, max 10

### Project
- Title: 3-255 characters
- Description: 10-5000 characters
- Duration: 1-52 weeks
- Start date: must be today or future
- End date: must be after start date
- Activities: at least 1 to publish

---

## 🚀 Implementation Phases

### Phase 1: Database & Models (Today)
- [ ] Add Activity model to database.py
- [ ] Add Project model to database.py
- [ ] Add ProjectActivity association table
- [ ] Update LearningSession with activity_id
- [ ] Add enums (ActivityType, ActivityStatus)
- [ ] Create migration (Alembic)
- [ ] Export models in __init__.py

### Phase 2: API Routes (Tomorrow)
- [ ] Create routes/activities.py
- [ ] Create routes/projects.py
- [ ] Implement all 11 endpoints
- [ ] Add request/response schemas
- [ ] Add authorization checks (teacher only)
- [ ] Add pagination
- [ ] Add filtering/sorting
- [ ] Test all endpoints

### Phase 3: Frontend Components (Day 3-4)
- [ ] Create pages/TeacherActivityPage.tsx
- [ ] Create components/ActivityBuilder.tsx
- [ ] Create components/ActivityList.tsx
- [ ] Create components/CurriculumMapper.tsx
- [ ] Create components/LocationPicker.tsx
- [ ] Wire up API calls with hooks
- [ ] Add form validation

### Phase 4: Testing & Polish (Day 5)
- [ ] Backend unit tests (pytest)
- [ ] Frontend component tests (vitest)
- [ ] Integration testing
- [ ] Error handling
- [ ] Loading states
- [ ] Edge cases

### Phase 5: Project Mapping (Week 2)
- [ ] Build project CRUD
- [ ] Activity-project linking
- [ ] Reordering functionality
- [ ] Project dashboard

---

## 🎯 Success Criteria

- ✅ Teachers can create activities
- ✅ Activities saved to database
- ✅ Activities appear in list with filtering
- ✅ Teachers can edit/delete own activities
- ✅ Curriculum mapping works
- ✅ Location triggers saved correctly
- ✅ All 11 API endpoints working
- ✅ 95%+ test coverage
- ✅ Smooth, responsive UI
- ✅ No console errors

---

## 🔧 Tech Stack

**Backend:**
- FastAPI
- SQLAlchemy ORM
- PostgreSQL
- Pydantic for validation
- pytest for testing

**Frontend:**
- React 18
- Vite
- TypeScript
- Tailwind CSS
- Zustand (state)
- React Query (data fetching)
- Vitest (testing)
- Leaflet or Mapbox (maps)

---

## 📝 Dependencies to Add

**Python:**
```
alembic  # Database migrations
```

**NPM (Frontend):**
```
leaflet              # Maps
react-leaflet        # React wrapper
react-hook-form      # Form handling
zod                  # Schema validation
```

---

## 🚦 Ready to Build!

Phase 1 starts immediately. Follow the phases in order.
