# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

-- Initial database setup
-- Note: pgvector is pre-installed in the pgvector/pgvector:pg16 image
-- Tables will be created by the FastAPI application via SQLAlchemy
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";