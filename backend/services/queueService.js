'use strict';

const { randomUUID } = require('crypto');
const state = require('../state');
const tokenStore = require('../tokenStore');
const { searchTracks, addToQueue, addToPlaylist, getCurrentlyPlaying } = require('./spotifyClient');

let io; // set via init()

function init(socketIo) {
  io = socketIo;
}

async function processRequest({ source, requesterName, query, track }) {
  if (!state.settings.acceptingRequests) {
    throw new Error('Requests are currently paused');
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

  const request = {
    id,
    source,
    requesterName: requesterName || 'Anonymous',
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

function startPlaybackPoller() {
  setInterval(async () => {
    if (!state.admin.tokens.accessToken) return;

    try {
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
    } catch (err) {
      // console.warn('[poller] error:', err.message);
    }
  }, 2000); // Check every 2 seconds for snappier updates
}

module.exports = { init, processRequest, approveRequest, startPlaybackPoller };
