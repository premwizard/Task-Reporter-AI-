import pg from 'pg';

const pool = new pg.Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'daily_task_updater',
    password: 'postgres',
    port: 5432,
});

async function diagnose() {
    try {
        // 1. Check connection
        await pool.query('SELECT 1');
        console.log('✅ DB Connected successfully\n');

        // 2. Check tables exist
        const tables = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('📋 Tables in database:');
        tables.rows.forEach(r => console.log('  -', r.table_name));

        // 3. Check employees
        const employees = await pool.query('SELECT * FROM employees');
        console.log('\n👥 Employees table:');
        console.table(employees.rows);

        // 4. Check activities
        const activities = await pool.query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 10');
        console.log('\n📊 Activities table (latest 10):');
        console.table(activities.rows);

        // 5. Try a test insert
        console.log('\n🧪 Testing INSERT...');
        const testResult = await pool.query(
            `INSERT INTO activities (employee_name, source, activity, repository_name, commit_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (commit_hash) DO NOTHING
             RETURNING id`,
            ['TestUser', 'github', 'Diagnostic test commit', 'test-repo', 'DIAG-TEST-HASH-001']
        );
        if (testResult.rowCount > 0) {
            console.log('✅ Test INSERT succeeded! Row id:', testResult.rows[0].id);
        } else {
            console.log('⚠️ Test INSERT was skipped (duplicate hash already exists)');
        }

    } catch (err) {
        console.error('❌ Diagnostic failed:', err.message);
        console.error('   Code:', err.code);
        console.error('   Detail:', err.detail);
    } finally {
        await pool.end();
    }
}

diagnose();
