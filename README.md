# Automated Individual Daily Work Reporting System (Version 1)

This project has been transformed from a manual task entry system into an automated pipeline that tracks individual employee activity across GitHub and Google Sheets, storing it centrally and broadcasting a daily report via WhatsApp.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Integrations**: github webhook, Google Sheets App Script, whatsapp-web.js

## Folder Structure

```text
/
├── frontend/             # React Application
│   └── src/
│       └── App.jsx       # Unified Activity Feed Dashboard
│
└── backend/              # Node.js Express Server
    ├── controllers/
    │   └── activityController.js  # Serves activities to frontend
    ├── cron/
    │   └── reportScheduler.js     # Uses node-cron to trigger daily reports at 6 PM
    ├── database/
    │   ├── db.js                  # PostgreSQL pool connection
    │   ├── schema.sql             # Unified schema (employees, activities)
    │   └── seed.sql               # Example starter data
    ├── routes/
    │   ├── activityRoutes.js
    │   └── webhookRoutes.js       # Routes for github/sheets webhooks
    ├── scripts/
    │   └── init-db.js             # DB initialization script
    ├── services/
    │   ├── activityService.js     # DB logic for logging activities
    │   ├── reportService.js       # Logic to generate and send formatted reports
    │   └── whatsappService.js     # WhatsApp Web initialization and sending
    ├── webhooks/
    │   ├── githubWebhook.js       # Handles GitHub push payloads
    │   └── sheetsWebhook.js       # Handles Google Sheets POST requests
    ├── .env
    ├── .env.example
    └── server.js                  # Main API entrypoint
```

## Setup Instructions

### 1. Database Initialization
Ensure PostgreSQL is running locally, then initialize the new unified tables:
```bash
cd backend
npm run init-db
```

### 2. Environment Variables
Make sure to check `backend/.env.example` and set the appropriate variables in your `.env` file. You need:
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `WHATSAPP_TEST_NUMBER` or `WHATSAPP_GROUP_JID`

### 3. Running the System
Start the backend server (starts the API and the WhatsApp client):
```bash
cd backend
npm install
npm run dev
```

Start the frontend dashboard:
```bash
cd frontend
npm install
npm run dev
```

### 4. Setting up Webhooks
- **GitHub**: Go to your repository settings -> Webhooks -> Add Webhook. Point the payload URL to `http://<your-server-domain>/webhook/github`. Select `application/json` and only push events.
- **Google Sheets**: Write a small Google Apps Script bound to your sheet using `UrlFetchApp` on an `onEdit` trigger to `POST` JSON data to `http://<your-server-domain>/webhook/sheets`.
