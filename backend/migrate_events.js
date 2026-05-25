import { pool } from './config/db.js';

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running GitHub Events sync metadata migration...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sync_meta (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key        VARCHAR(100) NOT NULL,
        value      TEXT,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, key)
      )
    `);
    console.log('✅ Created user_sync_meta table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sync_meta_user_id ON user_sync_meta(user_id)
    `);
    console.log('✅ Created index on user_sync_meta.user_id');

    // Also ensure activities table has a branch column (needed for events data)
    await client.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS branch VARCHAR(255)`);
    console.log('✅ Ensured activities.branch column exists');

    console.log('✅ Migration complete.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
