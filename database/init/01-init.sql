-- Copyright (c) 2026 Paul Christopher Cerda
-- This source code is licensed under the Business Source License 1.1
-- found in the LICENSE.md file in the root directory of this source tree.

-- Initial database setup
-- Note: pgvector is pre-installed in the pgvector/pgvector:pg16 image

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create schema
CREATE SCHEMA IF NOT EXISTS public;

-- Set search path
SET search_path TO public;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'student',
    full_name VARCHAR(255),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create test users
INSERT INTO users (email, username, hashed_password, role, full_name, is_active)
VALUES 
    ('teacher@example.com', 'teacher', '$2b$12$K7tWWVzSLlJqxEu6zF3pJOH2IFjQlZrRKgRrC2Y4gJqG9Y2jJZ7Ea', 'TEACHER', 'Jane Smith', true),
    ('student@example.com', 'student', '$2b$12$K7tWWVzSLlJqxEu6zF3pJOH2IFjQlZrRKgRrC2Y4gJqG9Y2jJZ7Ea', 'STUDENT', 'Alex Johnson', true),
    ('parent@example.com', 'parent', '$$2b$12$K7tWWVzSLlJqxEu6zF3pJOH2IFjQlZrRKgRrC2Y4gJqG9Y2jJZ7Ea', 'PARENT', 'Margaret Brown', true)
ON CONFLICT (email) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);