'use strict';

const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data', 'tokens.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return null; }
}

function save({ tokens, userId, displayName, scope }) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ tokens, userId, displayName, scope }, null, 2));
}

function clear() {
  try { fs.unlinkSync(FILE); } catch {}
}

module.exports = { load, save, clear };
