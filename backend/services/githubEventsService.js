/**
 * GitHub Events Service
 * =====================
 * Fetches the authenticated user's public + private activity events from GitHub
 * using their stored OAuth token. This supplements webhook tracking to capture
 * commits in collaborator repos, org repos, and any repo the user pushes to —
 * even when the GitHub App is not installed there.
 *
 * GitHub Events API: GET /users/:username/events
 * Rate limit: 60 req/hr unauthenticated, 5000 req/hr with token.
 * Returns up to 300 events from the last 90 days (10 pages × 30 events).
 */

import { pool } from '../database/db.js';
import { logActivity } from './activityService.js';

import { getIO } from '../socket.js';

const GITHUB_API = 'https://api.github.com';
const EVENTS_PER_PAGE = 100;
const MAX_PAGES = 3; // fetch up to 300 events per sync

/**
 * Fetch all recent GitHub events for a user via their OAuth token.
 * Uses If-None-Match ETag caching to avoid burning rate limits.
 */
async function fetchUserEvents(username, accessToken, lastEtag = null) {
  const allEvents = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const headers = {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitIntel-App/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (page === 1 && lastEtag) {
      headers['If-None-Match'] = lastEtag;
    }

    const url = `${GITHUB_API}/users/${username}/events?per_page=${EVENTS_PER_PAGE}&page=${page}`;

    try {
      const res = await fetch(url, { headers });

      // 304 Not Modified → no new events
      if (res.status === 304) {
        console.log(`[GitHubEvents] No new events for @${username} (ETag matched)`);
        return { events: [], newEtag: lastEtag };
      }

      if (!res.ok) {
        const body = await res.text();
        console.warn(`[GitHubEvents] API error page ${page}: ${res.status} ${body.slice(0, 120)}`);
        break;
      }

      const newEtag = res.headers.get('etag');
      const events = await res.json();

      if (!Array.isArray(events) || events.length === 0) break;

      allEvents.push(...events);

      // If we got fewer than full page, no more pages exist
      if (events.length < EVENTS_PER_PAGE) break;

      // Pass back the first page etag for future caching
      if (page === 1 && newEtag) {
        // Store for next run
        allEvents._etag = newEtag;
      }
    } catch (fetchErr) {
      console.error(`[GitHubEvents] Fetch error page ${page}:`, fetchErr.message);
      break;
    }
  }

  return { events: allEvents, newEtag: allEvents._etag || null };
}

/**
 * Parse a PushEvent into a list of commit activity records.
 */
function parsePushEvent(event) {
  const repo = event.repo?.name || 'unknown/unknown';
  const branch = event.payload?.ref?.replace('refs/heads/', '') || 'main';
  const commits = event.payload?.commits || [];
  const eventTime = new Date(event.created_at || Date.now());

  return commits
    .filter(c => c.message && c.sha)
    .map(c => ({
      repositoryName: repo,
      branch,
      commitHash: c.sha,
      commitMessage: c.message.split('\n')[0].slice(0, 500), // first line, max 500 chars
      authorName: c.author?.name || event.actor?.login || 'Unknown',
      authorLogin: event.actor?.login || null,
      committedAt: eventTime,
      eventId: event.id,
    }));
}

/**
 * Parse a PullRequestEvent into an activity record.
 */
function parsePullRequestEvent(event) {
  const pr = event.payload?.pull_request;
  if (!pr) return null;
  const action = event.payload?.action;
  if (!['opened', 'closed', 'merged'].includes(action)) return null;

  const merged = pr.merged || (action === 'closed' && pr.merged_at);
  const verb = merged ? 'Merged' : action === 'opened' ? 'Opened' : 'Closed';

  return {
    repositoryName: event.repo?.name || 'unknown/unknown',
    branch: pr.head?.ref || 'main',
    commitHash: `pr-${event.repo?.name}-${pr.number}-${action}`, // synthetic unique key
    commitMessage: `${verb} PR #${pr.number}: ${pr.title}`,
    authorLogin: event.actor?.login || null,
    committedAt: new Date(event.created_at || Date.now()),
    eventId: event.id,
  };
}

/**
 * Main sync function — call this for one user.
 * Returns { inserted, skipped, errors }
 */
export async function syncUserGitHubActivity(userId) {
  const stats = { inserted: 0, skipped: 0, errors: 0 };

  try {
    // Fetch user record
    const userRes = await pool.query(
      `SELECT id, github_username, github_access_token, email FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      console.warn(`[GitHubEvents] User ${userId} not found`);
      return stats;
    }

    const user = userRes.rows[0];
    const { github_username: username, github_access_token: token } = user;

    if (!token) {
      console.warn(`[GitHubEvents] No OAuth token for user ${userId} (@${username}). Skipping.`);
      return stats;
    }

    if (!username) {
      console.warn(`[GitHubEvents] No github_username for user ${userId}. Skipping.`);
      return stats;
    }

    console.log(`\n🌐 [GitHubEvents] Syncing activity for @${username} (user_id=${userId})...`);

    // Fetch last ETag from DB metadata (to avoid re-processing unchanged data)
    const metaRes = await pool.query(
      `SELECT value FROM user_sync_meta WHERE user_id = $1 AND key = 'events_etag'`,
      [userId]
    ).catch(() => ({ rows: [] })); // table may not exist yet
    const lastEtag = metaRes.rows[0]?.value || null;

    // Fetch events
    const { events, newEtag } = await fetchUserEvents(username, token, lastEtag);

    console.log(`[GitHubEvents] Fetched ${events.length} events for @${username}`);

    // Extract all commit-level records
    const allRecords = [];

    for (const event of events) {
      if (event.type === 'PushEvent') {
        const commits = parsePushEvent(event);
        allRecords.push(...commits.map(c => ({ ...c, activityType: 'push' })));
      } else if (event.type === 'PullRequestEvent') {
        const pr = parsePullRequestEvent(event);
        if (pr) allRecords.push({ ...pr, activityType: 'pull_request' });
      }
    }

    console.log(`[GitHubEvents] Extracted ${allRecords.length} activity records`);

    // Store each record
    const employeeName = username;

    for (const record of allRecords) {
      try {
        const activity = `${record.commitMessage}`;
        const inserted = await logActivity(
          userId,
          employeeName,
          'github_events', // source distinguishes from webhook
          activity,
          record.repositoryName,
          record.commitHash,
          record.committedAt
        );

        if (inserted) {
          stats.inserted++;
          console.log(`  ✅ [GitHubEvents] Inserted: ${record.repositoryName} — ${record.commitMessage.slice(0, 60)}`);
          try {
            getIO().emit('new_activity', inserted);
          } catch (ioErr) {
            console.warn(`[GitHubEvents] Socket emit failed:`, ioErr.message);
          }
        } else {
          stats.skipped++; // ON CONFLICT DO NOTHING
        }
      } catch (err) {
        stats.errors++;
        console.error(`  ❌ [GitHubEvents] Error storing record:`, err.message);
      }
    }

    // Save new ETag if we got one
    if (newEtag) {
      await pool.query(
        `INSERT INTO user_sync_meta (user_id, key, value, updated_at)
         VALUES ($1, 'events_etag', $2, NOW())
         ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [userId, newEtag]
      ).catch(() => {}); // silently fail if table missing
    }

    console.log(`✅ [GitHubEvents] Sync complete for @${username}: +${stats.inserted} inserted, ${stats.skipped} skipped, ${stats.errors} errors`);
  } catch (err) {
    console.error(`❌ [GitHubEvents] Sync failed for user ${userId}:`, err.message);
    stats.errors++;
  }

  return stats;
}

/**
 * Sync activity for ALL users who have GitHub OAuth tokens.
 * Call this from a cron job or scheduled interval.
 */
export async function syncAllUsersActivity() {
  console.log(`\n🔄 [GitHubEvents] Starting global activity sync for all users...`);
  const totalStats = { users: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    const usersRes = await pool.query(
      `SELECT id FROM users WHERE github_access_token IS NOT NULL AND github_username IS NOT NULL`
    );

    for (const { id } of usersRes.rows) {
      totalStats.users++;
      const s = await syncUserGitHubActivity(id);
      totalStats.inserted += s.inserted;
      totalStats.skipped += s.skipped;
      totalStats.errors += s.errors;
    }
  } catch (err) {
    console.error(`❌ [GitHubEvents] Global sync error:`, err.message);
  }

  console.log(`\n✅ [GitHubEvents] Global sync done. Users: ${totalStats.users}, Inserted: ${totalStats.inserted}, Skipped: ${totalStats.skipped}, Errors: ${totalStats.errors}`);
  return totalStats;
}
