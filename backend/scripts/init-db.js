import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

async function initDb() {
  const dbName = process.env.DB_NAME || 'daily_task_updater';
  
  // First, connect to default 'postgres' database to ensure the target DB exists
  const systemConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres' // connect to system DB first
  };

  console.log(`Connecting to PostgreSQL system database on ${systemConfig.host}:${systemConfig.port}...`);
  let client = new Client(systemConfig);
  
  try {
    await client.connect();
    
    // Check if the target database exists
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    
    if (res.rowCount === 0) {
      console.log(`Database '${dbName}' does not exist. Creating...`);
      // CREATE DATABASE cannot run inside a transaction block, so we execute it on our system connection
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database '${dbName}' created successfully.`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
  } catch (err) {
    console.error('Error during database verification/creation:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  // Now, connect to the target database and execute schema + seed SQL files
  const appDbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: dbName
  };

  console.log(`Connecting to database '${dbName}'...`);
  client = new Client(appDbConfig);

  try {
    await client.connect();

    // Read schema.sql
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    console.log(`Reading schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Run schema
    console.log('Applying database schema...');
    await client.query(schemaSql);
    console.log('Schema applied successfully.');

    // No seed data is applied — all data is real and managed via the application.

    console.log('🎉 Database initialization complete!');
  } catch (err) {
    console.error('Error initializing database content:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDb();
