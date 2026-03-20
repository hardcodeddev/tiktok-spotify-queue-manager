import React from 'react';

const s = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: 24,
  },
  title: { fontSize: 28, fontWeight: 700, color: '#1db954' },
  sub: { color: '#aaa', fontSize: 15 },
  btn: {
    padding: '14px 32px', borderRadius: 50, border: 'none', cursor: 'pointer',
    background: '#1db954', color: '#000', fontSize: 16, fontWeight: 700,
    textDecoration: 'none', display: 'inline-block',
  },
};

export default function LoginPrompt({ error }) {
  return (
    <div style={s.wrap}>
      <div style={s.title}>TikTok Song Queue</div>
      <div style={s.sub}>Admin dashboard — connect your Spotify to get started</div>
      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 14 }}>
          Auth error: {error}. Please try again.
        </div>
      )}
      <a href="/auth/spotify/start" style={s.btn}>Login with Spotify</a>
    </div>
  );
}
