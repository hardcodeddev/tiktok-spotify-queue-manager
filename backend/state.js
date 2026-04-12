'use strict';

const state = {
  admin: {
    userId: null,
    displayName: null,
    tokens: {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    },
  },
  oauthStates: new Map(), // UUID → { expiresAt } (10-min TTL)
  settings: {
    acceptingRequests: true,
    autoApprove: false,
    autoAddToPlaylist: false,
    selectedPlaylistId: null,
    selectedPlaylistName: null,
    maxQueueSize: 20,
  },
  auth: {
    passwordSet: !!process.env.ADMIN_PASSWORD,
    sessions: new Map(), // sessionId -> expiresAt
  },
  tiktok: {
    connected: false,
    username: null,
    error: null,
  },
  requests: [], // newest first
  rateLimits: new Map(), // ip -> { count, lastReset }
  // request shape: { id, source, requesterName, query, status,
  //   spotifyTrack: { id, uri, name, artist, albumArt } | null,
  //   createdAt, processedAt }
};

module.exports = state;
