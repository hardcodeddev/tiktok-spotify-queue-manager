'use strict';

// Firebase Admin initialization for verifying viewer ID tokens.
//
// Credentials are read from the environment. Provide ONE of the following:
//   1. FIREBASE_SERVICE_ACCOUNT  — the full service-account JSON as a string
//   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
//   3. GOOGLE_APPLICATION_CREDENTIALS — path to a service-account file
//      (handled automatically by applicationDefault())

let admin;
try {
  admin = require('firebase-admin');
} catch (err) {
  console.warn('[firebase] firebase-admin not installed — run `npm install` in backend/');
}

let initialized = false;

function init() {
  if (initialized || !admin) return initialized;

  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(json);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Private keys stored in env files keep literal "\n" sequences.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      credential = admin.credential.applicationDefault();
    } else {
      console.warn(
        '[firebase] No credentials configured — viewer authentication is DISABLED. ' +
          'Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
      );
      return false;
    }

    admin.initializeApp({ credential });
    initialized = true;
    console.log('[firebase] Admin SDK initialized — viewer authentication enabled.');
  } catch (err) {
    console.error('[firebase] Failed to initialize Admin SDK:', err.message);
    initialized = false;
  }

  return initialized;
}

function isConfigured() {
  return initialized;
}

// Verifies a Firebase ID token and returns the decoded token, or throws.
async function verifyIdToken(idToken) {
  if (!initialized) throw new Error('Firebase authentication is not configured');
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { init, isConfigured, verifyIdToken };
