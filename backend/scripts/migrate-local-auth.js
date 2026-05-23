import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function migrate() {
  try {
    console.log('Starting local auth schema migration...');

    // 1. Drop NOT NULL constraint on github_id and github_username
    await pool.query('ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;');
    console.log('✅ github_id is now nullable');

    await pool.query('ALTER TABLE users ALTER COLUMN github_username DROP NOT NULL;');
    console.log('✅ github_username is now nullable');

    // 2. Add local auth columns
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;');
    console.log('✅ email column added');

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);');
    console.log('✅ password_hash column added');

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);');
    console.log('✅ first_name column added');

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);');
    console.log('✅ last_name column added');

    console.log('🎉 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
