# GitHub Webhook Setup Guide

To automate logging GitHub commits into your PostgreSQL database, we need to connect your local development server to GitHub. Since your server runs on `localhost` and GitHub cannot reach it directly, we will use **LocalTunnel**.

Follow these step-by-step instructions.

---

## Step 1: Run LocalTunnel

LocalTunnel creates a secure public URL that points to your local Node.js server.

1. **Start the tunnel:** Assuming your backend server runs on port 5000, open a terminal and run:
   ```bash
   npx localtunnel --port 5000
   ```
2. **Copy the Public URL:** LocalTunnel will display a public URL that looks like `https://some-random-words.loca.lt`. Copy this URL. Keep this terminal open.

---

## Step 2: Configure the GitHub Webhook

Now we need to tell your GitHub repository to send a payload to this LocalTunnel URL whenever a push happens.

1. **Open your GitHub Repository:** Navigate to the repo you want to track on GitHub.
2. **Go to Settings:** Click on the **Settings** tab.
3. **Select Webhooks:** In the left sidebar, click on **Webhooks**, then click the **Add webhook** button.
4. **Fill in the Details:**
   - **Payload URL:** Paste your LocalTunnel URL and append the webhook path we created. Example: `https://some-random-words.loca.lt/webhook/github`
   - **Content type:** Important! Select **`application/json`**.
   - **Secret:** Leave this blank for now.
   - **Which events would you like to trigger this webhook?:** Select "Just the push event".
   - **Active:** Ensure the "Active" checkbox is ticked.
5. **Add Webhook:** Click the green **Add webhook** button. GitHub will immediately send a test ping payload to your server.

---

## Step 3: Test with a Git Push

Let's verify that the integration is working end-to-end!

1. **Ensure your server is running:** 
   ```bash
   cd backend
   npm run dev
   ```
2. **Ensure your LocalTunnel terminal is still running.**
3. **Make a code change:** Open your repository locally and edit any file (even a simple `README.md` update).
4. **Commit and Push:**
   ```bash
   git add .
   git commit -m "Testing GitHub Webhook Integration"
   git push origin main
   ```
5. **Check your Server Logs:** Look at your backend terminal. You should see logs like:
   ```text
   Received GitHub push event for repository: your-repo-name with 1 commits.
   Processing commit: 8d5a73f... by your-github-username
   ✅ Successfully stored commit 8d5a73f... for your-github-username
   ```
6. **Check your Frontend Dashboard:** Refresh your React application, and you will see the new GitHub commit listed with the "GitHub" badge!

*Note: The system automatically ignores duplicate commits, meaning if the same `commit_hash` is pushed again, the database will not duplicate the entry.*
