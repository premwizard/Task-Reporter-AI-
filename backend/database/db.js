import pg from 'pg';
import dotenv from 'dotenv';

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
