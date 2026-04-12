'use strict';

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data', 'tokens.json');

function load() {
  let attempts = 0;
  while (attempts < 5) {
    try {
      if (!fs.existsSync(FILE)) return null;
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (err) {
      const isRetryable = err.errno === -35 || err.code?.includes('-35');
      if (isRetryable && attempts < 4) {
        attempts++;
        const sab = new SharedArrayBuffer(4);
        const int32 = new Int32Array(sab);
        Atomics.wait(int32, 0, 0, 100); 
        continue;
      }
      return null;
    }
  }
}

function save({ tokens, userId, displayName, scope }) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const data = JSON.stringify({ tokens, userId, displayName, scope }, null, 2);

  // Retry logic for Docker volume -35 error
  let attempts = 0;
  while (attempts < 5) {
    try {
      fs.writeFileSync(FILE, data);
      return;
    } catch (err) {
      const isRetryable = err.errno === -35 || err.code?.includes('-35');
      if (isRetryable && attempts < 4) {
        attempts++;
        // Small synchronous delay before retrying
        const sab = new SharedArrayBuffer(4);
        const int32 = new Int32Array(sab);
        Atomics.wait(int32, 0, 0, 100); 
        continue;
      }
      throw err;
    }
  }
}

function clear() {
  try { fs.unlinkSync(FILE); } catch {}
}

module.exports = { load, save, clear };
