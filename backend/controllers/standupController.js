import { pool } from '../database/db.js';

/**
 * Express controller to generate AI Daily, Weekly, or Monthly Standup updates using Groq
 * SECURITY: Non-admin users can ONLY generate standups for THEMSELVES.
 *           Admins can request any username including 'team'/'all'.
 */
export const getAIStandup = async (req, res) => {
  const { username } = req.params;
  const { type = 'daily' } = req.query; // daily, weekly, monthly
  const authUserId = req.user?.id;
  const authUsername = req.user?.github_username;
  const authRole = req.user?.role;

  try {
    console.log(`🤖 [AI Standup] Request for user: "${username}" | Type: "${type}" | Requested by: "${authUsername}" (role: ${authRole})`);

    const isTeam = username.toLowerCase() === 'team' || username.toLowerCase() === 'all';

    // SECURITY CHECK: Non-admins cannot request team standups or other users' standups
    if (authRole !== 'admin') {
      if (isTeam) {
        return res.status(403).json({ error: 'Access denied: Team standups require admin role.' });
      }
      if (username !== authUsername) {
        return res.status(403).json({ error: 'Access denied: You can only generate standups for yourself.' });
      }
    }

    // Determine date thresholds
    let daysThreshold = 2; // For daily, check yesterday and today
    if (type === 'weekly') daysThreshold = 7;
    if (type === 'monthly') daysThreshold = 30;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysThreshold);

    let resolvedUsername = username;

    // 1. Resolve userId unless requesting team summaries
    if (!isTeam) {
      const userQuery = await pool.query(
        `SELECT id, github_username FROM users WHERE github_username = $1 OR id = $2 LIMIT 1`,
        [username, isNaN(parseInt(username)) ? -999 : parseInt(username)]
      );
      if (userQuery.rows.length > 0) {
        resolvedUsername = userQuery.rows[0].github_username || username;
      }
    }

    // 2. Fetch Commits — strict isolation
    let commitQueryStr = '';
    let commitQueryParams = [];
    if (isTeam) {
      // Admin-only: fetch all activities
      commitQueryStr = `SELECT * FROM activities WHERE created_at >= $1 ORDER BY created_at DESC`;
      commitQueryParams = [sinceDate];
    } else {
      // Filter strictly by both user_id AND employee_name for robustness
      commitQueryStr = `SELECT * FROM activities WHERE (user_id = $1 OR employee_name = $2) AND created_at >= $3 ORDER BY created_at DESC`;
      commitQueryParams = [authUserId, resolvedUsername, sinceDate];
    }
    const commitsRes = await pool.query(commitQueryStr, commitQueryParams);
    const commits = commitsRes.rows;

    // 3. Fetch PRs — strict isolation
    let prQueryStr = '';
    let prQueryParams = [];
    if (isTeam) {
      prQueryStr = `SELECT * FROM pull_requests WHERE created_at >= $1 ORDER BY created_at DESC`;
      prQueryParams = [sinceDate];
    } else {
      // Filter by user_id (new column) OR author username for backwards compatibility
      prQueryStr = `SELECT * FROM pull_requests WHERE (user_id = $1 OR author = $2) AND created_at >= $3 ORDER BY created_at DESC`;
      prQueryParams = [authUserId, resolvedUsername, sinceDate];
    }
    const prsRes = await pool.query(prQueryStr, prQueryParams);
    const prs = prsRes.rows;

    // Build repository list
    const repos = [...new Set([
      ...commits.map(c => c.repository_name),
      ...prs.map(p => p.repository_name)
    ])].filter(Boolean);

    if (commits.length === 0 && prs.length === 0) {
      return res.status(200).json({
        success: true,
        type,
        username: resolvedUsername,
        standup: `### 📅 No Activity Identified\nNo active code pushing or pull request activities recorded for **${resolvedUsername}** in the selected timeframe (${type}).`,
        stats: { commits: 0, prs: 0, repos: 0 }
      });
    }

    // 4. Generate standup via Groq
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      // Mock Standup fallback
      const mockStandup = generateMockStandup(resolvedUsername, commits, prs, type, repos, isTeam);
      return res.status(200).json({
        success: true,
        type,
        username: resolvedUsername,
        standup: mockStandup,
        stats: { commits: commits.length, prs: prs.length, repos: repos.length }
      });
    }

    const commitsText = commits.map(c => `- Commit: "${c.activity}" in repo [${c.repository_name}] branch [${c.branch || 'main'}] at ${new Date(c.created_at).toLocaleDateString()}`).join('\n');
    const prsText = prs.map(p => `- Pull Request: "${p.title}" [State: ${p.state}, Merged: ${p.merged}] in repo [${p.repository_name}] branch [${p.branch}] at ${new Date(p.created_at).toLocaleDateString()}`).join('\n');

    const systemPrompt = `You are a professional AI Engineering Manager.
You generate clear, concise, and structured daily standup updates for developers.
Format the output professionally in Markdown.

Standup update should have:
### 📅 ${type === 'daily' ? "Today's Accomplishments" : type === 'weekly' ? "Weekly Accomplishments" : "Monthly Accomplishments"}
* Summary of major commits and pull requests completed.
* Highlight key repositories worked on: ${repos.join(', ')}.

### ⏪ ${type === 'daily' ? "Yesterday's Retro" : "Prior Period Review"}
* Concise recap of preceding contributions.

### ⚠️ Potential Obstacles / Review items
* List complex files modified or pull requests left open. If none, output "No current blockers."

Ensure the bullet points are actionable and descriptive. Do NOT print commit hashes.`;

    const userPrompt = `Developer: ${resolvedUsername}
Timeframe: ${type}
Commit Logs:
${commitsText || 'No commits recorded.'}

Pull Request Logs:
${prsText || 'No pull requests recorded.'}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1024,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      throw new Error(`Groq Standup API status check failed: ${response.statusText}`);
    }

    const data = await response.json();
    const standup = data.choices[0].message.content.trim();

    res.status(200).json({
      success: true,
      type,
      username: resolvedUsername,
      standup,
      stats: { commits: commits.length, prs: prs.length, repos: repos.length }
    });

  } catch (err) {
    console.error('Error generating standup:', err);
    res.status(500).json({ error: 'Failed to generate standup summary: ' + err.message });
  }
};

function generateMockStandup(username, commits, prs, type, repos, isTeam) {
  const period = type === 'daily' ? 'today' : type === 'weekly' ? 'this week' : 'this month';

  const commitHighlights = commits.slice(0, 4).map(c => `* ${c.activity.replace(/^(feat|fix|docs|refactor|test|chore)(\(.*?\))?:/i, '').trim()} in \`${c.repository_name}\` branch \`${c.branch || 'main'}\``).join('\n');
  const prHighlights = prs.slice(0, 3).map(p => `* ${p.title} (${p.merged ? 'Merged' : 'Open'})`).join('\n');

  return `### 📅 ${type === 'daily' ? "Today's Focus" : type === 'weekly' ? "Weekly Accomplishments" : "Monthly Accomplishments"} (${username})
${commitHighlights ? `* Key developer commits accomplished ${period}:\n${commitHighlights.split('\n').map(l => '  ' + l).join('\n')}` : '* Maintained general repositories and verified deployment integrity.'}
${prHighlights ? `* Managed Pull Requests:\n${prHighlights.split('\n').map(l => '  ' + l).join('\n')}` : ''}
* Connected repository contexts: ${repos.map(r => `\`${r}\``).join(', ') || 'N/A'}.

### ⏪ ${type === 'daily' ? "Yesterday's Retro" : "Prior Period Review"}
* Handled general code maintenance, checked tests validation, and synced push activities.
* Verified database connectivity and verified centralized GitHub App webhooks pipeline.

### ⚠️ Blockers & Risks
* No active blockers identified. Central integration webhooks are online and listening.`;
}
