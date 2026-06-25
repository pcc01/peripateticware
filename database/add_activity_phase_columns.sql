-- Migration: add student mobile phase content columns to activities
-- Run: docker exec -i pw-postgres-1 psql -U peripateticware_user -d peripateticware < database/add_activity_phase_columns.sql
-- Or:  docker compose exec postgres psql -U peripateticware_user -d peripateticware -f /docker-entrypoint-initdb.d/add_activity_phase_columns.sql

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS orient_phase  TEXT,
  ADD COLUMN IF NOT EXISTS inquiry_phase TEXT,
  ADD COLUMN IF NOT EXISTS reflect_phase TEXT;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'activities'
  AND column_name IN ('orient_phase', 'inquiry_phase', 'reflect_phase');
