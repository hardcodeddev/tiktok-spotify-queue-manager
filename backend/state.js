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
  // Epoch ms of the last inbound song request (web or TikTok). Drives idle
  // dormancy: after a period with no activity the playback poller stops calling
  // Spotify entirely, so an unattended tab can't accrue rate-limit pressure.
  lastActivityAt: Date.now(),
  rateLimits: new Map(), // ip -> { count, lastReset }
  // Rounds: the host starts a round with a song limit and shares its unique
  // link (/request/:roundId). Each device may request one song per round; the
  // link stops accepting once the round hits its limit.
  //   roundId -> { id, maxSongs, count, deviceIds: Set<string>,
  //                active, createdAt, closedAt }
  rounds: new Map(),
  activeRoundId: null,
  // request shape: { id, source, requesterName, query, status,
  //   spotifyTrack: { id, uri, name, artist, albumArt } | null,
  //   createdAt, processedAt }
};

module.exports = state;
