-- Add user_id to pull_requests table for multi-tenant isolation
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pull_requests_user_id ON pull_requests(user_id);

-- Add summary_reports table (used by summaryController)
CREATE TABLE IF NOT EXISTS summary_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    employee_name VARCHAR(255),
    summary TEXT NOT NULL,
    report_type VARCHAR(50) DEFAULT 'daily',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_summary_reports_user_id ON summary_reports(user_id);
