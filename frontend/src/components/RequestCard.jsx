import React from 'react';

const SOURCE_COLORS = { tiktok: '#69c9d0', web: '#a78bfa' };

if (typeof document !== 'undefined' && !document.getElementById('rcard-new-style')) {
  const el = document.createElement('style');
  el.id = 'rcard-new-style';
  el.textContent = '@keyframes newCard{0%{border-color:#1db954;box-shadow:0 0 0 3px #1db95430}100%{border-color:#2a2a2a;box-shadow:none}}';
  document.head.appendChild(el);
}

const s = {
  card: {
    background: '#1a1a1a', borderRadius: 10, padding: '14px 16px',
    border: '1px solid #2a2a2a', display: 'flex', gap: 12, alignItems: 'flex-start',
  },
  art: { width: 56, height: 56, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  artPlaceholder: {
    width: 56, height: 56, borderRadius: 6, background: '#2a2a2a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0 },
  topRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  badge: (source) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
    background: SOURCE_COLORS[source] || '#666', color: '#000',
    textTransform: 'uppercase',
  }),
  requester: { fontSize: 13, color: '#aaa' },
  query: { fontSize: 14, color: '#e0e0e0', fontWeight: 600, marginBottom: 4 },
  track: { fontSize: 13, color: '#aaa' },
  noMatch: { fontSize: 13, color: '#666', fontStyle: 'italic' },
  actions: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  statusBadge: (status) => ({
    fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
    background: status === 'approved' ? '#1db95420' : status === 'rejected' ? '#ff444420' : '#44444420',
    color: status === 'approved' ? '#1db954' : status === 'rejected' ? '#ff6b6b' : '#888',
    border: `1px solid ${status === 'approved' ? '#1db95450' : status === 'rejected' ? '#ff444450' : '#44444450'}`,
    textTransform: 'capitalize', alignSelf: 'flex-start',
  }),
  btnApprove: {
    padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: '#1db954', color: '#000', fontSize: 13, fontWeight: 700,
  },
  btnReject: {
    padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: '#333', color: '#ff6b6b', fontSize: 13, fontWeight: 600,
  },
  btnRemove: {
    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: 'transparent', color: '#555', fontSize: 18, lineHeight: 1,
  },
};

export default function RequestCard({ request, isAdmin, isNew }) {
  const { id, source, requesterName, query, status, spotifyTrack } = request;

  async function approve() {
    await fetch(`/requests/${id}/approve`, { method: 'POST', credentials: 'include' });
  }

  async function reject() {
    await fetch(`/requests/${id}/reject`, { method: 'POST', credentials: 'include' });
  }

  async function remove() {
    await fetch(`/requests/${id}`, { method: 'DELETE', credentials: 'include' });
  }

  return (
    <div style={{ ...s.card, ...(isNew && { animation: 'newCard 2s ease-out forwards' }) }}>
      {spotifyTrack?.albumArt ? (
        <img src={spotifyTrack.albumArt} alt="album art" style={s.art} />
      ) : (
        <div style={s.artPlaceholder}>♪</div>
      )}

      <div style={s.body}>
        <div style={s.topRow}>
          {source === 'web' && <span style={s.badge(source)}>{source}</span>}
          <span style={s.requester}>{requesterName}</span>
          {!isAdmin && <span style={s.statusBadge(status)}>{status}</span>}
        </div>
        <div style={s.query}>"{query}"</div>
        {spotifyTrack ? (
          <div style={s.track}>
            {spotifyTrack.name} — {spotifyTrack.artist}
          </div>
        ) : (
          <div style={s.noMatch}>No Spotify match found</div>
        )}
      </div>

      {isAdmin && (
        <div style={s.actions}>
          <button style={s.btnRemove} onClick={remove} title="Remove">×</button>
          {status === 'pending' && (
            <>
              <button style={s.btnApprove} onClick={approve}>Approve</button>
              <button style={s.btnReject} onClick={reject}>Reject</button>
            </>
          )}
          {status !== 'pending' && (
            <span style={s.statusBadge(status)}>{status}</span>
          )}
        </div>
      )}
    </div>
  );
}
