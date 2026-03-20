'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const state = require('../state');

const router = express.Router();

const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

function requireAdmin(req, res, next) {
  if (!state.admin.tokens.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Clean up expired OAuth states
function pruneStates() {
  const now = Date.now();
  for (const [key, val] of state.oauthStates) {
    if (now > val.expiresAt) state.oauthStates.delete(key);
  }
}

router.get('/spotify/start', (req, res) => {
  pruneStates();
  const stateToken = randomUUID();
  state.oauthStates.set(stateToken, { expiresAt: Date.now() + 10 * 60 * 1000 });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_CALLBACK_URL,
    state: stateToken,
    show_dialog: 'true',
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

router.get('/spotify/callback', async (req, res) => {
  const { code, state: stateToken, error } = req.query;

  if (error) return res.redirect(`${process.env.WEB_ORIGIN}/admin?error=${error}`);

  const storedState = state.oauthStates.get(stateToken);
  if (!storedState || Date.now() > storedState.expiresAt) {
    return res.status(400).send('Invalid or expired state token');
  }
  state.oauthStates.delete(stateToken);

  try {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_CALLBACK_URL } = process.env;
    const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_CALLBACK_URL,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(err);
    }

    const tokenData = await tokenRes.json();
    console.log('[auth] granted scopes:', tokenData.scope);
    state.admin.tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    // Fetch user profile
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    state.admin.userId = profile.id;
    state.admin.displayName = profile.display_name || profile.id;

    // Set session cookie
    res.cookie('tksq_admin', '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.WEB_ORIGIN}/admin`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${process.env.WEB_ORIGIN}/admin?error=oauth_failed`);
  }
});

router.get('/spotify/status', (req, res) => {
  res.json({
    authenticated: !!state.admin.tokens.accessToken,
    displayName: state.admin.displayName,
  });
});

router.post('/spotify/logout', requireAdmin, (req, res) => {
  state.admin.tokens = { accessToken: null, refreshToken: null, expiresAt: null };
  state.admin.userId = null;
  state.admin.displayName = null;
  res.clearCookie('tksq_admin');
  res.json({ ok: true });
});

module.exports = { router, requireAdmin };
