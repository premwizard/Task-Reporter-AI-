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
    repository_name VARCHAR(255) NOT NULL,
    repo_name VARCHAR(255),
    webhook_id BIGINT,
    webhook_created BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    error_message TEXT,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, repository_name)
);
CREATE INDEX idx_connected_repos_user_id ON connected_repositories(user_id);

-- Repositories Table (as explicitly requested in Step 4/11)
DROP TABLE IF EXISTS repositories CASCADE;
CREATE TABLE repositories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    repo_name VARCHAR(255),
    repo_full_name VARCHAR(255),
    webhook_id VARCHAR(255),
    webhook_created BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Migrations to add tracking columns to existing tables
ALTER TABLE connected_repositories ADD COLUMN IF NOT EXISTS repo_name VARCHAR(255);
ALTER TABLE connected_repositories ADD COLUMN IF NOT EXISTS webhook_created BOOLEAN DEFAULT FALSE;
ALTER TABLE connected_repositories ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE connected_repositories ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE repositories ADD COLUMN IF NOT EXISTS webhook_created BOOLEAN DEFAULT FALSE;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 8. Create GitHub App Installations Table
CREATE TABLE IF NOT EXISTS github_installations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    installation_id BIGINT UNIQUE NOT NULL,
    account_login VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    repositories JSONB DEFAULT '[]'::jsonb,
    github_username VARCHAR(255),
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_github_installations_user_id ON github_installations(user_id);

-- 9. Create GitHub Pull Requests Table
CREATE TABLE IF NOT EXISTS pull_requests (
    id SERIAL PRIMARY KEY,
    github_pr_id BIGINT UNIQUE NOT NULL,
    repository_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    author VARCHAR(255) NOT NULL,
    state VARCHAR(50) NOT NULL,
    merged BOOLEAN DEFAULT FALSE,
    branch VARCHAR(255) NOT NULL,
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    pr_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    merged_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pull_requests_author ON pull_requests(author);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests(repository_name);

-- 10. Schema Migrations for Installations Columns
ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS github_username VARCHAR(255);
ALTER TABLE github_installations ADD COLUMN IF NOT EXISTS installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;



