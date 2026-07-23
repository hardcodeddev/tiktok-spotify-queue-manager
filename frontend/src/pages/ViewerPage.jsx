import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
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
  infoBanner: {
    background: '#1a1f2a', border: '1px solid #3a4a6a', borderRadius: 10,
    padding: '14px 20px', color: '#8ab4ff', fontSize: 15, marginBottom: 24,
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
  hint: { fontSize: 12, color: '#777', marginTop: -4, marginBottom: 4, paddingLeft: 2 },
  roundInfo: { fontSize: 13, color: '#1db954', marginBottom: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#aaa', marginBottom: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
};

const INITIAL_ROUND = {
  loading: true,
  exists: false,
  active: false,
  alreadyRequested: false,
  count: 0,
  maxSongs: 0,
};

export default function ViewerPage() {
  const { roundId } = useParams();

  const [round, setRound] = useState(INITIAL_ROUND);
  const [accepting, setAccepting] = useState(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [settings, setSettings] = useState({ acceptingRequests: true, maxQueueSize: 0 });

  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [searching, setSearching] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef(null);

  // --- Queue / settings socket wiring -------------------------------------
  useEffect(() => {
    socket.on('init', (data) => {
      setSettings(data.settings);
      setAccepting(data.settings.acceptingRequests);
      setAllRequests(data.requests);
      setApprovedRequests(data.requests.filter((r) => r.status === 'approved'));
    });

    socket.on('settings:updated', (updated) => {
      setSettings(updated);
      setAccepting(updated.acceptingRequests);
    });

    socket.on('requests:new', (req) => {
      setAllRequests((prev) => {
        if (prev.some((r) => r.id === req.id)) return prev;
        return [req, ...prev];
      });
    });

    socket.on('requests:updated', (req) => {
      setAllRequests((prev) => {
        const exists = prev.some((r) => r.id === req.id);
        if (!exists) return [req, ...prev];
        return prev.map((r) => (r.id === req.id ? req : r));
      });

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

  // --- Round status: initial fetch + live updates -------------------------
  useEffect(() => {
    if (!roundId) {
      setRound({ ...INITIAL_ROUND, loading: false });
      return;
    }

    let cancelled = false;
    setRound(INITIAL_ROUND);

    fetch(`/rounds/${roundId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRound({ loading: false, ...data });
      })
      .catch(() => {
        if (!cancelled) setRound({ ...INITIAL_ROUND, loading: false });
      });

    function onRoundUpdated(payload) {
      if (payload.id !== roundId) return;
      setRound((prev) => ({
        ...prev,
        active: payload.active,
        count: payload.count,
        maxSongs: payload.maxSongs,
      }));
    }

    socket.on('round:updated', onRoundUpdated);
    return () => {
      cancelled = true;
      socket.off('round:updated', onRoundUpdated);
    };
  }, [roundId]);

  // --- Debounced Spotify search -------------------------------------------
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
    setTimeout(() => setShowDropdown(false), 150);
  }

  async function submit(e) {
    e.preventDefault();
    if (!query.trim() || !accepting || !roundId) return;
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const body = { query: query.trim(), requesterName: name.trim(), roundId };
      if (selectedTrack) body.track = selectedTrack;

      const res = await fetch('/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Reflect round-limit outcomes in local state so the form closes.
        if (data.code === 'DEVICE_ALREADY_REQUESTED') {
          setRound((prev) => ({ ...prev, alreadyRequested: true }));
        } else if (data.code === 'ROUND_CLOSED') {
          setRound((prev) => ({ ...prev, active: false }));
        } else if (data.code === 'ROUND_FULL') {
          setRound((prev) => ({ ...prev, count: prev.maxSongs }));
        }
        throw new Error(data.error || 'Request failed');
      }

      // This device has now used its one request for the round.
      setRound((prev) => ({ ...prev, alreadyRequested: true, count: prev.count + 1 }));
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

  // --- Derived state -------------------------------------------------------
  const activeCount = allRequests.filter((r) => r.status !== 'rejected').length;
  const queueFull = settings.maxQueueSize > 0 && activeCount >= settings.maxQueueSize;

  const roundClosed = !round.loading && (!round.exists || !round.active);
  const roundFull =
    !round.loading && round.exists && round.active && round.count >= round.maxSongs;
  const alreadyRequested = round.alreadyRequested;

  const canRequest = !round.loading && !roundClosed && !roundFull && !alreadyRequested;

  const btnLabel = submitting
    ? 'Requesting…'
    : queueFull
    ? 'Queue is full'
    : selectedTrack
    ? `Request "${selectedTrack.name}"`
    : 'Request Song';

  const btnEnabled =
    canRequest && accepting && !queueFull && query.trim() && !submitting && !searching;

  const approvedList =
    approvedRequests.length > 0 ? (
      <div>
        <div style={s.sectionTitle}>Approved songs</div>
        <div style={s.list}>
          {approvedRequests.map((r) => (
            <RequestCard key={r.id} request={r} isAdmin={false} />
          ))}
        </div>
      </div>
    ) : null;

  // --- No round link at all ------------------------------------------------
  if (!roundId) {
    return (
      <div style={s.page}>
        <div style={s.title}>Song Requests</div>
        <div style={s.infoBanner}>
          Ask the host for the current request link to request a song.
        </div>
      </div>
    );
  }

  if (round.loading) {
    return (
      <div style={s.page}>
        <div style={s.title}>Song Requests</div>
        <div style={s.sub}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.title}>Song Requests</div>
      <div style={s.sub}>Request a song for the stream!</div>

      {(roundClosed || roundFull) && (
        <div style={s.banner}>
          The request limit for this round has been reached. Please wait for the host to
          share a new link for the next round.
        </div>
      )}

      {!roundClosed && !roundFull && alreadyRequested && (
        <div style={s.infoBanner}>
          You've already requested a song this round. Please wait for the host to share a
          new link for the next round.
        </div>
      )}

      {canRequest && (
        <>
          {round.maxSongs > 0 && (
            <div style={s.roundInfo}>
              {round.count} of {round.maxSongs} songs requested this round
            </div>
          )}

          {!accepting && <div style={s.banner}>Requests are currently paused</div>}
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
              placeholder="Display name (optional)"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              disabled={!accepting || queueFull || submitting}
            />
            <div style={s.hint}>Leave blank to stay anonymous.</div>
            <button type="submit" style={btnEnabled ? s.btn : s.btnDisabled} disabled={!btnEnabled}>
              {btnLabel}
            </button>
          </form>
        </>
      )}

      {success && <div style={s.successMsg}>Your request was submitted!</div>}
      {error && <div style={s.errorMsg}>{error}</div>}

      {approvedList}
    </div>
  );
}
