'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const state = require('../state');
const { requireAdmin } = require('./auth');
const { attachDevice } = require('../middleware/attachDevice');

const router = express.Router();
let io;

function init(socketIo) {
  io = socketIo;
}

// A round is "open" while it is the active round and still under its song
// limit. Once the count reaches maxSongs the link stops accepting requests.
function isOpen(round) {
  return !!round && round.active && round.count < round.maxSongs;
}

// Public shape sent to a viewer for a specific device.
function viewerStatus(round, deviceId) {
  if (!round) {
    return { exists: false, active: false, open: false };
  }
  const alreadyRequested = round.deviceIds.has(deviceId);
  return {
    exists: true,
    id: round.id,
    active: round.active,
    maxSongs: round.maxSongs,
    count: round.count,
    remaining: Math.max(0, round.maxSongs - round.count),
    alreadyRequested,
    open: isOpen(round) && !alreadyRequested,
  };
}

// Admin/dashboard shape (not device-specific).
function adminStatus(round) {
  if (!round) return null;
  return {
    id: round.id,
    active: round.active,
    maxSongs: round.maxSongs,
    count: round.count,
    remaining: Math.max(0, round.maxSongs - round.count),
    open: isOpen(round),
    createdAt: round.createdAt,
    closedAt: round.closedAt,
  };
}

// Broadcast a compact, device-agnostic update so viewers and the dashboard can
// live-update the count and close the form when the round fills or ends.
function emitRoundUpdate(round) {
  io?.emit('round:updated', {
    id: round.id,
    active: round.active,
    maxSongs: round.maxSongs,
    count: round.count,
    open: isOpen(round),
    closedAt: round.closedAt,
  });
}

function closeRound(round) {
  if (!round || !round.active) return;
  round.active = false;
  round.closedAt = new Date().toISOString();
}

// POST /rounds — start a new round (closes any prior active round)
router.post('/', requireAdmin, (req, res) => {
  const maxSongs = Number(req.body?.maxSongs);
  if (!Number.isInteger(maxSongs) || maxSongs < 1) {
    return res.status(400).json({ error: 'maxSongs must be a positive integer' });
  }

  // End the previous round so its link stops accepting requests.
  const prev = state.rounds.get(state.activeRoundId);
  if (prev) {
    closeRound(prev);
    emitRoundUpdate(prev);
  }

  const round = {
    id: randomUUID(),
    maxSongs,
    count: 0,
    deviceIds: new Set(),
    active: true,
    createdAt: new Date().toISOString(),
    closedAt: null,
  };
  state.rounds.set(round.id, round);
  state.activeRoundId = round.id;

  emitRoundUpdate(round);
  res.status(201).json(adminStatus(round));
});

// GET /rounds/active — the current round for the admin dashboard
router.get('/active', requireAdmin, (_req, res) => {
  res.json(adminStatus(state.rounds.get(state.activeRoundId)));
});

// GET /rounds/:id — viewer status for a specific round + this device
router.get('/:id', attachDevice, (req, res) => {
  const round = state.rounds.get(req.params.id);
  res.json(viewerStatus(round, req.deviceId));
});

// POST /rounds/:id/close — admin ends a round early
router.post('/:id/close', requireAdmin, (req, res) => {
  const round = state.rounds.get(req.params.id);
  if (!round) return res.status(404).json({ error: 'Round not found' });
  closeRound(round);
  if (state.activeRoundId === round.id) state.activeRoundId = null;
  emitRoundUpdate(round);
  res.json(adminStatus(round));
});

module.exports = { router, init, isOpen, emitRoundUpdate };
