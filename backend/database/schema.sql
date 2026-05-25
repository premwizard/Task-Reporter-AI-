-- PostgreSQL Schema for Employee Daily Task Updater and GitIntel

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id VARCHAR(255) UNIQUE,
    github_username VARCHAR(255) UNIQUE,
    github_avatar TEXT,
    avatar_url TEXT, -- alias/fallback requested in Step 2
    github_email VARCHAR(255),
    github_access_token TEXT,
    access_token TEXT, -- alias/fallback requested in Step 2
    role VARCHAR(50) DEFAULT 'developer',
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(100) NOT NULL,
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
    hours_worked DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (hours_worked >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Activities Table
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    employee_name VARCHAR(255),
    repository_name VARCHAR(255),
    commit_message TEXT,
    commit_hash VARCHAR(255) UNIQUE,
    branch VARCHAR(255),
    source VARCHAR(50),
    activity TEXT,
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create Connected Repositories Table (used in backend code)
CREATE TABLE IF NOT EXISTS connected_repositories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    repository_name VARCHAR(255),
    repo_name VARCHAR(255),
    webhook_id BIGINT,
    webhook_created BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    error_message TEXT,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_repo UNIQUE (user_id, repository_name)
);

-- 5. Create Repositories Table (as explicitly requested in Step 4)
CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    repo_name VARCHAR(255),
    repo_full_name VARCHAR(255),
    webhook_id VARCHAR(255),
    webhook_created BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create AI Reports Table
CREATE TABLE IF NOT EXISTS ai_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL,
    employee_name VARCHAR(255),
    repository_name VARCHAR(255),
    summary TEXT NOT NULL,
    start_date VARCHAR(255),
    end_date VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Migrations to add tracking columns to existing tables
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_github_installations_user_id ON github_installations(user_id);


