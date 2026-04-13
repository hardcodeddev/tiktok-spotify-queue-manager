'use strict';

const express = require('express');
const { requireAdmin } = require('./auth');
const { searchTracksMulti, getUserPlaylists, createPlaylist } = require('../services/spotifyClient');


const router = express.Router();

// GET /spotify/search?q=
router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q is required' });
  const limit = Math.min(parseInt(req.query.limit, 10) || 6, 10);
  try {
    const tracks = await searchTracksMulti(q, limit);
    res.json(tracks);
  } catch (err) {
    const status = err.status === 401 ? 401 : 500;
    const code = err.code || 'SEARCH_ERROR';
    console.error(`[spotify/search] ${code}:`, err.message);
    res.status(status).json({ error: err.message, code });
  }
});

// GET /spotify/playlists
router.get('/playlists', requireAdmin, async (req, res) => {
  try {
    const playlists = await getUserPlaylists();
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /spotify/playlists
router.post('/playlists', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const playlist = await createPlaylist(name);
    res.status(201).json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
