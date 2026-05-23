import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const seedDatabase = async () => {
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    try {
        console.log('Connecting to PostgreSQL database...');
        await client.connect();

        // 1. Create tables if they do not exist
        console.log('Creating database tables if not present...');

        // Employees table
        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                team VARCHAR(100),
                github_username VARCHAR(100) UNIQUE
            );
        `);

        // Activities table
        await client.query(`
            CREATE TABLE IF NOT EXISTS activities (
                id SERIAL PRIMARY KEY,
                employee_name VARCHAR(150) NOT NULL,
                source VARCHAR(50) NOT NULL CHECK (source IN ('github', 'excel', 'manual')),
                activity TEXT NOT NULL,
                repository_name VARCHAR(150),
                commit_hash VARCHAR(100) UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Database schema ensured. No seed data inserted — all data is real and managed through the application.');
    } catch (error) {
        console.error('❌ Error setting up database:', error);
    } finally {
        await client.end();
        console.log('Database connection closed.');
    }
};

seedDatabase();
