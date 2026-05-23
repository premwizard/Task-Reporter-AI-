-- PostgreSQL Schema for Employee Daily Task Updater
DROP TABLE IF EXISTS tasks CASCADE;

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    employee_name VARCHAR(100) NOT NULL,
    task_title VARCHAR(255) NOT NULL,
    task_description TEXT,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
    hours_worked DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (hours_worked >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
