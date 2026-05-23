import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { pool } from '../database/db.js';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (res.rows.length > 0) {
      done(null, res.rows[0]);
    } else {
      done(new Error('User not found'));
    }
  } catch (err) {
    done(err);
  }
});

export const initPassport = () => {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID || 'dummy_id',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || 'dummy_secret',
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/auth/github/callback',
        scope: ['user:email', 'admin:repo_hook', 'repo'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const githubId = String(profile.id);
          const username = profile.username;
          const avatar = profile.photos?.[0]?.value || '';
          const email = profile.emails?.[0]?.value || '';

          console.log(`[OAuth] GitHub callback success for ${username}. Storing access token.`);

          // Let's see if user exists, otherwise create
          const selectRes = await pool.query('SELECT * FROM users WHERE github_id = $1', [githubId]);
          let user;

          const countRes = await pool.query('SELECT count(*) FROM users');
          const isFirstUser = parseInt(countRes.rows[0].count) === 0;
          const role = isFirstUser ? 'admin' : 'developer';

          if (selectRes.rows.length > 0) {
            // Update access token, email and avatar
            const updateRes = await pool.query(
              `UPDATE users 
               SET github_access_token = $1, github_avatar = $2, github_email = $3
               WHERE github_id = $4 
               RETURNING *`,
              [accessToken, avatar, email, githubId]
);
            user = updateRes.rows[0];
          } else {
            const insertRes = await pool.query(
              `INSERT INTO users (github_id, github_username, github_avatar, github_email, github_access_token, role)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *`,
              [githubId, username, avatar, email, accessToken, role]
            );
            user = insertRes.rows[0];
          }

          return done(null, user);
        } catch (err) {
          console.error('[OAuth] Error in Passport Strategy callback:', err);
          return done(err);
        }
      }
    )
  );
};
