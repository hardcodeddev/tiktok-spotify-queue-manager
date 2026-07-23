'use strict';

const { randomUUID } = require('crypto');

const COOKIE_NAME = 'tksq_device';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Identifies the requesting device via a signed httpOnly cookie so the
 * per-round "one song per device" limit can be enforced without any login.
 * Reads the existing `tksq_device` cookie, or mints a new UUID and sets it.
 * Populates `req.deviceId`.
 *
 * Relies on `cookieParser(SESSION_SECRET)` being installed (see server.js).
 */
function attachDevice(req, res, next) {
  let deviceId = req.signedCookies?.[COOKIE_NAME];

  if (!deviceId) {
    deviceId = randomUUID();
    res.cookie(COOKIE_NAME, deviceId, {
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE,
    });
  }

  req.deviceId = deviceId;
  next();
}

module.exports = { attachDevice, COOKIE_NAME };
