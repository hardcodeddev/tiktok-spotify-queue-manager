'use strict';

const { randomUUID } = require('crypto');
const state = require('../state');
const tokenStore = require('../tokenStore');
const { searchTracks, addToQueue, addToPlaylist, getCurrentlyPlaying, isRateLimited } = require('./spotifyClient');
const { containsBadWords } = require('./profanity');

let io; // set via init()

function init(socketIo) {
  io = socketIo;
}

async function processRequest({ source, requesterName, query, track, ip, deviceId = null }) {
  // Any inbound request means the site is in use — record it so the playback
  // poller stays awake (and wakes back up from idle dormancy).
  state.lastActivityAt = Date.now();

  if (!state.settings.acceptingRequests) {
    throw new Error('Requests are currently paused');
  }

  // Validate requester name
  if (requesterName && containsBadWords(requesterName)) {
    throw new Error('Please choose a different name');
  }

  // IP rate limiting (5 requests per 10 mins)
  if (ip && source === 'web') {
    const now = Date.now();
    const limit = state.rateLimits.get(ip) || { count: 0, lastReset: now };
    if (now - limit.lastReset > 10 * 60 * 1000) {
      limit.count = 0;
      limit.lastReset = now;
    }
    if (limit.count >= 5) {
      throw new Error('Too many requests. Please wait a few minutes.');
    }
    limit.count++;
    state.rateLimits.set(ip, limit);
  }

  const activeCount = state.requests.filter((r) => r.status !== 'rejected').length;
  if (state.settings.maxQueueSize > 0 && activeCount >= state.settings.maxQueueSize) {
    throw new Error('The request queue is currently full');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  let spotifyTrack = null;
  if (track?.uri?.startsWith('spotify:track:')) {
    spotifyTrack = {
      id: track.id,
      uri: track.uri,
      name: track.name,
      artist: track.artist,
      albumArt: track.albumArt || null,
    };
  } else {
    try {
      spotifyTrack = await searchTracks(query);
    } catch (err) {
      console.error('Search error:', err.message);
    }
  }

  // Duplicate check
  if (spotifyTrack?.uri) {
    const isDuplicate = state.requests.some(
      (r) => (r.status === 'pending' || r.status === 'approved') && r.spotifyTrack?.uri === spotifyTrack.uri
    );
    if (isDuplicate) {
      throw new Error('This song is already in the queue');
    }
  }

  const request = {
    id,
    source,
    requesterName: requesterName || 'Anonymous',
    deviceId,
    query,
    status: 'pending',
    spotifyTrack,
    createdAt: now,
    processedAt: null,
  };

  if (state.settings.autoApprove && spotifyTrack) {
    await approveRequest(request);
    return request;
  }

  state.requests.unshift(request);
  io?.emit('requests:new', request);
  return request;
}

async function approveRequest(request) {
  request.status = 'approved';
  request.processedAt = new Date().toISOString();

  // Add to Spotify queue
  if (request.spotifyTrack?.uri) {
    try {
      await addToQueue(request.spotifyTrack.uri);
    } catch (err) {
      console.warn('Could not add to Spotify queue:', err.message);
      // NO_ACTIVE_DEVICE or other — don't fail approval
    }
  }

  // Optionally add to playlist
  if (
    state.settings.autoAddToPlaylist &&
    state.settings.selectedPlaylistId &&
    request.spotifyTrack?.uri
  ) {
    let res;
    try {
      await addToPlaylist(state.settings.selectedPlaylistId, request.spotifyTrack.uri);
    } catch (err) {
      const isOwnershipBad = err.message === 'OWNERSHIP_MISMATCH' || err.message === 'Forbidden';
      const isScopeBad = err.message === 'INSUFFICIENT_SCOPE';

      if (isOwnershipBad) {
        state.settings.selectedPlaylistId = null;
        state.settings.selectedPlaylistName = null;
        io?.emit('settings:updated', state.settings);
        io?.emit('playlist:error', 'Playlist access denied — please re-select a playlist you own.');
      }

      if (isScopeBad) {
        state.settings.selectedPlaylistId = null;
        state.settings.selectedPlaylistName = null;
        state.admin.tokens = { accessToken: null, refreshToken: null, expiresAt: null, scope: null };
        state.admin.userId = null;
        state.admin.displayName = null;
        tokenStore.clear();
        io?.emit('settings:updated', state.settings);
        io?.emit('auth:required', 'Spotify token is missing playlist write permissions — please re-authenticate.');
      }

      console.warn('Could not add to playlist:', err.message);
    }
  }

  // Ensure it's in state.requests
  const existing = state.requests.find((r) => r.id === request.id);
  if (!existing) {
    state.requests.unshift(request);
  }

  io?.emit('requests:updated', request);
  return request;
}

let lastPlayedUri = null;

const POLL_INTERVAL_MS = 5000; // Base cadence while approved requests await playback.

// After this long with no inbound requests, the site is considered idle and the
// poller stops calling Spotify entirely. Any new request resets the clock and
// wakes it back up. Override with POLL_IDLE_TIMEOUT_MS (ms) if needed.
const IDLE_TIMEOUT_MS = parseInt(process.env.POLL_IDLE_TIMEOUT_MS, 10) || 60 * 60 * 1000; // 1 hour

let dormant = false; // tracked only so we log the transition once, not every tick

function isIdle() {
  return Date.now() - state.lastActivityAt > IDLE_TIMEOUT_MS;
}

// One iteration of the playback reconciliation poll. Returns nothing; all state
// changes happen in place. Kept side-effect-narrow so the scheduler can own the
// timing guarantees.
async function pollPlaybackOnce() {
  if (!state.admin.tokens.accessToken) return;

  // Idle dormancy: if nobody has made a request in a long while, make no Spotify
  // calls at all until activity resumes. This is what keeps an unattended tab
  // from quietly burning through the daily rate limit.
  if (isIdle()) {
    if (!dormant) {
      dormant = true;
      console.log('[poller] idle — no requests recently; pausing Spotify polling until activity resumes');
    }
    return;
  }
  if (dormant) {
    dormant = false;
    console.log('[poller] activity resumed — polling Spotify again');
  }

  // Respect an active Spotify rate-limit backoff window.
  if (isRateLimited()) return;

  // The poll only exists to mark approved requests as "played" once they
  // come up in playback. If nothing is awaiting playback, don't call Spotify
  // at all — this is what keeps us under the rate limit during idle periods.
  const hasApprovedAwaitingPlay = state.requests.some((r) => r.status === 'approved');
  if (!hasApprovedAwaitingPlay) return;

  const playing = await getCurrentlyPlaying();
  if (!playing) {
    lastPlayedUri = null;
    return;
  }

  if (playing.uri === lastPlayedUri) return;

  // Find the oldest approved request that matches this track
  // (searching from the end because state.requests is unshifted/newest-first)
  const request = [...state.requests].reverse().find(
    (r) => r.status === 'approved' && r.spotifyTrack?.uri === playing.uri
  );

  if (request) {
    request.status = 'played';
    request.processedAt = new Date().toISOString();
    lastPlayedUri = playing.uri;
    io?.emit('requests:updated', request);
    console.log(`[poller] marked request ${request.id} as played: ${playing.name}`);
  } else {
    // If we see a song that wasn't in our approved list, update lastPlayedUri
    // anyway so we don't keep searching for it.
    lastPlayedUri = playing.uri;
  }
}

function startPlaybackPoller() {
  // Self-scheduling loop instead of setInterval: the next poll is only queued
  // AFTER the current one settles. This makes overlapping/stacked ticks
  // structurally impossible — if a poll ever stalls, ticks can't pile up behind
  // it and then release in a burst against Spotify. Each Spotify call is also
  // bounded by a request timeout in spotifyClient, so a poll cannot hang forever.
  const scheduleNext = () => setTimeout(runPoll, POLL_INTERVAL_MS);

  async function runPoll() {
    try {
      await pollPlaybackOnce();
    } catch (err) {
      // Swallow — a transient Spotify/network error must not kill the loop.
      // console.warn('[poller] error:', err.message);
    } finally {
      scheduleNext();
    }
  }

  scheduleNext();
}

module.exports = { init, processRequest, approveRequest, startPlaybackPoller };
