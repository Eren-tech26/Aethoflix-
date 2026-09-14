import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Ban, Bell, CheckCircle2, Clapperboard, Copy, Crown, Eye, KeyRound,
  Megaphone, RefreshCw, Search, Shield, Trash2, Users, X,
} from 'lucide-react';

type Tab = 'overview' | 'users' | 'reports' | 'vip' | 'tools' | 'broadcast';
type Stats = {
  totalViews: number; viewsToday: number; viewsWeek: number; viewsMonth: number; activeNow: number;
  activeSessions: Array<{ sessionId: string; title?: string; user?: string; username?: string; type?: string; season?: number; episode?: number; poster_path?: string; lastSeen?: number }>;
};
type UserRow = { user: string; visits: number; watchCount: number; watchMinutes: number; firstSeen?: number | null; lastSeen?: number | null; active?: boolean };
type ReportRow = { _id: string; type: string; status: string; title?: string; message?: string; username?: string; ts?: number };
type VipCode = { _id: string; code: string; kind: string; status: string; days?: number; createdAt?: number; usedAt?: number; usedBy?: string };
type TrialGrant = { _id: string; user?: string; username?: string; kind?: string; days?: number; grantedAt?: number; expiresAt?: number };

const PIN_KEY = 'aethoflix-admin-pin';
const DEFAULT_PIN = '2611';
const TABS: { id: Tab; label: string; icon: typeof Eye }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'reports', label: 'Reports', icon: AlertTriangle },
  { id: 'vip', label: 'VIP', icon: Crown },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone },
  { id: 'tools', label: 'Tools', icon: Shield },
];

function readPin() {
  try { return localStorage.getItem(PIN_KEY) || DEFAULT_PIN; } catch { return DEFAULT_PIN; }
}
function writePin(pin: string) {
  try { localStorage.setItem(PIN_KEY, pin); } catch { /* optional */ }
}
function ago(ts?: number | null) {
  if (!ts) return '—';
  const delta = Date.now() - ts;
  if (delta < 60000) return 'just now';
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}
function poster(path?: string) {
  return path ? `https://image.tmdb.org/t/p/w185${path}` : '';
}

async function apiGet<T>(type: string, pin: string, extra = ''): Promise<T> {
  const response = await fetch(`/api/analytics?type=${encodeURIComponent(type)}${extra}`, {
    headers: { 'X-Admin-Pin': pin },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
async function apiPost(body: Record<string, unknown>, pin?: string) {
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(pin ? { 'X-Admin-Pin': pin } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
  return response.json();
}

export default function AdminApp() {
  const [authed, setAuthed] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pin, setPin] = useState(readPin);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [most, setMost] = useState<Array<{ title: string; count: number; type?: string; poster_path?: string }>>([]);
  const [mostRange, setMostRange] = useState<'today' | 'week' | 'all'>('all');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userFilter, setUserFilter] = useState<'all' | 'registered' | 'guest'>('all');
  const [userQuery, setUserQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<{ profile: UserRow; history: Array<Record<string, unknown>> } | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | 'new' | 'resolved' | 'deleted'>('all');
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const [vipCodes, setVipCodes] = useState<VipCode[]>([]);
  const [vipTotals, setVipTotals] = useState({ total: 0, active: 0, used: 0, revoked: 0 });
  const [vipKind, setVipKind] = useState('permanent');
  const [trials, setTrials] = useState<TrialGrant[]>([]);
  const [broadcast, setBroadcast] = useState('');
  const [newPin, setNewPin] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const unlock = (event: React.FormEvent) => {
    event.preventDefault();
    if (pinInput === pin) {
      setAuthed(true);
      setPinInput('');
      setError('');
    } else setError('Incorrect PIN.');
  };

  const load = useCallback(async () => {
    if (!authed) return;
    setBusy(true); setError('');
    try {
      const [nextStats, nextMost, nextUsers, nextReports, nextVip, nextTrials, nextBroadcast] = await Promise.all([
        apiGet<Stats>('stats', pin),
        apiGet<{ items: Array<{ title: string; count: number; type?: string; poster_path?: string }> }>('most-watched', pin, `&range=${mostRange}`),
        apiGet<{ users: UserRow[] }>('users', pin),
        apiGet<{ reports: ReportRow[] }>('reports', pin, reportFilter === 'all' ? '' : `&status=${reportFilter}`),
        apiGet<{ codes: VipCode[]; totals: typeof vipTotals }>('vip-codes', pin),
        apiGet<{ grants: TrialGrant[] }>('vip-grants', pin),
        fetch('/api/broadcast').then((r) => r.json()).catch(() => ({ message: '' })),
      ]);
      setStats(nextStats);
      setMost(nextMost.items || []);
      setUsers(nextUsers.users || []);
      setReports(nextReports.reports || []);
      setVipCodes(nextVip.codes || []);
      setVipTotals(nextVip.totals || { total: 0, active: 0, used: 0, revoked: 0 });
      setTrials(nextTrials.grants || []);
      setBroadcast(nextBroadcast.message || '');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Failed to load admin data.');
    } finally {
      setBusy(false);
    }
  }, [authed, pin, mostRange, reportFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => clearInterval(timer);
  }, [authed, load]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const guest = user.user.startsWith('guest_') || user.user === 'Guest';
      if (userFilter === 'guest' && !guest) return false;
      if (userFilter === 'registered' && guest) return false;
      if (userQuery && !user.user.toLowerCase().includes(userQuery.toLowerCase())) return false;
      return true;
    });
  }, [users, userFilter, userQuery]);
  const pagedUsers = filteredUsers.slice(page * 30, page * 30 + 30);

  const openUser = async (username: string) => {
    try {
      const data = await apiGet<{ profile: UserRow; history: Array<Record<string, unknown>> }>('user', pin, `&user=${encodeURIComponent(username)}`);
      setSelectedUser(data);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not open user profile.');
    }
  };

  if (!authed) {
    return (
      <div className="admin-app">
        <form className="admin-gate" onSubmit={unlock}>
          <div className="admin-mark"><Shield size={28} /></div>
          <h1>AethoFlix Admin</h1>
          <p>Enter your 4-digit control PIN to continue.</p>
          <input className="admin-pin" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" autoFocus />
          {error && <p className="admin-error">{error}</p>}
          <button className="admin-primary" type="submit">Unlock dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-top">
        <div>
          <span className="admin-kicker">AETH OFLIX CONTROL</span>
          <h1>Admin Dashboard</h1>
        </div>
        <div className="admin-top-actions">
          <button className="admin-ghost" onClick={() => void load()} disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh</button>
          <button className="admin-ghost" onClick={() => setAuthed(false)}><KeyRound size={15} /> Lock</button>
        </div>
      </header>

      <nav className="admin-tabs">
        {TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>
            <item.icon size={15} />{item.label}
          </button>
        ))}
      </nav>

      {error && <div className="admin-banner error">{error}</div>}
      {toast && <div className="admin-banner ok">{toast}</div>}

      {tab === 'overview' && (
        <section className="admin-section">
          <div className="admin-grid stats">
            {[
              ['Views today', stats?.viewsToday ?? '—'],
              ['Views week', stats?.viewsWeek ?? '—'],
              ['Views month', stats?.viewsMonth ?? '—'],
              ['All-time views', stats?.totalViews ?? '—'],
              ['Live now', stats?.activeNow ?? '—'],
              ['Tracked users', users.length],
              ['Guests', users.filter((u) => u.user.startsWith('guest_') || u.user === 'Guest').length],
              ['Registered', users.filter((u) => !(u.user.startsWith('guest_') || u.user === 'Guest')).length],
            ].map(([label, value]) => (
              <article key={String(label)} className="admin-card stat"><span>{label}</span><strong>{value}</strong></article>
            ))}
          </div>

          <div className="admin-split">
            <article className="admin-card">
              <div className="admin-card-head"><h2>Currently watching</h2><span className="live-dot" /> live</div>
              <div className="admin-list">
                {(stats?.activeSessions || []).length ? stats!.activeSessions.map((session) => (
                  <div className="admin-row" key={session.sessionId}>
                    {session.poster_path ? <img src={poster(session.poster_path)} alt="" /> : <div className="admin-thumb" />}
                    <div>
                      <strong>{session.title || 'Untitled'}</strong>
                      <small>{session.user || session.username || 'Guest'} · {session.type === 'tv' ? `S${session.season || 1}E${session.episode || 1}` : 'Movie'} · {ago(session.lastSeen)}</small>
                    </div>
                  </div>
                )) : <p className="admin-empty">No live sessions right now.</p>}
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-card-head">
                <h2>Most watched</h2>
                <div className="admin-chip-row">
                  {(['today', 'week', 'all'] as const).map((range) => (
                    <button key={range} className={mostRange === range ? 'is-active' : ''} onClick={() => setMostRange(range)}>{range}</button>
                  ))}
                </div>
              </div>
              <div className="admin-list">
                {most.length ? most.map((item, index) => (
                  <div className="admin-row" key={`${item.title}-${index}`}>
                    {item.poster_path ? <img src={poster(item.poster_path)} alt="" /> : <div className="admin-thumb"><Clapperboard size={16} /></div>}
                    <div><strong>{item.title}</strong><small>{item.type || 'title'} · {item.count} plays</small></div>
                  </div>
                )) : <p className="admin-empty">No watch data yet.</p>}
              </div>
            </article>
          </div>
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-section">
          <div className="admin-toolbar">
            <div className="admin-search"><Search size={15} /><input value={userQuery} onChange={(e) => { setUserQuery(e.target.value); setPage(0); }} placeholder="Search username" /></div>
            <div className="admin-chip-row">
              {(['all', 'registered', 'guest'] as const).map((filter) => (
                <button key={filter} className={userFilter === filter ? 'is-active' : ''} onClick={() => { setUserFilter(filter); setPage(0); }}>{filter}</button>
              ))}
            </div>
          </div>
          <div className="admin-table">
            <div className="admin-table-head"><span>User</span><span>Visits</span><span>Watches</span><span>Minutes</span><span>Last seen</span></div>
            {pagedUsers.map((user) => {
              const guest = user.user.startsWith('guest_') || user.user === 'Guest';
              return (
                <button className="admin-table-row" key={user.user} onClick={() => void openUser(user.user)}>
                  <span><strong>{user.user}</strong>{guest ? <em className="badge">GUEST</em> : <em className="badge reg">USER</em>}{user.active && <em className="badge live">LIVE</em>}</span>
                  <span>{user.visits}</span><span>{user.watchCount}</span><span>{user.watchMinutes}</span><span>{ago(user.lastSeen)}</span>
                </button>
              );
            })}
          </div>
          <div className="admin-pager">
            <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
            <span>Page {page + 1} / {Math.max(1, Math.ceil(filteredUsers.length / 30))}</span>
            <button disabled={(page + 1) * 30 >= filteredUsers.length} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="admin-section">
          <div className="admin-chip-row">
            {(['all', 'new', 'resolved', 'deleted'] as const).map((status) => (
              <button key={status} className={reportFilter === status ? 'is-active' : ''} onClick={() => setReportFilter(status)}>{status}</button>
            ))}
          </div>
          <div className="admin-list tall">
            {reports.length ? reports.map((report) => (
              <button className="admin-row report" key={report._id} onClick={() => setSelectedReport(report)}>
                <div className="admin-thumb"><AlertTriangle size={16} /></div>
                <div>
                  <strong>{report.title || report.type}</strong>
                  <small>{report.username || 'Guest'} · {report.status} · {ago(report.ts)}</small>
                  <p>{report.message}</p>
                </div>
              </button>
            )) : <p className="admin-empty">No reports yet.</p>}
          </div>
        </section>
      )}

      {tab === 'vip' && (
        <section className="admin-section">
          <div className="admin-grid stats">
            <article className="admin-card stat"><span>Total codes</span><strong>{vipTotals.total}</strong></article>
            <article className="admin-card stat"><span>Active</span><strong>{vipTotals.active}</strong></article>
            <article className="admin-card stat"><span>Used</span><strong>{vipTotals.used}</strong></article>
            <article className="admin-card stat"><span>Revoked</span><strong>{vipTotals.revoked}</strong></article>
          </div>
          <div className="admin-toolbar">
            <select value={vipKind} onChange={(e) => setVipKind(e.target.value)}>
              <option value="permanent">Permanent</option>
              <option value="7-day">7-day</option>
              <option value="30-day">30-day</option>
              <option value="1-time">1-time use</option>
            </select>
            <button className="admin-primary" onClick={async () => {
              try {
                const result = await apiPost({ action: 'vip-create', kind: vipKind }, pin) as { code: VipCode };
                await navigator.clipboard?.writeText(result.code.code);
                showToast(`Created ${result.code.code}`);
                void load();
              } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not create code'); }
            }}><Copy size={15} /> Generate code</button>
          </div>
          <div className="admin-list">
            {vipCodes.map((code) => (
              <div className="admin-row" key={code._id}>
                <div>
                  <strong>{code.code}</strong>
                  <small>{code.kind} · {code.status} · {ago(code.createdAt)}{code.usedBy ? ` · used by ${code.usedBy}` : ''}</small>
                </div>
                {code.status === 'active' && <button className="admin-ghost danger" onClick={async () => { await apiPost({ action: 'vip-revoke', id: code._id }, pin); void load(); }}><Ban size={14} /> Revoke</button>}
              </div>
            ))}
          </div>
          <article className="admin-card" style={{ marginTop: 16 }}>
            <div className="admin-card-head"><h2>Free trials</h2></div>
            <div className="admin-list">
              {trials.length ? trials.map((trial) => (
                <div className="admin-row" key={trial._id}>
                  <div><strong>{trial.username || trial.user}</strong><small>{trial.kind || 'trial'} · {trial.days || 7} days · {ago(trial.grantedAt)}</small></div>
                  <em className="badge trial">TRIAL</em>
                </div>
              )) : <p className="admin-empty">No trial grants yet.</p>}
            </div>
          </article>
        </section>
      )}

      {tab === 'broadcast' && (
        <section className="admin-section">
          <article className="admin-card">
            <div className="admin-card-head"><h2>Live announcement</h2></div>
            <textarea value={broadcast} onChange={(e) => setBroadcast(e.target.value)} maxLength={500} rows={5} placeholder="Message shown to every visitor" />
            <div className="admin-toolbar">
              <button className="admin-primary" onClick={async () => {
                const response = await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin }, body: JSON.stringify({ message: broadcast }) });
                if (!response.ok) setError('Broadcast failed');
                else showToast('Broadcast updated');
              }}><Bell size={15} /> Publish live</button>
              <button className="admin-ghost" onClick={async () => {
                setBroadcast('');
                await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin }, body: JSON.stringify({ message: '' }) });
                showToast('Broadcast cleared');
              }}>Clear</button>
            </div>
          </article>
        </section>
      )}

      {tab === 'tools' && (
        <section className="admin-section">
          <article className="admin-card">
            <div className="admin-card-head"><h2>Change admin PIN</h2></div>
            <p className="admin-help">Stored in this browser. Default remains 2611 until you change it here. Server validation still uses `ADMIN_PIN` or 2611.</p>
            <input className="admin-pin" inputMode="numeric" maxLength={8} value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN" />
            <button className="admin-primary" onClick={() => {
              if (!/^\d{4,8}$/.test(newPin)) { setError('Use a 4-8 digit PIN.'); return; }
              writePin(newPin); setPin(newPin); setNewPin(''); showToast('PIN updated on this device');
            }}>Save PIN</button>
          </article>
        </section>
      )}

      {selectedUser && (
        <div className="admin-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedUser(null); }}>
          <div className="admin-modal-card">
            <button className="admin-close" onClick={() => setSelectedUser(null)}><X size={16} /></button>
            <h2>{selectedUser.profile.user}</h2>
            <div className="admin-grid stats compact">
              <article className="admin-card stat"><span>Visits</span><strong>{selectedUser.profile.visits}</strong></article>
              <article className="admin-card stat"><span>Watches</span><strong>{selectedUser.profile.watchCount}</strong></article>
              <article className="admin-card stat"><span>Minutes</span><strong>{selectedUser.profile.watchMinutes}</strong></article>
              <article className="admin-card stat"><span>Last seen</span><strong>{ago(selectedUser.profile.lastSeen)}</strong></article>
            </div>
            <div className="admin-list">
              {selectedUser.history.map((item, index) => (
                <div className="admin-row" key={String(item.sessionId || index)}>
                  {item.poster_path ? <img src={poster(String(item.poster_path))} alt="" /> : <div className="admin-thumb" />}
                  <div>
                    <strong>{String(item.title || 'Untitled')}</strong>
                    <small>{String(item.type || 'movie')} · {item.inProgress ? 'in progress' : `${item.durationMin || 0} min`} · {ago(Number(item.startedAt || 0))}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedReport && (
        <div className="admin-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedReport(null); }}>
          <div className="admin-modal-card">
            <button className="admin-close" onClick={() => setSelectedReport(null)}><X size={16} /></button>
            <h2>{selectedReport.title || selectedReport.type}</h2>
            <p>{selectedReport.message}</p>
            <small>{selectedReport.username || 'Guest'} · {selectedReport.status} · {ago(selectedReport.ts)}</small>
            <div className="admin-toolbar">
              <button className="admin-primary" onClick={async () => { await apiPost({ action: 'report-update', id: selectedReport._id, status: 'resolved' }, pin); setSelectedReport(null); void load(); }}><CheckCircle2 size={15} /> Resolve</button>
              <button className="admin-ghost danger" onClick={async () => { await apiPost({ action: 'report-update', id: selectedReport._id, status: 'deleted' }, pin); setSelectedReport(null); void load(); }}><Trash2 size={15} /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
