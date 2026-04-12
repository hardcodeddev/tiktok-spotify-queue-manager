import React, { useEffect, useState, useRef, useCallback } from 'react';
import socket from '../socket.js';
import RequestCard from '../components/RequestCard.jsx';

const s = {
  page: { maxWidth: 600, margin: '0 auto', padding: '32px 16px' },
  title: { fontSize: 24, fontWeight: 700, color: '#1db954', marginBottom: 4 },
  sub: { fontSize: 14, color: '#888', marginBottom: 28 },
  banner: {
    background: '#2a1a1a', border: '1px solid #ff444440', borderRadius: 10,
    padding: '14px 20px', color: '#ff6b6b', fontSize: 15, marginBottom: 24,
    textAlign: 'center',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 },
  inputWrap: { position: 'relative', zIndex: 10 },
  input: {
    padding: '12px 16px', borderRadius: 10, border: '1px solid #333',
    background: '#1a1a1a', color: '#e0e0e0', fontSize: 15, width: '100%',
    boxSizing: 'border-box',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
    background: '#1e1e1e', border: '1px solid #333', borderRadius: 10,
    marginTop: 4, overflow: 'hidden', maxHeight: 340, overflowY: 'auto',
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    cursor: 'pointer', transition: 'background 0.1s',
  },
  dropdownItemHovered: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    cursor: 'pointer', background: '#2a2a2a',
  },
  albumArt: { width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  albumArtPlaceholder: {
    width: 44, height: 44, borderRadius: 6, background: '#333', flexShrink: 0,
  },
  trackName: { color: '#e0e0e0', fontWeight: 700, fontSize: 14 },
  trackArtist: { color: '#888', fontSize: 13, marginTop: 2 },
  btn: {
    padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#1db954', color: '#000', fontSize: 16, fontWeight: 700,
  },
  btnDisabled: {
    padding: '13px', borderRadius: 10, border: 'none', cursor: 'not-allowed',
    background: '#2a2a2a', color: '#666', fontSize: 16, fontWeight: 700,
  },
  successMsg: {
    background: '#0d2a16', border: '1px solid #1db95440', borderRadius: 10,
    padding: '14px 20px', color: '#1db954', fontSize: 14, textAlign: 'center',
  },
  errorMsg: {
    background: '#2a1a1a', border: '1px solid #ff444440', borderRadius: 10,
    padding: '14px 20px', color: '#ff6b6b', fontSize: 14, textAlign: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#aaa', marginBottom: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
};

export default function ViewerPage() {
  const [accepting, setAccepting] = useState(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [settings, setSettings] = useState({
    acceptingRequests: true,
    maxQueueSize: 0,
  });

  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [searching, setSearching] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef(null);

  useEffect(() => {
    socket.on('init', (data) => {
      setSettings(data.settings);
      setAccepting(data.settings.acceptingRequests);
      setAllRequests(data.requests);
      setApprovedRequests(data.requests.filter((r) => r.status === 'approved'));
    });

    socket.on('settings:updated', (settings) => {
      setSettings(settings);
      setAccepting(settings.acceptingRequests);
    });

    socket.on('requests:new', (req) => {
      setAllRequests((prev) => [req, ...prev]);
    });

    socket.on('requests:updated', (req) => {
      setAllRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
      if (req.status === 'approved') {
        setApprovedRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
      } else {
        setApprovedRequests((prev) => prev.filter((r) => r.id !== req.id));
      }
    });

    socket.on('requests:removed', ({ id }) => {
      setAllRequests((prev) => prev.filter((r) => r.id !== id));
      setApprovedRequests((prev) => prev.filter((r) => r.id !== id));
    });

    return () => {
      socket.off('init');
      socket.off('settings:updated');
      socket.off('requests:new');
      socket.off('requests:updated');
      socket.off('requests:removed');
    };
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (selectedTrack) return; // user already picked — don't re-search

    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/spotify/search?q=${encodeURIComponent(query.trim())}&limit=6`);
        if (res.ok) {
          const tracks = await res.json();
          setResults(tracks);
          setShowDropdown(tracks.length > 0);
          setHoveredIdx(-1);
        }
      } catch {
        // silently ignore search errors
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, selectedTrack]);

  function handleQueryChange(e) {
    const val = e.target.value;
    setQuery(val);
    if (selectedTrack) setSelectedTrack(null); // resume typing clears selection
  }

  function selectTrack(track) {
    setSelectedTrack(track);
    setQuery(`${track.name} — ${track.artist}`);
    setShowDropdown(false);
    setResults([]);
  }

  function handleBlur() {
    // Delay to allow click on dropdown item to register first
    setTimeout(() => setShowDropdown(false), 150);
  }

  async function submit(e) {
    e.preventDefault();
    if (!query.trim() || !accepting) return;
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const body = { query: query.trim(), requesterName: name.trim() };
      if (selectedTrack) body.track = selectedTrack;

      const res = await fetch('/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      setSuccess(true);
      setQuery('');
      setSelectedTrack(null);
      setResults([]);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount = allRequests.filter((r) => r.status !== 'rejected').length;
  const queueFull = settings.maxQueueSize > 0 && activeCount >= settings.maxQueueSize;

  const btnLabel = submitting
    ? 'Requesting…'
    : queueFull
    ? 'Queue is full'
    : selectedTrack
    ? `Request "${selectedTrack.name}"`
    : 'Request Song';

  const btnEnabled = accepting && !queueFull && query.trim() && !submitting && !searching;

  return (
    <div style={s.page}>
      <div style={s.title}>Song Requests</div>
      <div style={s.sub}>Request a song for the stream!</div>

      {!accepting && (
        <div style={s.banner}>Requests are currently paused</div>
      )}

      {accepting && queueFull && (
        <div style={s.banner}>The request queue is currently full</div>
      )}

      <form style={s.form} onSubmit={submit}>
        <div style={s.inputWrap}>
          <input
            style={s.input}
            placeholder="Song or artist name"
            value={query}
            onChange={handleQueryChange}
            onBlur={handleBlur}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            disabled={!accepting || queueFull || submitting}
            autoComplete="off"
          />
          {showDropdown && (
            <div style={s.dropdown}>
              {results.map((track, idx) => (
                <div
                  key={track.id}
                  style={idx === hoveredIdx ? s.dropdownItemHovered : s.dropdownItem}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(-1)}
                  onMouseDown={() => selectTrack(track)}
                >
                  {track.albumArt ? (
                    <img src={track.albumArt} alt="" style={s.albumArt} />
                  ) : (
                    <div style={s.albumArtPlaceholder} />
                  )}
                  <div>
                    <div style={s.trackName}>{track.name}</div>
                    <div style={s.trackArtist}>{track.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          style={s.input}
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!accepting || queueFull || submitting}
        />
        <button
          type="submit"
          style={btnEnabled ? s.btn : s.btnDisabled}
          disabled={!btnEnabled}
        >
          {btnLabel}
        </button>
      </form>

      {success && <div style={s.successMsg}>Your request was submitted!</div>}
      {error && <div style={s.errorMsg}>{error}</div>}

      {approvedRequests.length > 0 && (
        <div>
          <div style={s.sectionTitle}>Approved songs</div>
          <div style={s.list}>
            {approvedRequests.map((r) => (
              <RequestCard key={r.id} request={r} isAdmin={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
