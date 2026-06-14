import { useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, googleProvider, firebaseEnabled } from './firebase.js';

// Manages the viewer's Firebase auth state and exposes helpers for
// signing in/out and fetching a fresh ID token for API calls.
export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(firebaseEnabled);

  useEffect(() => {
    if (!firebaseEnabled) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = useCallback(async () => {
    if (!firebaseEnabled) throw new Error('Authentication is not configured');
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    if (!firebaseEnabled) return;
    await fbSignOut(auth);
  }, []);

  // Returns a fresh ID token (or null if signed out).
  const getToken = useCallback(async () => {
    if (!firebaseEnabled || !auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return { user, loading, firebaseEnabled, signIn, signOut, getToken };
}
