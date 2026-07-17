'use strict';

const express = require('express');
const state = require('../state');
const { requireAdmin } = require('./auth');
const { requireUser } = require('../middleware/requireUser');
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

// POST /requests — requires an authenticated (Firebase) viewer
router.post('/', requireUser, async (req, res) => {
  const { query, requesterName, track } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  // The display name is ONLY what the viewer types. We never fall back to the
  // Google account name — sign-in exists purely to enforce the per-person limit,
  // not to reveal the viewer's real identity to the host or the stream. A blank
  // name means the viewer stays anonymous.
  const chosenName = typeof requesterName === 'string' ? requesterName.trim() : '';
  if (chosenName && containsBadWords(chosenName)) {
    return res.status(400).json({
      error: 'Please choose a different name.',
      code: 'INVALID_NAME',
    });
  }
  const displayName = chosenName ? chosenName.slice(0, MAX_NAME_LENGTH) : 'Anonymous';

  const { uid, email } = req.user;

  // Per-person request limit. The admin controls the cap via
  // settings.requestLimitPerUser (0 = unlimited) and can reset individuals.
  const limit = state.settings.requestLimitPerUser;
  const usage = state.userRequests.get(uid) || { count: 0, name: displayName, email, lastRequestAt: null };
  if (limit > 0 && usage.count >= limit) {
    return res.status(429).json({
      error:
        limit === 1
          ? 'You have already requested a song.'
          : `You have reached your limit of ${limit} requests.`,
      code: 'USER_LIMIT_REACHED',
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
      userId: uid,
      query: query.trim(),
      track: validTrack,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    // Only count the request once it was accepted into the queue.
    usage.count += 1;
    usage.name = displayName;
    usage.email = email;
    usage.lastRequestAt = new Date().toISOString();
    state.userRequests.set(uid, usage);

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

// GET /requests/me — current viewer's remaining request allowance
router.get('/me', requireUser, (req, res) => {
  const limit = state.settings.requestLimitPerUser;
  const usage = state.userRequests.get(req.user.uid);
  const used = usage?.count || 0;
  res.json({
    limit,
    used,
    remaining: limit === 0 ? null : Math.max(0, limit - used),
    canRequest: limit === 0 || used < limit,
  });
});

// GET /requests/users — admin view of per-person usage
router.get('/users', requireAdmin, (_req, res) => {
  const users = [...state.userRequests.entries()].map(([uid, u]) => ({
    uid,
    name: u.name,
    email: u.email,
    count: u.count,
    lastRequestAt: u.lastRequestAt,
  }));
  res.json(users);
});

// POST /requests/users/:uid/reset — admin override: clear a person's used count
router.post('/users/:uid/reset', requireAdmin, (req, res) => {
  state.userRequests.delete(req.params.uid);
  res.json({ ok: true });
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
