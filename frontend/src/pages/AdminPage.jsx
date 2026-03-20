import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import socket from '../socket.js';
import LoginPrompt from '../components/LoginPrompt.jsx';
import TikTokConnect from '../components/TikTokConnect.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import RequestQueue from '../components/RequestQueue.jsx';

const s = {
  page: { maxWidth: 800, margin: '0 auto', padding: '32px 16px' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32,
  },
  title: { fontSize: 24, fontWeight: 700, color: '#1db954' },
  userRow: { display: 'flex', alignItems: 'center', gap: 12 },
  displayName: { fontSize: 14, color: '#aaa' },
  logoutBtn: {
    padding: '6px 14px', borderRadius: 6, border: '1px solid #333',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: 13,
  },
  grid: { display: 'flex', flexDirection: 'column', gap: 16 },
  shareBox: {
    background: '#1a1a1a', borderRadius: 12, padding: '16px 20px',
    border: '1px solid #2a2a2a',
  },
  shareTitle: { fontSize: 14, color: '#aaa', marginBottom: 8 },
  shareUrl: {
    fontSize: 13, color: '#1db954', wordBreak: 'break-all',
    fontFamily: 'monospace',
  },
};

export default function AdminPage() {
  const [searchParams] = useSearchParams();
  const [authStatus, setAuthStatus] = useState(null); // null=loading, false=not authed, true=authed
  const [displayName, setDisplayName] = useState('');
  const [settings, setSettings] = useState(null);
  const [tiktok, setTiktok] = useState(null);
  const [requests, setRequests] = useState([]);
  const [playlistError, setPlaylistError] = useState(null);
  const [newIds, setNewIds] = useState(new Set());

  const authError = searchParams.get('error');

  useEffect(() => {
    fetch('/auth/spotify/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setAuthStatus(data.authenticated);
        setDisplayName(data.displayName || '');
      })
      .catch(() => setAuthStatus(false));
  }, []);

  useEffect(() => {
    socket.on('init', (data) => {
      setSettings(data.settings);
      setTiktok(data.tiktok);
      setRequests(data.requests);
      if (data.admin.authenticated) {
        setAuthStatus(true);
        setDisplayName(data.admin.displayName || '');
      }
    });

    socket.on('requests:new', (req) => {
      setRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
      setNewIds((prev) => new Set([...prev, req.id]));
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          next.delete(req.id);
          return next;
        });
      }, 2000);
    });

    socket.on('requests:updated', (req) => {
      setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
    });

    socket.on('requests:removed', ({ id }) => {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    });

    socket.on('settings:updated', setSettings);
    socket.on('tiktok:status', setTiktok);
    socket.on('playlist:error', setPlaylistError);
    socket.on('auth:required', () => {
      setAuthStatus(false);
    });

    return () => {
      socket.off('init');
      socket.off('requests:new');
      socket.off('requests:updated');
      socket.off('requests:removed');
      socket.off('settings:updated');
      socket.off('tiktok:status');
      socket.off('playlist:error');
      socket.off('auth:required');
    };
  }, []);

  useEffect(() => {
    const pending = requests.filter((r) => r.status === 'pending').length;
    document.title = pending > 0 ? `(${pending}) Song Queue Admin` : 'Song Queue Admin';
    return () => { document.title = 'Song Queue Admin'; };
  }, [requests]);

  async function logout() {
    await fetch('/auth/spotify/logout', { method: 'POST', credentials: 'include' });
    setAuthStatus(false);
    setDisplayName('');
  }

  if (authStatus === null) {
    return <div style={{ padding: 32, color: '#aaa' }}>Loading…</div>;
  }

  if (!authStatus) {
    return <LoginPrompt error={authError} />;
  }

  const viewerUrl = `${window.location.origin}/request`;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>Song Queue Admin</div>
        <div style={s.userRow}>
          <span style={s.displayName}>{displayName}</span>
          <button style={s.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </div>

      <div style={s.grid}>
        <div style={s.shareBox}>
          <div style={s.shareTitle}>Viewer request page (share this link):</div>
          <a href={viewerUrl} target="_blank" rel="noreferrer" style={s.shareUrl}>
            {viewerUrl}
          </a>
        </div>

        {tiktok && <TikTokConnect tiktok={tiktok} />}
        {settings && <SettingsPanel settings={settings} onUpdate={setSettings} />}
        {playlistError && (
          <div style={{ background: '#3a1a1a', border: '1px solid #7a2a2a', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#f88' }}>
            <span>{playlistError}</span>
            <button onClick={() => setPlaylistError(null)} style={{ background: 'transparent', border: 'none', color: '#f88', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        )}
        {settings && <PlaylistSelector settings={settings} />}
        <RequestQueue requests={requests} isAdmin newIds={newIds} />
      </div>
    </div>
  );
}
