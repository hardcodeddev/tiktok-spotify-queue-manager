import React from 'react';

const s = {
  card: {
    background: '#1a1a1a', borderRadius: 12, padding: '20px 24px',
    border: '1px solid #2a2a2a',
  },
  title: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#e0e0e0' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  label: { fontSize: 14, color: '#ccc' },
  toggle: (active) => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: active ? '#1db954' : '#444', position: 'relative', padding: 0,
    transition: 'background 0.2s',
  }),
  knob: (active) => ({
    position: 'absolute', top: 3, left: active ? 23 : 3, width: 18, height: 18,
    borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
  }),
};

function Toggle({ value, onChange }) {
  return (
    <button style={s.toggle(value)} onClick={() => onChange(!value)}>
      <span style={s.knob(value)} />
    </button>
  );
}

export default function SettingsPanel({ settings, onUpdate }) {
  function patch(key, value) {
    fetch('/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
      credentials: 'include',
    }).catch(console.error);
    onUpdate({ ...settings, [key]: value });
  }

  return (
    <div style={s.card}>
      <div style={s.title}>Settings</div>
      <div style={s.row}>
        <span style={s.label}>Accepting Requests</span>
        <Toggle value={settings.acceptingRequests} onChange={(v) => patch('acceptingRequests', v)} />
      </div>
      <div style={s.row}>
        <span style={s.label}>Auto-Approve</span>
        <Toggle value={settings.autoApprove} onChange={(v) => patch('autoApprove', v)} />
      </div>
      <div style={s.row}>
        <span style={s.label}>Auto-Add to Playlist</span>
        <Toggle value={settings.autoAddToPlaylist} onChange={(v) => patch('autoAddToPlaylist', v)} />
      </div>
    </div>
  );
}
