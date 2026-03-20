'use strict';

const { randomUUID } = require('crypto');
const state = require('../state');
const tokenStore = require('../tokenStore');
const { searchTracks, addToQueue, addToPlaylist } = require('./spotifyClient');

let io; // set via init()

function init(socketIo) {
  io = socketIo;
}

async function processRequest({ source, requesterName, query, track }) {
  if (!state.settings.acceptingRequests) return;

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

module.exports = { init, processRequest, approveRequest };
