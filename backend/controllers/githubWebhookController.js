import { pool } from '../database/db.js';
import { getIO } from '../socket.js';

/**
 * Inserts a single activity row into PostgreSQL with detailed logs.
 */
async function insertActivity({ userId, employeeName, source, activity, repositoryName, commitHash, committedAt, aiSummary }) {
    console.log(`\n💾 [DB Storage Debugging] Executing INSERT Query:`);
    console.log(`   SQL          : INSERT INTO activities (user_id, employee_name, source, activity, repository_name, commit_hash, created_at, ai_summary)...`);
    console.log(`   Parameters   : userId=${userId}, employeeName="${employeeName}", source="${source}", repositoryName="${repositoryName}", hash="${commitHash}"`);

    try {
        const result = await pool.query(
            `INSERT INTO activities
               (user_id, employee_name, source, activity, repository_name, commit_hash, created_at, ai_summary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (commit_hash) DO NOTHING
             RETURNING *`,
            [
                userId,
                employeeName,
                source,
                activity,
                repositoryName  ?? null,
                commitHash      ?? null,
                committedAt     ?? new Date(),
                aiSummary       ?? null
            ]
        );

        if (result.rowCount > 0) {
            console.log(`   ✅ [DB Success] Saved activity row. Assigned row id: ${result.rows[0].id}. Mapped user_id: ${userId}`);
            return result.rows[0];
        } else {
            console.log(`   ⚠️ [DB Skip] Entry bypassed — commit hash already registered in activities table: ${commitHash}`);
            return false;
        }
    } catch (err) {
        console.error(`   ❌ [DB Error] SQL execution FAILED:`, err.message);
        return false;
    }
}

/**
 * Maps the GitHub webhook payload to database rows and links them to the correct user.
 */
async function handleGithubPayload(payload) {
    const repositoryName = payload.repository?.name        || 'unknown-repo';
    const repoFullName   = payload.repository?.full_name   || repositoryName;
    const branch         = payload.ref?.replace('refs/heads/', '') || 'unknown-branch';
    const pusher         = payload.pusher?.name            || 'unknown';
    const commits        = Array.isArray(payload.commits)  ? payload.commits : [];

    console.log(`\n==================================================`);
    console.log(`📦 WEBHOOK PAYLOAD RESOLUTION`);
    console.log(`==================================================`);
    console.log(`[Payload Info] Repo   : ${repoFullName}`);
    console.log(`[Payload Info] Branch : ${branch}`);
    console.log(`[Payload Info] Pusher : ${pusher}`);
    console.log(`[Payload Info] Commits: ${commits.length}`);
    console.log(`==================================================`);

    if (commits.length === 0) {
        console.warn('⚠️ [Payload Warn] No commits found in push event — skipping database synchronization.');
        return;
    }

    let inserted = 0;
    let skipped  = 0;

    for (const commit of commits) {
        const commitMessage = (commit.message || '').trim() || 'No commit message';
        const commitHash    = commit.id;
        const committedAt   = commit.timestamp
                            ? new Date(commit.timestamp)
                            : new Date();

        let githubUsername;
        let usernameSource;

        if (commit.author?.username) {
            githubUsername = commit.author.username;
            usernameSource = 'commit.author.username';
        } else if (commit.committer?.username) {
            githubUsername = commit.committer.username;
            usernameSource = 'commit.committer.username';
        } else if (payload.sender?.login) {
            githubUsername = payload.sender.login;
            usernameSource = 'payload.sender.login';
        } else if (payload.pusher?.name) {
            githubUsername = payload.pusher.name;
            usernameSource = 'payload.pusher.name';
        } else {
            githubUsername = 'Unknown User';
            usernameSource = 'fallback';
        }

        // ── Resolve GitHub Username to Database User ID ──
        let userId = null;
        let employeeName = githubUsername;

        console.log(`\n🔍 [User Mapping] Resolving committer "${githubUsername}" (source: ${usernameSource})...`);
        try {
            const userQuery = await pool.query('SELECT id, github_username, email, first_name, last_name FROM users WHERE github_username = $1', [githubUsername]);
            if (userQuery.rows.length > 0) {
                userId = userQuery.rows[0].id;
                employeeName = userQuery.rows[0].github_username;
                console.log(`   ✨ [User Mapping Success] Found direct match in users table: ID ${userId} (@${employeeName})`);
            } else {
                console.log(`   ⚠️ [User Mapping Warning] No direct match found in users table for @${githubUsername}. Checking repo connector fallback...`);
                
                // Fallback to whoever connected this repository
                const connQuery = await pool.query(
                    `SELECT cr.user_id, u.github_username, u.first_name, u.last_name 
                     FROM connected_repositories cr 
                     JOIN users u ON cr.user_id = u.id 
                     WHERE cr.repository_name = $1 LIMIT 1`,
                    [repoFullName]
                );
                
                if (connQuery.rows.length > 0) {
                    userId = connQuery.rows[0].user_id;
                    employeeName = connQuery.rows[0].github_username || `${connQuery.rows[0].first_name} ${connQuery.rows[0].last_name}`;
                    console.log(`   ✨ [User Mapping Success] Fallback active: Mapped commit to repository connector: ID ${userId} (${employeeName})`);
                } else {
                    console.warn(`   ❌ [User Mapping Failure] No connecting user register exists in DB for repository "${repoFullName}".`);
                }
            }
        } catch (dbErr) {
            console.error('   ❌ [User Mapping Error] Database query error while checking mappings:', dbErr.message);
        }

        console.log(`\n📝 Commit Details:`);
        console.log(`   SHA          : ${commitHash?.substring(0, 7) || 'N/A'}`);
        console.log(`   Message      : ${commitMessage}`);
        console.log(`   Time         : ${committedAt.toLocaleString()}`);

        // Automatically generate AI single activity explanation at webhook time
        let aiSummaryText = null;
        try {
            console.log(`   🤖 [AI Synthesis] Generating technical insight explanation...`);
            const { generateSingleActivitySummary } = await import('../services/aiService.js');
            aiSummaryText = await generateSingleActivitySummary(commitMessage, employeeName, repoFullName);
            console.log(`   🤖 [AI Success] Summary: "${aiSummaryText}"`);
        } catch (aiErr) {
            console.warn('   ⚠️ [AI Skip/Error] Failed to generate AI summary at webhook time:', aiErr.message);
        }

        const insertedRow = await insertActivity({
            userId,
            employeeName,
            source:         'github',
            activity:       commitMessage,
            repositoryName: repoFullName,
            commitHash,
            committedAt,
            aiSummary:      aiSummaryText
        });

        if (insertedRow) {
            inserted++;
            console.log('   🔌 [Socket.io] Broadcasting realtime activity packet "new_activity" to clients...');
            getIO().emit('new_activity', insertedRow);
        } else {
            skipped++;
        }
    }

    console.log(`\n📊 [Sync Outcome] Complete: ${inserted} synchronised, ${skipped} bypassed/duplicates.`);
}

/**
 * Manual / test payload handler
 */
async function handleManualPayload(payload) {
    const employeeName = (payload.employee_name || '').trim() || 'Unknown';
    const activity     = (payload.activity     || '').trim() || 'Manual entry';

    console.log(`\n👤 [Manual Activity] Employee : ${employeeName}`);
    console.log(`📝 [Manual Activity] Activity : ${activity}`);

    let userId = null;
    try {
        const userQuery = await pool.query('SELECT id FROM users WHERE github_username = $1', [employeeName]);
        if (userQuery.rows.length > 0) {
            userId = userQuery.rows[0].id;
        }
    } catch (err) {
        console.error('Error mapping manual employee to user:', err);
    }

    const insertedRow = await insertActivity({
        userId,
        employeeName,
        source:         'manual',
        activity,
        repositoryName: null,
        commitHash:     null,
        committedAt:    new Date(),
        aiSummary:      null
    });

    if (insertedRow) {
        getIO().emit('new_activity', insertedRow);
    } else {
        console.warn('⚠️  Manual entry was not saved.');
    }
}

/**
 * Main webhook controller
 */
export const handleGithubWebhook = async (req, res) => {
    // Acknowledge webhook delivery to GitHub immediately
    res.status(200).json({ success: true, message: 'Webhook event received and scheduled for parsing' });

    console.log('\n====================================');
    console.log('⚡ WEBHOOK CONTROLLER RECEIVED EVENT');
    console.log('====================================');

    try {
        const payload    = req.body;
        const githubEvent = req.headers['x-github-event'] || 'unknown';

        // STEP 7 — HANDLE COMMON ERRORS
        if (!payload || Object.keys(payload).length === 0) {
            console.error('❌ [Webhook Error] 400 Bad Request: Empty payload received. Body is undefined.');
            return;
        }

        console.log(`📡 GitHub Event Header: ${githubEvent}`);

        const isGithubPush = !!(payload.repository && Array.isArray(payload.commits));
        const isManual     = !!(payload.employee_name && payload.activity);

        console.log(`🔍 Routing Type: isGithubPush=${isGithubPush}, isManual=${isManual}`);

        if (isGithubPush) {
            if (githubEvent !== 'push' && githubEvent !== 'unknown') {
                console.log(`⚠️  [Webhook Route] Bypassing event type "${githubEvent}". Only "push" events are processed.`);
                return;
            }
            await handleGithubPayload(payload);

        } else if (isManual) {
            await handleManualPayload(payload);

        } else {
            console.warn('⚠️  [Webhook Route] Unrecognised or malformed payload layout. Ignoring request.');
        }

        console.log('\n====================================');
        console.log('✅ Webhook process finished successfully');
        console.log('====================================\n');

    } catch (err) {
        console.error('❌ [Webhook Crash] Unexpected critical server error in handler:', err.message);
    }
};
