# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

-- File: database/01-query-logging.sql
-- Phase 3: Query logging and analysis setup
-- Run this on the PostgreSQL database to enable slow query logging

-- Enable slow query log (log queries taking > 100ms)
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Enable logging of DML statements (INSERT, UPDATE, DELETE)
ALTER SYSTEM SET log_statement = 'mod';

-- Enable connection logging
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;

-- Log lock waits
ALTER SYSTEM SET log_lock_waits = on;

-- Set logging format
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

-- Reload configuration
SELECT pg_reload_conf();

-- Create extension for query analysis (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Enable pg_stat_statements to track query statistics
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- View top slow queries (run after some time)
-- SELECT query, calls, total_time, mean_time, max_time
-- FROM pg_stat_statements
-- WHERE mean_time > 10
-- ORDER BY total_time DESC
-- LIMIT 20;

SHOW log_min_duration_statement;
SHOW log_statement;
SHOW log_connections;
