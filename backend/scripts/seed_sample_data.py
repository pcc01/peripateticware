#!/usr/bin/env python3
"""
Seed sample data for Peripateticware development/demo.
Run with: docker compose exec backend python scripts/seed_sample_data.py
Safe to run multiple times (idempotent).
"""
import os
import sys
sys.path.insert(0, '/app')

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
).replace("postgresql+asyncpg://", "postgresql://").replace("+asyncpg", "")

engine = create_engine(DATABASE_URL, echo=False)

# bcrypt hash of "SecurePass123!" — matches .env.test TEST_STUDENT_PASSWORD
PW_HASH = "$2b$12$nVqpepgIpsqIYLr5JzOtZeV/HYj1ib6CGtweKasJ4SN3sGQA0eBsG"

created = []
skipped = []


def upsert_user(conn, email, username, first_name, last_name, role):
    exists = conn.execute(
        text("SELECT id FROM users WHERE email = :e"), {"e": email}
    ).fetchone()
    if exists:
        skipped.append(f"user:{email}")
        return str(exists[0])
    row = conn.execute(
        text("""
            INSERT INTO users (email, username, first_name, last_name, full_name,
                               hashed_password, role, is_active)
            VALUES (:email, :uname, :fn, :ln, :full, :pw, :role, TRUE)
            RETURNING id
        """),
        {
            "email": email, "uname": username, "fn": first_name,
            "ln": last_name, "full": f"{first_name} {last_name}",
            "pw": PW_HASH, "role": role,
        }
    ).fetchone()
    created.append(f"user:{email}")
    return str(row[0])


def main():
    with engine.begin() as conn:
        # ── 1. Users ─────────────────────────────────────────────────────────
        teacher_id = upsert_user(conn, "teacher@example.com", "teacher", "Jane", "Smith", "TEACHER")
        student_id = upsert_user(conn, "student@example.com", "student", "Alex", "Johnson", "STUDENT")
        parent_id  = upsert_user(conn, "parent@example.com",  "parent",  "Margaret", "Brown", "PARENT")

        # ── 2. Organization ──────────────────────────────────────────────────
        org_row = conn.execute(text("SELECT id FROM organizations WHERE slug = 'demo-school'")).fetchone()
        if org_row:
            org_id = str(org_row[0])
            skipped.append("org:demo-school")
        else:
            org_id = str(conn.execute(text("""
                INSERT INTO organizations (slug, name, type, license_tier)
                VALUES ('demo-school', 'Demo School', 'school', 'free')
                RETURNING id
            """)).fetchone()[0])
            created.append("org:demo-school")

        # ── 3. Classroom ─────────────────────────────────────────────────────
        cls_row = conn.execute(
            text("SELECT id FROM classrooms WHERE name = 'Sample Field Science' AND teacher_id = :tid"),
            {"tid": teacher_id}
        ).fetchone()
        if cls_row:
            classroom_id = str(cls_row[0])
            skipped.append("classroom:Sample Field Science")
        else:
            classroom_id = str(conn.execute(text("""
                INSERT INTO classrooms (name, grade_level, subject, teacher_id, org_id, is_active)
                VALUES ('Sample Field Science', 5, 'Science', :tid, :oid, TRUE)
                RETURNING id
            """), {"tid": teacher_id, "oid": org_id}).fetchone()[0])
            created.append("classroom:Sample Field Science")

        # Enroll student
        existing_enroll = conn.execute(
            text("SELECT 1 FROM classroom_students WHERE classroom_id = :cid AND student_id = :sid"),
            {"cid": classroom_id, "sid": student_id}
        ).fetchone()
        if not existing_enroll:
            conn.execute(text("""
                INSERT INTO classroom_students (classroom_id, student_id)
                VALUES (:cid, :sid)
            """), {"cid": classroom_id, "sid": student_id})
            created.append("enrollment:student->classroom")
        else:
            skipped.append("enrollment:student->classroom")

        # ── 4. Activities ─────────────────────────────────────────────────────
        for act_title, lat, lon, subject in [
            ("Creek Habitat Study",   37.3382, -121.8863, "Science"),
            ("Neighbourhood Map Walk", 37.3361, -121.8900, "Geography"),
        ]:
            exists = conn.execute(
                text("SELECT id FROM activities WHERE title = :t AND teacher_id = :tid"),
                {"t": act_title, "tid": teacher_id}
            ).fetchone()
            if exists:
                activity_id = str(exists[0])
                skipped.append(f"activity:{act_title}")
            else:
                activity_id = str(conn.execute(text("""
                    INSERT INTO activities (
                        teacher_id, title, description, subject, grade_level,
                        activity_type, difficulty_level, estimated_duration_minutes,
                        bloom_level, location_name, location_latitude, location_longitude,
                        location_radius_meters, learning_objectives,
                        status, is_active, is_shareable, share_scope
                    ) VALUES (
                        :tid, :title,
                        'A sample outdoor learning activity for demonstration purposes.',
                        :subject, 5, 'inquiry', 2, 60, 3,
                        'Local field site', :lat, :lon, 200,
                        ARRAY['Observe and record field evidence', 'Apply scientific thinking'],
                        'published', TRUE, FALSE, 'org'
                    ) RETURNING id
                """), {
                    "tid": teacher_id, "title": act_title,
                    "subject": subject, "lat": lat, "lon": lon,
                }).fetchone()[0])
                created.append(f"activity:{act_title}")

        # ── 5. Learning sessions ──────────────────────────────────────────────
        for note in ["First session completed", "Second session completed"]:
            exists = conn.execute(
                text("SELECT 1 FROM learning_sessions WHERE student_id = :sid AND notes = :n"),
                {"sid": student_id, "n": note}
            ).fetchone()
            if not exists:
                conn.execute(text("""
                    INSERT INTO learning_sessions
                        (student_id, activity_id, classroom_id, status, notes, started_at, completed_at)
                    SELECT :sid,
                           (SELECT id FROM activities WHERE teacher_id = :tid LIMIT 1),
                           :cid, 'completed', :note, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
                """), {"sid": student_id, "tid": teacher_id, "cid": classroom_id, "note": note})
                created.append(f"learning_session:{note}")
            else:
                skipped.append(f"learning_session:{note}")

        # ── 6. Activity submission ────────────────────────────────────────────
        exists = conn.execute(
            text("SELECT 1 FROM activity_submissions WHERE student_id = :sid AND submission_status = 'submitted'"),
            {"sid": student_id}
        ).fetchone()
        if not exists:
            conn.execute(text("""
                INSERT INTO activity_submissions
                    (student_id, activity_id, submission_status, compiled_evidence, submitted_at)
                SELECT :sid,
                       (SELECT id FROM activities WHERE teacher_id = :tid LIMIT 1),
                       'submitted',
                       '{"photos": 3, "notes": 2, "observations": "Recorded 5 plant species"}'::jsonb,
                       NOW()
            """), {"sid": student_id, "tid": teacher_id})
            created.append("activity_submission:student")
        else:
            skipped.append("activity_submission:student")

        # ── 7. Parent-child link ──────────────────────────────────────────────
        exists = conn.execute(
            text("SELECT 1 FROM parent_child_links WHERE parent_id = :pid AND child_id = :cid"),
            {"pid": parent_id, "cid": student_id}
        ).fetchone()
        if not exists:
            conn.execute(text("""
                INSERT INTO parent_child_links (parent_id, child_id, relationship)
                VALUES (:pid, :cid, 'guardian')
            """), {"pid": parent_id, "cid": student_id})
            created.append("parent_child_link")
        else:
            skipped.append("parent_child_link")

        # ── 8. Standards set ─────────────────────────────────────────────────
        exists = conn.execute(
            text("SELECT 1 FROM standards_sets WHERE name = 'Sample Science Standards' AND owner_id = :tid"),
            {"tid": teacher_id}
        ).fetchone()
        if not exists:
            conn.execute(text("""
                INSERT INTO standards_sets
                    (name, description, type, owner_id, is_global, criteria,
                     processing_status)
                VALUES (
                    'Sample Science Standards',
                    'Sample standards set for demonstration and testing.',
                    'curriculum', :tid, FALSE,
                    '[
                        {"id": "SC.1", "code": "SC.1", "description": "Observe and describe properties of matter"},
                        {"id": "SC.2", "code": "SC.2", "description": "Identify living and non-living things in an ecosystem"},
                        {"id": "SC.3", "code": "SC.3", "description": "Record scientific observations using data tables"}
                    ]'::jsonb,
                    'complete'
                )
            """), {"tid": teacher_id})
            created.append("standards_set:Sample Science Standards")
        else:
            skipped.append("standards_set:Sample Science Standards")

        # ── 9. Challenge proposal ─────────────────────────────────────────────
        exists = conn.execute(
            text("SELECT 1 FROM student_proposals WHERE student_id = :sid AND title = 'Build a Bird Observation Station'"),
            {"sid": student_id}
        ).fetchone()
        if not exists:
            conn.execute(text("""
                INSERT INTO student_proposals
                    (student_id, teacher_id, title, description, location_name, subject, status)
                VALUES (
                    :sid, :tid,
                    'Build a Bird Observation Station',
                    'I want to set up a bird feeder and observation log in the schoolyard for two weeks.',
                    'Schoolyard', 'Science', 'pending'
                )
            """), {"sid": student_id, "tid": teacher_id})
            created.append("student_proposal:bird observation")
        else:
            skipped.append("student_proposal:bird observation")

        # ── 10. Calendar event (if table exists) ─────────────────────────────
        try:
            conn.execute(text("""
                INSERT INTO calendar_events (title, description, event_date, user_id, event_type)
                SELECT 'Creek Habitat Study Field Trip',
                       'Whole class field trip to the local creek habitat.',
                       NOW() + INTERVAL '7 days',
                       :tid, 'activity'
                WHERE NOT EXISTS (
                    SELECT 1 FROM calendar_events
                    WHERE title = 'Creek Habitat Study Field Trip' AND user_id = :tid
                )
            """), {"tid": teacher_id})
            created.append("calendar_event:field trip")
        except Exception:
            skipped.append("calendar_event:(table may not exist)")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== Seed Complete ===")
    print(f"Created  ({len(created)}): {', '.join(created) or 'none'}")
    print(f"Skipped  ({len(skipped)}): {', '.join(skipped) or 'none'}")
    print("All operations idempotent — safe to re-run.")


if __name__ == "__main__":
    main()
