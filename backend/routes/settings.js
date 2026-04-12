'use strict';

const express = require('express');
const state = require('../state');
const { requireAdmin } = require('./auth');

const router = express.Router();
let io;

function init(socketIo) {
  io = socketIo;
}

router.get('/', requireAdmin, (req, res) => {
  res.json(state.settings);
});

router.patch('/', requireAdmin, (req, res) => {
  const allowed = [
    'acceptingRequests',
    'autoApprove',
    'autoAddToPlaylist',
    'selectedPlaylistId',
    'selectedPlaylistName',
    'maxQueueSize',
  ];

  for (const key of allowed) {
    if (key in req.body) {
      state.settings[key] = req.body[key];
    }
  }

  io?.emit('settings:updated', state.settings);
  res.json(state.settings);
});

module.exports = { router, init };
