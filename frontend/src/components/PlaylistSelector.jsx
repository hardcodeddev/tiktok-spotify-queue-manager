import React, { useEffect, useState } from 'react';

const s = {
  card: {
    background: '#1a1a1a', borderRadius: 12, padding: '20px 24px',
    border: '1px solid #2a2a2a',
  },
  title: { fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' },
  select: {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #333', background: '#111', color: '#e0e0e0',
    fontSize: 14, marginBottom: 12,
  },
  row: { display: 'flex', gap: 10 },
  input: {
    flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
    background: '#111', color: '#e0e0e0', fontSize: 14,
  },
  btn: {
    padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#1db954', color: '#000', fontSize: 14, fontWeight: 600,
  },
  btnDisabled: {
    padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'not-allowed',
    background: '#2a2a2a', color: '#666', fontSize: 14, fontWeight: 600,
  },
  selected: { fontSize: 13, color: '#1db954', marginTop: 8 },
  error: { fontSize: 13, color: '#ff6b6b', marginTop: 8 },
};

export default function PlaylistSelector({ settings }) {
  const [playlists, setPlaylists] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/spotify/playlists', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setPlaylists(data);
      })
      .catch((err) => console.error('Failed to load playlists:', err));
  }, []);

  function selectPlaylist(id) {
    const pl = playlists.find((p) => p.id === id);
    fetch('/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPlaylistId: id || null, selectedPlaylistName: pl?.name || null }),
      credentials: 'include',
    }).catch(console.error);
  }

  async function createPlaylist() {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/spotify/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create playlist');
        return;
      }
      setPlaylists((prev) => [data, ...prev]);
      selectPlaylist(data.id);
      setNewName('');
    } catch (err) {
      setError(err.message || 'Failed to create playlist');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.card}>
      <div style={s.title}>Playlist</div>
      <select
        style={s.select}
        value={settings.selectedPlaylistId || ''}
        onChange={(e) => selectPlaylist(e.target.value)}
      >
        <option value="">— Select a playlist —</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <div style={s.row}>
        <input
          style={s.input}
          placeholder="New playlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
        />
        <button
          style={loading || !newName.trim() ? s.btnDisabled : s.btn}
          onClick={createPlaylist}
          disabled={loading || !newName.trim()}
        >
          {loading ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {settings.selectedPlaylistName && !error && (
        <div style={s.selected}>Active: {settings.selectedPlaylistName}</div>
      )}
    </div>
  );
}
