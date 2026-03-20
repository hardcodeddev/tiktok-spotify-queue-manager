'use strict';

const express = require('express');
const { randomUUID, randomBytes, createHash } = require('crypto');

function generateCodeVerifier() {
  // 96 random bytes → 128-char base64url string, within the 43–128 range required by PKCE
  return randomBytes(96).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}
const state = require('../state');
const tokenStore = require('../tokenStore');

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
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  state.oauthStates.set(stateToken, { expiresAt: Date.now() + 10 * 60 * 1000, codeVerifier });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_CALLBACK_URL,
    state: stateToken,
    show_dialog: 'true',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
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
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CALLBACK_URL } = process.env;

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_CALLBACK_URL,
        client_id: SPOTIFY_CLIENT_ID,
        code_verifier: storedState.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(err);
    }

    const tokenData = await tokenRes.json();
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
    const userId = profile.id;
    const displayName = profile.display_name || profile.id;
    state.admin.userId = userId;
    state.admin.displayName = displayName;
    state.admin.tokens.scope = tokenData.scope;
    tokenStore.save({ tokens: state.admin.tokens, userId, displayName, scope: tokenData.scope });

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
  state.settings.selectedPlaylistId = null;
  state.settings.selectedPlaylistName = null;
  tokenStore.clear();
  res.clearCookie('tksq_admin');
  res.json({ ok: true });
});

module.exports = { router, requireAdmin };
