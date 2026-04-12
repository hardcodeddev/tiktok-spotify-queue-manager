'use strict';

const express = require('express');
const state = require('../state');
const { requireAdmin } = require('./auth');
const { processRequest, approveRequest } = require('../services/queueService');

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

// POST /requests — public
router.post('/', async (req, res) => {
  const { query, requesterName, track } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  // Validate optional pre-selected track
  const validTrack =
    track && typeof track.uri === 'string' && track.uri.startsWith('spotify:track:')
      ? track
      : null;

  try {
    const request = await processRequest({
      source: 'web',
      requesterName: requesterName?.trim() || 'Anonymous',
      query: query.trim(),
      track: validTrack,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });
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
