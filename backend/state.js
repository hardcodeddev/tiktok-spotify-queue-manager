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
    // Max song requests each authenticated viewer may submit (0 = unlimited).
    // The admin can raise this, set it to unlimited, or reset individuals below.
    requestLimitPerUser: 1,
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
  // Firebase uid -> { count, name, email, lastRequestAt }
  // Tracks how many requests each authenticated viewer has made so the
  // per-person limit (settings.requestLimitPerUser) can be enforced.
  userRequests: new Map(),
  // request shape: { id, source, requesterName, query, status,
  //   spotifyTrack: { id, uri, name, artist, albumArt } | null,
  //   createdAt, processedAt }
};

module.exports = state;
