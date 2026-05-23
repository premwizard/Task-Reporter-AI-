const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'daily_task_updater',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(20) NOT NULL,
        employee_name VARCHAR(255),
        repository_name VARCHAR(255),
        summary TEXT NOT NULL,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('ai_reports table created');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
migrate();
