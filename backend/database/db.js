import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;

console.log("[DB Init] Initializing database pool...");

const dbUrl = process.env.DATABASE_URL;
const hostVal = process.env.DB_HOST;

const isUrlString = (str) => str && (str.startsWith('postgres://') || str.startsWith('postgresql://'));

const connectionString = isUrlString(dbUrl) ? dbUrl : (isUrlString(hostVal) ? hostVal : null);

console.log("[DB Init] DATABASE_URL present:", !!dbUrl);
console.log("[DB Init] DB_HOST present:", !!hostVal);
console.log("[DB Init] Using connectionString:", !!connectionString);

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: {
          rejectUnauthorized: false
        }
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Step 3 — Add Database Connection Test Logs
pool.connect()
  .then((client) => {
    console.log("✅ PostgreSQL Connected Successfully");
    client.release();
  })
  .catch((err) => {
    console.error("❌ PostgreSQL Connection Error:", err);
  });

// Step 7 — Add Startup Health Check
pool.query('SELECT NOW()')
  .then((res) => {
    console.log("✅ PostgreSQL Query Health Check Success:", res.rows[0].now);
  })
  .catch((err) => {
    console.error("❌ PostgreSQL Query Health Check Failure:", err);
  });

// Get directory name in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Automatically read schema.sql and create tables if they do not exist.
 */
export const initDatabase = async () => {
  console.log("[DB Init] Starting automatic schema setup...");
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`schema.sql not found at path: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute all queries in schema.sql
    await pool.query(schemaSql);
    console.log("[DB Init] Schema creation queries executed successfully.");

    // Verify tables exist
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'activities', 'repositories', 'connected_repositories', 'tasks', 'ai_reports');
    `;
    const res = await pool.query(checkTablesQuery);
    const existingTables = res.rows.map(row => row.table_name);
    console.log("[DB Init] Table verification check results:", existingTables);

    // Print logs as requested by Step 8
    if (existingTables.includes('users')) {
      console.log("✅ users table ready");
    } else {
      console.warn("⚠️ users table is missing!");
    }

    if (existingTables.includes('activities')) {
      console.log("✅ activities table ready");
    } else {
      console.warn("⚠️ activities table is missing!");
    }

    if (existingTables.includes('repositories') || existingTables.includes('connected_repositories')) {
      console.log("✅ repositories table ready");
    } else {
      console.warn("⚠️ repositories table is missing!");
    }

    if (existingTables.includes('tasks')) {
      console.log("✅ tasks table ready");
    }

    if (existingTables.includes('ai_reports')) {
      console.log("✅ ai_reports table ready");
    } else {
      console.warn("⚠️ ai_reports table is missing!");
    }
    
    console.log("🚀 Database initialization complete and verified!");
  } catch (err) {
    console.error("❌ Database Initialization Failure:", err);
    throw err;
  }
};

