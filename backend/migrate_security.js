import { pool } from './config/db.js';

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running security isolation migration...');
    
    await client.query(`
      ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('✅ Added user_id to pull_requests');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pull_requests_user_id ON pull_requests(user_id)
    `);
    console.log('✅ Created index on pull_requests.user_id');

    await client.query(`
      CREATE TABLE IF NOT EXISTS summary_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        employee_name VARCHAR(255),
        summary TEXT NOT NULL,
        report_type VARCHAR(50) DEFAULT 'daily',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created summary_reports table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_summary_reports_user_id ON summary_reports(user_id)
    `);
    console.log('✅ Created index on summary_reports.user_id');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();
