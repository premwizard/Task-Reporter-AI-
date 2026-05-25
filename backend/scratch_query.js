import { pool } from './config/db.js';

async function test() {
  try {
    console.log('--- DATABASE DIAGNOSTIC RUN (ALL COLUMNS) ---');
    const users = await pool.query('SELECT * FROM users');
    console.log('ALL USERS IN DB:', users.rows);
  } catch (err) {
    console.error('DATABASE DIAGNOSTIC ERROR:', err);
  } finally {
    process.exit(0);
  }
}

test();
