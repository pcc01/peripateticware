-- Initial database setup
-- Note: pgvector is pre-installed in the pgvector/pgvector:pg16 image
-- Tables will be created by the FastAPI application via SQLAlchemy
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";