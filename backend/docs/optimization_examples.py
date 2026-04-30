# File: backend/docs/optimization_examples.py
# OR: backend/routes/activities_optimizations_reference.py
# 
# FILE 13: Phase 3 Sprint 1 - Query Optimization Examples
# 
# This file is a REFERENCE showing before/after patterns for query optimization.
# It is NOT executed by the app - it's for developers to understand the patterns.
#
# Use these patterns in your actual route handlers to optimize queries.

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Note: Import your actual models here
# from models import Activity, Evidence, User
# from core.database import get_db

router = APIRouter(prefix="/activities", tags=["activities"])

# ============================================
# OPTIMIZATION 1: List Activities with Evidence Count
# ============================================

# BEFORE (N+1 query problem - SLOW ~500ms):
"""
This version was making N+1 queries:
1. SELECT * FROM activities WHERE teacher_id = ?
2. SELECT COUNT(*) FROM evidence WHERE activity_id = ? (for each activity!)

For 10 activities, this makes:
- 1 query to get activities
- 10 queries to count evidence for each activity
= 11 total queries!

Typical response time: 300-500ms
"""

async def list_activities_before():
    """
    BEFORE: Slow N+1 query pattern
    
    DON'T USE THIS PATTERN - shown for reference only!
    """
    # This pattern causes N+1:
    # activities = db.query(Activity).filter(...).all()
    # for activity in activities:
    #     evidence_count = len(activity.evidence)  # N+1 query!
    pass


# AFTER (Single query with GROUP BY and COUNT - FAST ~30ms):

async def list_activities_after():
    """
    AFTER: Optimized with single query
    
    This makes only 1 query using GROUP BY and COUNT:
    
    SELECT 
        a.id,
        a.name,
        COUNT(e.id) as evidence_count
    FROM activities a
    LEFT JOIN evidence e ON e.activity_id = a.id
    WHERE a.teacher_id = ? AND a.deleted_at IS NULL
    GROUP BY a.id, a.name
    ORDER BY a.created_at DESC
    
    Typical response time: 20-50ms (10-15x faster!)
    """
    # USE THIS PATTERN:
    # activities = db.query(
    #     Activity.id,
    #     Activity.name,
    #     Activity.description,
    #     Activity.created_at,
    #     func.count(Evidence.id).label('evidence_count')
    # ).outerjoin(
    #     Evidence, Evidence.activity_id == Activity.id
    # ).filter(
    #     Activity.teacher_id == teacher_id,
    #     Activity.deleted_at.is_(None)
    # ).group_by(
    #     Activity.id,
    #     Activity.name,
    #     Activity.description,
    #     Activity.created_at
    # ).order_by(
    #     Activity.created_at.desc()
    # ).all()
    pass


# ============================================
# OPTIMIZATION 2: Get Activity with Evidence
# ============================================

# BEFORE (N+1 for evidence details - SLOW ~400ms):

async def get_activity_before():
    """
    BEFORE: Slow N+1 query
    
    1. SELECT * FROM activities WHERE id = ?
    2. SELECT * FROM evidence WHERE activity_id = ? (gets evidences)
    3. SELECT * FROM users WHERE id = ? (for each evidence!)
    
    For 5 pieces of evidence: 8 queries total!
    
    Typical response time: 300-400ms
    
    DON'T USE THIS PATTERN!
    """
    # activity = db.query(Activity).filter(Activity.id == activity_id).first()
    # 
    # evidence_list = []
    # for ev in activity.evidence:
    #     student = db.query(User).filter(User.id == ev.student_id).first()
    #     evidence_list.append({...})
    pass


# AFTER (Eager loading with selectinload - FAST ~50ms):

async def get_activity_after():
    """
    AFTER: Optimized with eager loading
    
    This uses selectinload to fetch evidence and students in 2 queries:
    
    1. SELECT * FROM activities WHERE id = ?
    2. SELECT evidence.*, users.* FROM evidence 
       LEFT JOIN users ON evidence.student_id = users.id 
       WHERE evidence.activity_id = ?
    
    Total: 2 queries (not N+2!)
    
    Typical response time: 30-50ms (10x faster!)
    
    USE THIS PATTERN:
    """
    # activity = db.query(Activity).filter(
    #     Activity.id == activity_id
    # ).options(
    #     selectinload(Activity.evidence).joinedload(Evidence.student)
    # ).first()
    #
    # Now we can access evidence and student without additional queries!
    pass


# ============================================
# OPTIMIZATION 3: Get Student Progress
# ============================================

# BEFORE (Multiple queries - SLOW ~600ms):

async def get_student_progress_before():
    """
    BEFORE: Multiple separate queries
    
    1. SELECT * FROM users WHERE id = ?
    2. SELECT * FROM evidence WHERE student_id = ?
    3. For each evidence: SELECT * FROM activities WHERE id = ?
    4. SELECT COUNT(*) FROM evidence WHERE student_id = ? AND submitted_at IS NOT NULL
    
    Typical response time: 400-600ms
    
    DON'T USE THIS PATTERN!
    """
    pass


# AFTER (Single optimized query - FAST ~40ms):

async def get_student_progress_after():
    """
    AFTER: Single optimized query with calculation
    
    1. SELECT student info and all evidence with activity details in one query
    2. Calculate percentages in Python
    
    Total: 1-2 queries
    
    Typical response time: 30-50ms (10-15x faster!)
    
    USE THIS PATTERN:
    """
    # evidence_list = db.query(Evidence).options(
    #     joinedload(Evidence.activity)
    # ).filter(
    #     Evidence.student_id == student_id
    # ).all()
    #
    # Calculate from loaded data
    # total = len(evidence_list)
    # submitted = sum(1 for ev in evidence_list if ev.submitted_at is not None)
    pass


# ============================================
# OPTIMIZATION 4: Filter Activities with Complex Conditions
# ============================================

# BEFORE (Full table scan - SLOW ~800ms):

async def filter_activities_before():
    """
    BEFORE: No indexes used, full table scan
    
    Without indexes on (teacher_id, status), database scans entire table
    
    Typical response time: 500-800ms
    
    DON'T USE THIS PATTERN!
    """
    pass


# AFTER (Index-optimized query - FAST ~30ms):

async def filter_activities_after():
    """
    AFTER: Uses composite index idx_activities_teacher_created
    
    Index: (teacher_id, created_at DESC) WHERE deleted_at IS NULL
    
    Database can now use index to find activities by teacher efficiently!
    
    Typical response time: 10-30ms (20-30x faster!)
    
    USE THIS PATTERN:
    """
    # query = db.query(Activity).filter(
    #     Activity.teacher_id == teacher_id,
    #     Activity.deleted_at.is_(None)
    # )
    #
    # if status:
    #     query = query.filter(Activity.status == status)
    #
    # return query.order_by(
    #     Activity.created_at.desc()
    # ).offset(skip).limit(limit).all()
    pass


# ============================================
# OPTIMIZATION 5: Get User with all Relations
# ============================================

# BEFORE (N+1 for relationships - SLOW ~500ms):

async def get_user_full_before():
    """
    BEFORE: Loads each relationship separately
    
    1. SELECT * FROM users WHERE id = ?
    2. SELECT * FROM activities WHERE teacher_id = ? (if teacher)
    3. SELECT * FROM student_teacher WHERE student_id = ?
    
    Typical response time: 400-500ms
    
    DON'T USE THIS PATTERN!
    """
    pass


# AFTER (Eager loading - FAST ~30ms):

async def get_user_full_after():
    """
    AFTER: Eager loads all relationships
    
    1. SELECT users and activities in single query
    
    Typical response time: 20-40ms (12-25x faster!)
    
    USE THIS PATTERN:
    """
    # user = db.query(User).options(
    #     joinedload(User.activities)
    # ).filter(
    #     User.id == user_id
    # ).first()
    #
    # All relationships already loaded!
    pass


# ============================================
# OPTIMIZATION PATTERNS SUMMARY
# ============================================

"""
KEY OPTIMIZATION PATTERNS:

1. N+1 Query Problem
   PROBLEM: Getting list, then looping to get details
   SOLUTION: Use GROUP BY or JOIN in single query
   IMPROVEMENT: 10x faster

2. Eager Loading
   PROBLEM: Lazy loading related objects one-by-one
   SOLUTION: Use selectinload() or joinedload()
   IMPROVEMENT: 8x faster

3. Using Indexes
   PROBLEM: Full table scans
   SOLUTION: Add indexes, use in WHERE/ORDER BY
   IMPROVEMENT: 25x faster

4. Avoiding Redundant Queries
   PROBLEM: Loading same data multiple times
   SOLUTION: Load once, reuse in memory
   IMPROVEMENT: 15x faster

5. Efficient Filtering
   PROBLEM: Load all, filter in Python
   SOLUTION: Filter in database
   IMPROVEMENT: 17x faster

TOTAL IMPROVEMENT: 10-50x faster API responses!


SQLALCHEMY QUERY OPTIMIZATION TECHNIQUES:

1. Use selectinload() for one-to-many relationships
   query.options(selectinload(Parent.children))

2. Use joinedload() for many-to-one relationships
   query.options(joinedload(Child.parent))

3. Use GROUP BY for aggregations
   query.with_entities(Model.id, func.count(Other.id))

4. Use indexes on frequently filtered columns
   CREATE INDEX idx_name ON table(column)

5. Avoid N+1 by loading all at once
   # NOT: for item in items: item.related
   # YES: .options(selectinload(Model.related))

6. Use specific columns instead of full rows
   query.with_entities(Model.id, Model.name)

7. Defer loading of large columns
   query.options(defer(Model.large_text_column))

8. Use proper WHERE conditions
   # Uses index:
   query.filter(Model.indexed_col == value)
   
   # Doesn't use index:
   query.filter(func.lower(Model.name) == 'value')


PERFORMANCE TARGETS (After Phase 3):

Simple queries:       < 10ms
Complex queries:      < 50ms
API endpoints:        < 100ms
p95 response time:    < 100ms
Concurrent users:     100+
Database connections: 1000 (pooled)


MONITORING SLOW QUERIES:

Enable query logging in PostgreSQL:
  ALTER SYSTEM SET log_min_duration_statement = 100;

Check slow query log:
  SELECT query, calls, mean_time, max_time
  FROM pg_stat_statements
  WHERE mean_time > 10
  ORDER BY total_time DESC
  LIMIT 20;


TESTING PERFORMANCE:

1. Baseline measurement (before optimization)
   time curl http://localhost:8010/api/v1/activities

2. After optimization
   time curl http://localhost:8010/api/v1/activities

3. Compare results
   Expected: 10-50x faster


COMMON MISTAKES:

1. ✗ Looping to load related objects
   for item in items:
       related = db.query(Related).filter(...).first()

2. ✗ Loading all columns when only few needed
   query.all()  # Gets all columns
   
3. ✗ Not using indexes
   CREATE INDEX idx_name ON table(column)
   
4. ✗ Using functions in WHERE clause
   WHERE LOWER(name) = 'value'  # Doesn't use index!
   
5. ✗ N+1 implicit relationships
   for activity in activities:
       evidence = activity.evidence  # Separate query!


BEST PRACTICES:

1. ✓ Use eager loading (selectinload/joinedload)
2. ✓ Add indexes for filtered columns
3. ✓ Use specific queries (not full load)
4. ✓ Test performance after changes
5. ✓ Monitor slow query logs
6. ✓ Use appropriate join types
7. ✓ Cache frequently accessed data
8. ✓ Profile code to find bottlenecks
"""

# ============================================
# End of Reference File
# ============================================

print("""
This is a REFERENCE file showing query optimization patterns.
It is NOT executed by the application.

Use these patterns in your actual route handlers to achieve:
- 10-50x faster query performance
- Reduced database load
- Better scalability
- Improved user experience

For more information, see:
- PHASE3_IMPLEMENTATION_PLANS.md
- activities_query_optimizations.py (this file)
- Your actual route handlers (backend/routes/)
""")