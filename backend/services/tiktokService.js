'use strict';

const state = require('../state');
const { processRequest } = require('./queueService');

let io;
let connection = null;

function init(socketIo) {
  io = socketIo;
}

async function connect(username) {
  if (connection) await disconnect();

  state.tiktok = { connected: false, username, error: null };

  try {
    // tiktok-live-connector v2 exports WebcastPushConnection
    const { WebcastPushConnection } = require('tiktok-live-connector');

    const opts = { processInitialData: false };
    if (process.env.TIKTOK_SIGN_API_KEY) {
      opts.signApiKey = process.env.TIKTOK_SIGN_API_KEY;
    }

    connection = new WebcastPushConnection(username, opts);

    // v2 uses 'chat' event; each message has .comment and .uniqueId
    connection.on('chat', (data) => {
      const msg = (data.comment || '').trim();
      if (!msg.toLowerCase().startsWith('!song ')) return;
      const query = msg.slice(6).trim();
      if (!query) return;
      processRequest({
        source: 'tiktok',
        requesterName: data.uniqueId || username,
        query,
      }).catch(console.error);
    });

    connection.on('disconnected', () => {
      state.tiktok.connected = false;
      io?.emit('tiktok:status', { ...state.tiktok });
      connection = null;
    });

    connection.on('error', (err) => {
      console.error('TikTok connection error:', err?.message || err);
    });

    await connection.connect();
    state.tiktok.connected = true;
    state.tiktok.error = null;
    io?.emit('tiktok:status', { ...state.tiktok });
  } catch (err) {
    const message = err?.message || String(err);
    state.tiktok.connected = false;
    state.tiktok.error = message.toLowerCase().includes('not live')
      ? `@${username} is not currently live`
      : message;
    connection = null;
    io?.emit('tiktok:status', { ...state.tiktok });
    throw new Error(state.tiktok.error);
  }
}

async function disconnect() {
  if (connection) {
    try {
      connection.disconnect();
    } catch (_) {}
    connection = null;
  }
  state.tiktok = { ...state.tiktok, connected: false };
  io?.emit('tiktok:status', { ...state.tiktok });
}

module.exports = { init, connect, disconnect };
