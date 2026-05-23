-- PostgreSQL Schema for Version 2: Activity Intelligence Dashboard with GitHub OAuth
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    github_id VARCHAR(100) UNIQUE,
    github_username VARCHAR(150) UNIQUE,
    github_avatar VARCHAR(255),
    github_email VARCHAR(255),
    github_access_token VARCHAR(255),
    role VARCHAR(50) DEFAULT 'developer' CHECK (role IN ('admin', 'manager', 'developer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100)
);

-- Activities Table (Unified System)
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    employee_name VARCHAR(150) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('github', 'excel', 'manual')),
    activity TEXT NOT NULL,
    repository_name VARCHAR(150),
    commit_hash VARCHAR(100) UNIQUE, -- Prevent duplicate github commits
    ai_summary TEXT, -- Stores AI translation/insight of single commit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Summary Reports Table (Unified System)
DROP TABLE IF EXISTS summary_reports CASCADE;
CREATE TABLE summary_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    employee_name VARCHAR(150) NOT NULL,
    summary TEXT NOT NULL,
    report_type VARCHAR(50) DEFAULT 'daily',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Periodic AI Reports Table
DROP TABLE IF EXISTS ai_reports CASCADE;
CREATE TABLE ai_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL,
    employee_name VARCHAR(150),
    repository_name VARCHAR(150),
    summary TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_reports_user_id ON ai_reports(user_id);

-- Indexes for performance
CREATE INDEX idx_activities_user_id ON activities(user_id);
CREATE INDEX idx_activities_employee_name ON activities(employee_name);
CREATE INDEX idx_activities_source ON activities(source);
CREATE INDEX idx_activities_created_at ON activities(created_at);

-- Connected Repositories Table
DROP TABLE IF EXISTS connected_repositories CASCADE;
CREATE TABLE connected_repositories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    repository_name VARCHAR(150) NOT NULL,
    webhook_id BIGINT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, repository_name)
);
CREATE INDEX idx_connected_repos_user_id ON connected_repositories(user_id);
