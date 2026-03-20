import React, { useState } from 'react';

const s = {
  card: {
    background: '#1a1a1a', borderRadius: 12, padding: '20px 24px',
    border: '1px solid #2a2a2a',
  },
  title: { fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' },
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  input: {
    flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
    background: '#111', color: '#e0e0e0', fontSize: 14, minWidth: 180,
  },
  btn: (color) => ({
    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: color, color: color === '#ff4444' ? '#fff' : '#000',
    fontSize: 14, fontWeight: 600,
  }),
  status: (connected) => ({
    fontSize: 13, color: connected ? '#1db954' : '#aaa', marginTop: 8,
  }),
  error: { fontSize: 13, color: '#ff6b6b', marginTop: 8 },
};

export default function TikTokConnect({ tiktok }) {
  const [username, setUsername] = useState(tiktok?.username || '');
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    if (!username.trim()) return;
    setLoading(true);
    try {
      await fetch('/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
        credentials: 'include',
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch('/tiktok/disconnect', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.title}>TikTok Live</div>
      <div style={s.row}>
        <input
          style={s.input}
          placeholder="@username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={tiktok?.connected || loading}
          onKeyDown={(e) => e.key === 'Enter' && !tiktok?.connected && handleConnect()}
        />
        {tiktok?.connected ? (
          <button style={s.btn('#ff4444')} onClick={handleDisconnect} disabled={loading}>
            Disconnect
          </button>
        ) : (
          <button style={s.btn('#1db954')} onClick={handleConnect} disabled={loading || !username.trim()}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
      {tiktok?.connected && (
        <div style={s.status(true)}>Connected to @{tiktok.username} — listening for !song requests</div>
      )}
      {tiktok?.error && <div style={s.error}>{tiktok.error}</div>}
    </div>
  );
}
