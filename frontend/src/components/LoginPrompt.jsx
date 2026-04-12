import React, { useState } from 'react';

const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: 24, padding: 20,
  },
  title: { fontSize: 28, fontWeight: 700, color: '#1db954' },
  sub: { color: '#aaa', fontSize: 15, textAlign: 'center', maxWidth: 400 },
  card: {
    background: '#1a1a1a', borderRadius: 12, padding: 32,
    border: '1px solid #2a2a2a', width: '100%', maxWidth: 400,
    display: 'flex', flexDirection: 'column', gap: 20,
  },
  input: {
    padding: '12px 16px', borderRadius: 8, border: '1px solid #333',
    background: '#000', color: '#fff', fontSize: 15, width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '14px 32px', borderRadius: 50, border: 'none', cursor: 'pointer',
    background: '#1db954', color: '#000', fontSize: 16, fontWeight: 700,
    textDecoration: 'none', textAlign: 'center',
  },
  error: { color: '#ff6b6b', fontSize: 14, textAlign: 'center' },
};

export default function LoginPrompt({ error, adminStatus, onLoginSuccess }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setLocalError('');
    try {
      const res = await fetch('/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLoginSuccess();
      } else {
        setLocalError('Invalid admin password');
      }
    } catch (err) {
      setLocalError('Connection failed');
    } finally {
      setLoading(false);
    }
  }

  // If already authenticated as admin but Spotify is not connected
  if (adminStatus?.authenticated && !adminStatus?.spotifyConnected) {
    return (
      <div style={s.wrap}>
        <div style={s.title}>TikTok Song Queue</div>
        <div style={s.sub}>Admin authenticated. Now connect your Spotify to manage the queue.</div>
        <a href="/auth/spotify/start" style={s.btn}>Connect Spotify</a>
        {error && <div style={s.error}>Spotify error: {error}</div>}
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.title}>TikTok Song Queue</div>
      <div style={s.sub}>Enter admin password to access the dashboard</div>
      
      <form style={s.card} onSubmit={handleLogin}>
        <input
          type="password"
          placeholder="Admin password"
          style={s.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit" style={s.btn} disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        {(localError || error) && (
          <div style={s.error}>{localError || error}</div>
        )}
      </form>
    </div>
  );
}
