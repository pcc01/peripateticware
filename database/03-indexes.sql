-- File: database/03-indexes.sql
-- Phase 3: Strategic Index Creation
-- These indexes optimize the top 5 slow queries and common access patterns

-- ============================================
-- 1. ACTIVITY TABLE INDEXES
-- ============================================

-- Index for filtering activities by teacher_id (very common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_teacher_id 
    ON activities(teacher_id) 
    WHERE deleted_at IS NULL;

-- Index for filtering activities by school_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_school_id 
    ON activities(school_id) 
    WHERE deleted_at IS NULL;

-- Index for sorting activities by creation time (most recent first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_created_at 
    ON activities(created_at DESC) 
    WHERE deleted_at IS NULL;

-- Composite index for common filter + sort pattern
-- Used when: GET /teachers/{id}/activities?sort=latest
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_teacher_created
    ON activities(teacher_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ============================================
-- 2. EVIDENCE TABLE INDEXES
-- ============================================

-- Index for filtering evidence by activity (very common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_activity_id 
    ON evidence(activity_id) 
    WHERE submitted_at IS NOT NULL;

-- Index for filtering evidence by student
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_student_id 
    ON evidence(student_id) 
    WHERE submitted_at IS NOT NULL;

-- Index for sorting evidence by creation time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_created_at 
    ON evidence(created_at DESC);

-- Composite index for activity + creation time pattern
-- Used when: GET /activities/{id}/evidence?sort=latest
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_activity_created
    ON evidence(activity_id, created_at DESC)
    WHERE submitted_at IS NOT NULL;

-- ============================================
-- 3. USER TABLE INDEXES
-- ============================================

-- Index for filtering users by school
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_school_id 
    ON users(school_id) 
    WHERE deleted_at IS NULL;

-- Index for email lookups (login, uniqueness checks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email 
    ON users(email) 
    WHERE deleted_at IS NULL;

-- Index for filtering teachers (role-based queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
    ON users(role)
    WHERE deleted_at IS NULL;

-- ============================================
-- 4. RELATIONSHIP TABLE INDEXES
-- ============================================

-- Index for finding all students of a teacher
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_teacher_teacher_id 
    ON student_teacher(teacher_id);

-- Index for finding all teachers of a student
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_teacher_student_id 
    ON student_teacher(student_id);

-- ============================================
-- STATISTICS
-- ============================================

-- Analyze the database to update query planner statistics
ANALYZE;

-- View created indexes
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;

-- ============================================
-- VERIFICATION QUERY
-- ============================================

-- Run this to verify all indexes were created:
-- SELECT 
--     indexname,
--     tablename,
--     indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename IN ('activities', 'evidence', 'users', 'student_teacher')
-- ORDER BY tablename, indexname;
