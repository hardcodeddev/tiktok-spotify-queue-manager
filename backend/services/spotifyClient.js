'use strict';

const state = require('../state');
const tokenStore = require('../tokenStore');

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

let refreshing = false;

async function getValidAccessToken() {
  const { tokens } = state.admin;
  if (!tokens.accessToken) throw new Error('Not authenticated');

  const needsRefresh = tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000;
  if (!needsRefresh) return tokens.accessToken;

  if (refreshing) {
    // Wait for the in-flight refresh
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!refreshing) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    return tokens.accessToken;
  }

  refreshing = true;
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: process.env.SPOTIFY_CLIENT_ID,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token refresh failed: ${err}`);
    }

    const data = await res.json();
    tokens.accessToken = data.access_token;
    tokens.expiresAt = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) tokens.refreshToken = data.refresh_token;
    if (data.scope) state.admin.tokens.scope = data.scope;
    tokenStore.save({
      tokens: state.admin.tokens,
      userId: state.admin.userId,
      displayName: state.admin.displayName,
      scope: state.admin.tokens.scope,
    });

    return tokens.accessToken;
  } finally {
    refreshing = false;
  }
}

async function spotifyFetch(path, opts = {}, retry = true) {
  const token = await getValidAccessToken();
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401 && retry) {
    // Force refresh and retry once
    state.admin.tokens.expiresAt = 0;
    return spotifyFetch(path, opts, false);
  }

  return res;
}

async function searchTracks(q) {
  const res = await spotifyFetch(`/search?q=${encodeURIComponent(q)}&type=track&limit=1`);
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.tracks?.items?.[0];
  if (!track) return null;
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumArt: track.album.images?.[0]?.url || null,
  };
}

async function searchTracksMulti(q, limit = 6) {
  // "Song - Artist" / "Song — Artist" is a common human format but confuses
  // Spotify's search engine. Strip the separator and let Spotify handle the
  // combined keywords — it reliably finds the right track this way.
  const cleaned = q.replace(/\s+[-—]\s+/g, ' ').trim();
  const res = await spotifyFetch(`/search?q=${encodeURIComponent(cleaned)}&type=track&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tracks?.items ?? []).map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    albumArt: t.album.images?.[0]?.url || null,
  }));
}

async function addToQueue(uri) {
  const res = await spotifyFetch(`/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.reason || `HTTP ${res.status}`;
    throw new Error(reason);
  }
}

async function getUserPlaylists() {
  const res = await spotifyFetch('/me/playlists?limit=50');
  if (!res.ok) throw new Error('Failed to fetch playlists');
  const data = await res.json();
  return data.items
    .filter((p) => p.owner?.id === state.admin.userId)
    .map((p) => ({ id: p.id, name: p.name, public: p.public }));
}

async function createPlaylist(name) {
  const res = await spotifyFetch('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, public: false, description: 'TikTok song requests' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return { id: data.id, name: data.name };
}

async function addToPlaylist(playlistId, uri) {
  const res = await spotifyFetch(`/playlists/${playlistId}/items`, {
    method: 'POST',
    body: JSON.stringify({ uris: [uri] }),
  });
  if (!res.ok) {
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message || '';
      console.error('[addToPlaylist] 403 from Spotify:', msg || '(no message)');
      if (msg.toLowerCase().includes('insufficient client scope')) {
        throw new Error('INSUFFICIENT_SCOPE');
      }
      throw new Error('Forbidden');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
}

async function getCurrentlyPlaying() {
  const res = await spotifyFetch('/me/player/currently-playing');
  if (res.status === 204 || !res.ok) return null;
  const data = await res.json();
  if (!data.item || !data.is_playing) return null;
  return {
    id: data.item.id,
    uri: data.item.uri,
    name: data.item.name,
    artist: data.item.artists.map((a) => a.name).join(', '),
    progress_ms: data.progress_ms,
    duration_ms: data.item.duration_ms,
  };
}

module.exports = {
  getValidAccessToken,
  searchTracks,
  searchTracksMulti,
  addToQueue,
  getUserPlaylists,
  createPlaylist,
  addToPlaylist,
  getCurrentlyPlaying,
};
