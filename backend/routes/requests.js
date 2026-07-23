'use strict';

const express = require('express');
const state = require('../state');
const { requireAdmin } = require('./auth');
const { attachDevice } = require('../middleware/attachDevice');
const { emitRoundUpdate } = require('./rounds');
const { processRequest, approveRequest } = require('../services/queueService');
const { containsBadWords } = require('../services/profanity');

const MAX_NAME_LENGTH = 40;

const router = express.Router();
let io;

function init(socketIo) {
  io = socketIo;
}

// GET /requests
router.get('/', (req, res) => {
  const isAdmin = !!state.admin.tokens.accessToken;
  const requests = isAdmin
    ? state.requests
    : state.requests.filter((r) => r.status === 'approved');
  res.json(requests);
});

// POST /requests — a viewer submits via a round link. No login: the device is
// identified by a signed cookie so it may request only one song per round.
router.post('/', attachDevice, async (req, res) => {
  const { query, requesterName, track, roundId } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!roundId || typeof roundId !== 'string') {
    return res.status(400).json({
      error: 'Please open the current request link shared by the host.',
      code: 'ROUND_CLOSED',
    });
  }

  // The display name is ONLY what the viewer types. A blank name means the
  // viewer stays anonymous — there is no account behind a request anymore.
  const chosenName = typeof requesterName === 'string' ? requesterName.trim() : '';
  if (chosenName && containsBadWords(chosenName)) {
    return res.status(400).json({
      error: 'Please choose a different name.',
      code: 'INVALID_NAME',
    });
  }
  const displayName = chosenName ? chosenName.slice(0, MAX_NAME_LENGTH) : 'Anonymous';

  // Round enforcement (order matters): closed link → already-requested → full.
  const round = state.rounds.get(roundId);
  if (!round || !round.active) {
    return res.status(403).json({
      error: 'This request link is closed. Please wait for the host to share a new link.',
      code: 'ROUND_CLOSED',
    });
  }
  if (round.deviceIds.has(req.deviceId)) {
    return res.status(429).json({
      error: 'You have already requested a song this round.',
      code: 'DEVICE_ALREADY_REQUESTED',
    });
  }
  if (round.count >= round.maxSongs) {
    return res.status(403).json({
      error:
        'The request limit for this round has been reached. Please wait for the host to share a new link.',
      code: 'ROUND_FULL',
    });
  }

  // Validate optional pre-selected track
  const validTrack =
    track && typeof track.uri === 'string' && track.uri.startsWith('spotify:track:')
      ? track
      : null;

  try {
    const request = await processRequest({
      source: 'web',
      requesterName: displayName,
      deviceId: req.deviceId,
      query: query.trim(),
      track: validTrack,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    // Count the submission toward the round only once it was accepted. This
    // device is now locked out for the rest of the round; when the count hits
    // maxSongs the link stops accepting (isOpen() computes false).
    round.deviceIds.add(req.deviceId);
    round.count += 1;
    emitRoundUpdate(round);

    res.status(201).json(request);
  } catch (err) {
    if (err.message === 'Requests are currently paused') {
      return res.status(503).json({ error: err.message });
    }
    if (err.message === 'The request queue is currently full') {
      return res.status(403).json({ error: err.message });
    }
    console.error('processRequest error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /requests/:id/approve
router.post('/:id/approve', requireAdmin, async (req, res) => {
  const request = state.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  try {
    await approveRequest(request);
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /requests/:id/reject
router.post('/:id/reject', requireAdmin, (req, res) => {
  const request = state.requests.find((r) => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  request.status = 'rejected';
  request.processedAt = new Date().toISOString();

  io?.emit('requests:updated', request);
  res.json(request);
});

// DELETE /requests/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const idx = state.requests.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });

  state.requests.splice(idx, 1);
  io?.emit('requests:removed', { id: req.params.id });
  res.json({ ok: true });
});

module.exports = { router, init };
