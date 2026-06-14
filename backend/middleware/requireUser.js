'use strict';

const firebase = require('../firebase');

// Express middleware that requires a valid Firebase ID token.
// The token is read from the `Authorization: Bearer <idToken>` header.
// On success, `req.user` is populated with { uid, name, email }.
async function requireUser(req, res, next) {
  if (!firebase.isConfigured()) {
    return res.status(503).json({
      error: 'Authentication is not configured on the server',
      code: 'AUTH_NOT_CONFIGURED',
    });
  }

  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: 'Sign in required to make a request',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const decoded = await firebase.verifyIdToken(match[1]);
    req.user = {
      uid: decoded.uid,
      name: decoded.name || decoded.email || 'Anonymous',
      email: decoded.email || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Your session has expired — please sign in again',
      code: 'AUTH_INVALID',
    });
  }
}

module.exports = { requireUser };
