import React from 'react';
import RequestCard from './RequestCard.jsx';

const s = {
  wrap: {},
  title: { fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#e0e0e0' },
  empty: { color: '#555', fontSize: 14, textAlign: 'center', padding: '32px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  tabs: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tab: (active) => ({
    padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
    background: active ? '#1db954' : '#222', color: active ? '#000' : '#aaa',
    fontSize: 13, fontWeight: active ? 700 : 400,
  }),
};

const FILTERS = ['all', 'pending', 'approved', 'rejected'];

export default function RequestQueue({ requests, isAdmin, newIds = new Set() }) {
  const [filter, setFilter] = React.useState('all');

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  return (
    <div style={s.wrap}>
      <div style={s.title}>Song Requests ({requests.length})</div>
      <div style={s.tabs}>
        {FILTERS.map((f) => (
          <button key={f} style={s.tab(filter === f)} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && ` (${requests.filter((r) => r.status === f).length})`}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={s.empty}>No {filter === 'all' ? '' : filter} requests</div>
      ) : (
        <div style={s.list}>
          {filtered.map((r) => (
            <RequestCard key={r.id} request={r} isAdmin={isAdmin} isNew={newIds.has(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
