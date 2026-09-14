const VIEWER_KEY = 'aethoflix-viewer-id';
const NAME_KEY = 'aethoflix-player';

function randomId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getViewerId() {
  try {
    const existing = localStorage.getItem(VIEWER_KEY);
    if (existing) return existing;
    const next = `guest_${randomId().slice(0, 12)}`;
    localStorage.setItem(VIEWER_KEY, next);
    return next;
  } catch {
    return `guest_${Date.now()}`;
  }
}

export function getViewerName() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAME_KEY) ?? 'null') as { name?: string } | null;
    if (saved?.name?.trim()) return saved.name.trim().slice(0, 24);
  } catch { /* optional */ }
  return getViewerId();
}

async function post(path: string, body: Record<string, unknown>) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* Analytics should never break the product. */
  }
}

export function trackPageView(path = window.location.pathname + window.location.search) {
  void post('/api/analytics', {
    action: 'pageview',
    path,
    referrer: document.referrer || '',
    user: getViewerName(),
  });
}

export function startWatchSession(payload: {
  sessionId: string;
  movieId: number;
  type: string;
  title: string;
  season?: number;
  episode?: number;
  poster?: string | null;
  backdrop?: string | null;
}) {
  void post('/api/analytics', {
    action: 'watch-start',
    ...payload,
    username: getViewerName(),
    email: '',
  });
}

export function heartbeatWatchSession(sessionId: string, season?: number, episode?: number) {
  void post('/api/analytics', {
    action: 'watch-heartbeat',
    sessionId,
    season,
    episode,
  });
}

export function endWatchSession(sessionId: string) {
  void post('/api/analytics', {
    action: 'watch-end',
    sessionId,
  });
}

export async function fetchBroadcast() {
  try {
    const response = await fetch('/api/broadcast');
    if (!response.ok) return { message: '', updatedAt: 0 };
    return await response.json() as { message: string; updatedAt: number };
  } catch {
    return { message: '', updatedAt: 0 };
  }
}

export async function submitReport(payload: {
  type: string;
  title?: string;
  movieId?: number;
  mediaType?: string;
  message: string;
}) {
  await post('/api/report', payload);
}
