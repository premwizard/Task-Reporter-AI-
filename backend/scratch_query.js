import { pool } from './config/db.js';

async function fullDiagnostic() {
  try {
    console.log('====== FULL PRODUCTION DB DIAGNOSTIC ======');
    
    const users = await pool.query('SELECT id, email, github_username, github_id, role FROM users');
    console.log('\n--- USERS ---');
    console.log(users.rows);

    const installs = await pool.query('SELECT id, user_id, installation_id, account_login, account_type, installed_at FROM github_installations');
    console.log('\n--- GITHUB_INSTALLATIONS ---');
    console.log(installs.rows);

    const connRepos = await pool.query('SELECT id, user_id, repository_name, repo_name, status FROM connected_repositories');
    console.log('\n--- CONNECTED_REPOSITORIES ---');
    console.log(connRepos.rows);

    const activities = await pool.query('SELECT id, user_id, employee_name, repository_name, source, created_at FROM activities ORDER BY created_at DESC LIMIT 5');
    console.log('\n--- RECENT ACTIVITIES (last 5) ---');
    console.log(activities.rows);

    const prs = await pool.query('SELECT id, user_id, author, repository_name, title, created_at FROM pull_requests ORDER BY created_at DESC LIMIT 5');
    console.log('\n--- RECENT PULL_REQUESTS (last 5) ---');
    console.log(prs.rows);

    console.log('\n====== END DIAGNOSTIC ======');
  } catch (err) {
    console.error('DIAGNOSTIC ERROR:', err.message);
  } finally {
    process.exit(0);
  }
}

fullDiagnostic();
