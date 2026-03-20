'use strict';

require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const state = require('./state');
const tokenStore = require('./tokenStore');
const saved = tokenStore.load();
if (saved) {
  const scope = saved.scope || '';
  const hasWriteScopes =
    scope.includes('playlist-modify-public') &&
    scope.includes('playlist-modify-private');
  if (hasWriteScopes) {
    state.admin.tokens = { ...saved.tokens, scope };
    state.admin.userId = saved.userId;
    state.admin.displayName = saved.displayName;
    console.log('[startup] restored Spotify session for', saved.displayName);
  } else {
    tokenStore.clear();
    console.warn('[startup] persisted token missing required write scopes — session invalidated, please re-authenticate');
  }
}
const { router: authRouter } = require('./routes/auth');
const spotifyRouter = require('./routes/spotify');
const { router: requestsRouter, init: initRequests } = require('./routes/requests');
const { router: settingsRouter, init: initSettings } = require('./routes/settings');
const queueService = require('./services/queueService');
const tiktokService = require('./services/tiktokService');

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: {
    origin: WEB_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Init all services with socket.io
queueService.init(io);
tiktokService.init(io);
initRequests(io);
initSettings(io);

// Middleware
app.use(cors({ origin: WEB_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/auth', authRouter);
app.use('/spotify', spotifyRouter);
app.use('/requests', requestsRouter);
app.use('/settings', settingsRouter);

// TikTok routes
app.post('/tiktok/connect', async (req, res) => {
  if (!state.admin.tokens.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  try {
    await tiktokService.connect(username.replace('@', '').trim());
    res.json(state.tiktok);
  } catch (err) {
    res.status(400).json({ error: err.message, tiktok: state.tiktok });
  }
});

app.post('/tiktok/disconnect', async (req, res) => {
  if (!state.admin.tokens.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  await tiktokService.disconnect();
  res.json(state.tiktok);
});

app.get('/tiktok/status', (req, res) => {
  if (!state.admin.tokens.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  res.json(state.tiktok);
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Socket.io — send initial state on connect
io.on('connection', (socket) => {
  socket.emit('init', {
    settings: state.settings,
    tiktok: state.tiktok,
    requests: state.requests,
    admin: {
      authenticated: !!state.admin.tokens.accessToken,
      displayName: state.admin.displayName,
    },
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
