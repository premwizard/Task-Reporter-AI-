<div align="center">

# Automated Individual Daily Work Reporting System

**An automated pipeline that tracks individual employee activity across GitHub and Google Sheets, storing it centrally and broadcasting a daily report via WhatsApp.**

</div>

---

## 📖 Overview

This project has been transformed from a manual task entry system into an automated pipeline. It efficiently tracks individual employee activity across GitHub and Google Sheets, stores it centrally in a PostgreSQL database, and broadcasts a formatted daily report via WhatsApp.

## 📈 Impact

Designed for teams and managers to seamlessly monitor daily work activities without the overhead of manual reporting. It increases productivity, ensures transparency, and centralizes activity tracking across development and planning tools.

## 🌐 Live Demo

**Experience the application live:**  
🔗 **[[https://task-reporter-ai.vercel.app/](https://task-reporter-ai.vercel.app/)]**

## 🎥 Demo Video

[![Demo Video](https://img.youtube.com/vi/nN-E7LM2HPQ/maxresdefault.jpg)]([https://youtu.be/nN-E7LM2HPQ])  
*Click the image above to watch the demonstration video or view it here: [https://youtu.be/nN-E7LM2HPQ]*

## 📸 Screenshots

### Authentication & Login
![Login Screen](<screenshots/login page.png>)
*Secure login interface with options for email/password and GitHub OAuth authentication.*

### Intelligence Dashboard
![Dashboard](<screenshots/Dashboard.png>)
*Real-time overview of engineering activity, AI insights, active developers, and recent commits.*

### Pull Request Tracking
![Pull Requests](<screenshots/PR Traacking.png>)
*Audit active integrations, PR velocity, merged PRs, and code volume across repositories.*

### AI Standups
![AI Standups](<screenshots/AI Standups.png>)
*Automated generation of daily standup reports, highlighting accomplishments, retro, and potential blockers.*

### Repository Tracking
![Repository Tracking](<screenshots/Repo Tracking.png>)
*Manage tracked repositories, accounts, and live webhook integrations across your organization.*

## 🚀 Key Highlights

* **Fully Automated Pipeline**: Removes manual task logging.
* **Multi-Platform Integration**: Consolidates GitHub push payloads and Google Sheets updates.
* **Automated WhatsApp Broadcasting**: Ensures stakeholders get updates at 6 PM daily.

## ✨ Features

* **GitHub Webhook Integration**: Automatically captures developer commit and push activity.
* **Google Sheets Webhook**: Syncs task entries seamlessly via Google Apps Script.
* **Centralized Dashboard**: A Vite+React frontend that provides a unified activity feed.
* **Automated Cron Jobs**: Nightly script to summarize and broadcast reports via WhatsApp.

## 💡 Challenges Solved

* **Data Silos**: Brought together scattered activities from Google Sheets and GitHub into a single PostgreSQL database.
* **Manual Reporting**: Replaced manual end-of-day reports with an automated WhatsApp notification system powered by `whatsapp-web.js`.

## 🛠 Tech Stack

**Frontend**
* React
* Vite
* Tailwind CSS

**Backend**
* Node.js
* Express

**Database**
* PostgreSQL

**Integrations**
* GitHub Webhook
* Google Sheets App Script

## 🏗 Project Architecture

The system operates as a standard full-stack application with asynchronous webhook handlers:
1. **Frontend**: React-based dashboard displaying unified activity.
2. **Backend**: Express API capturing payloads from GitHub and Google Sheets.
3. **Database**: PostgreSQL storing unified `employees` and `activities` records.
4. **Cron Job**: A Node cron scheduler triggers `whatsapp-web.js` at 6 PM daily to dispatch the summarized reports.

## ⚙️ Installation and Setup

### Prerequisites

* Node.js (v16 or higher)
* PostgreSQL running locally
* npm or yarn
* Git

### Steps

1. **Clone the repository:**
   ```bash
   git clone 
   cd Daily-Task-Updater
   ```

2. **Database Initialization:**
   Ensure PostgreSQL is running locally, then initialize the new unified tables:
   ```bash
   cd backend
   npm run init-db
   ```

3. **Install Dependencies:**
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

4. **Running the System:**
   Start the backend server (starts the API and the WhatsApp client):
   ```bash
   cd backend
   npm run dev
   ```

   Start the frontend dashboard in a new terminal:
   ```bash
   cd frontend
   npm run dev
   ```

### Webhook Configuration
- **GitHub**: Go to your repository settings -> Webhooks -> Add Webhook. Point the payload URL to `http://<your-server-domain>/webhook/github`. Select `application/json` and only push events.
- **Google Sheets**: Write a small Google Apps Script bound to your sheet using `UrlFetchApp` on an `onEdit` trigger to `POST` JSON data to `http://<your-server-domain>/webhook/sheets`.

## 🔐 Environment Variables

Make sure to check `backend/.env.example` and set the appropriate variables in your `.env` file within the `backend` folder:

```env
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
WHATSAPP_TEST_NUMBER=your_test_number
# or WHATSAPP_GROUP_JID=your_group_id
```

## 🚀 Usage

Once the backend and frontend are running, you can access the dashboard at `http://localhost:5173` (default Vite port) to view the unified activity feed. Webhooks will automatically populate the database as events occur, and the cron job will execute at its scheduled time.

## 📂 Folder Structure

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

## 🔮 Future Enhancements

* [FUTURE_PLANS]
* Expand test coverage (Unit and E2E)
* Support additional integrations (e.g., Slack, Jira)

## 🤝 Contributing

Contributions are always welcome!

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

## ✍️ Author

**Automated Reporting Team**
* GitHub: [@premwizard]([https://github.com/premwizard/Task-Reporter-AI-])
* LinkedIn: [PREM M](https://www.linkedin.com/in/m-prem/)
