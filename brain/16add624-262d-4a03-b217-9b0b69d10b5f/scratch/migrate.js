import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load dotenv path explicitly first
dotenv.config({ path: path.join(__dirname, '../../../backend/.env') });

console.log("[Migration Scratch] Loaded DB_USER:", process.env.DB_USER);
console.log("[Migration Scratch] Loaded DB_NAME:", process.env.DB_NAME);

// Now import the pool and init
const { initDatabase } = await import('../../../backend/database/db.js');

console.log("Starting quick migration check...");
initDatabase()
  .then(() => {
    console.log("Migration executed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
