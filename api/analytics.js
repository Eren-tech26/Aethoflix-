import {
  ACTIVE_WINDOW_MS, Broadcast, connectDB, cors, durMin, now, PageView, Report, TrialGrant, VipCode, WatchLog, WatchSession, adminPinOk,
} from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await connectDB();
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Database connection failed' });
  }

  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { action } = body;

      if (action === 'vip-grant') {
        const who = body.user || body.username || 'Guest';
        if (!who || who === 'Guest') return res.status(200).json({ success: true, skipped: 'guest' });
        await TrialGrant.create({
          user: who, username: who, email: body.email || '', kind: body.kind || 'trial', days: body.days || 7,
          grantedAt: body.grantedAt || now(), expiresAt: body.expiresAt || (now() + (body.days || 7) * 86400000),
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'pageview') {
        await PageView.create({
          user: body.user || 'Guest', path: body.path || '/', referrer: body.referrer || '', ua: req.headers['user-agent'] || '',
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'watch-start') {
        const { sessionId, movieId, type, title, season, episode, username, email, poster, backdrop } = body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const pp = poster || null;
        const bp = backdrop || null;
        await WatchSession.findOneAndUpdate(
          { sessionId },
          { sessionId, movieId, type, title, season, episode, username: username || 'Guest', email: email || '', poster_path: pp, backdrop_path: bp, startedAt: now(), lastSeen: now() },
          { upsert: true },
        );
        await WatchLog.create({
          sessionId, movieId, type, title, username: username || 'Guest', email: email || '', season, episode, poster_path: pp, backdrop_path: bp, ts: now(), lastSeen: now(), ended: false,
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'watch-heartbeat') {
        const { sessionId, season, episode } = body;
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const update = { lastSeen: now() };
        if (season !== undefined) update.season = season;
        if (episode !== undefined) update.episode = episode;
        await WatchSession.findOneAndUpdate({ sessionId }, update);
        await WatchLog.updateOne({ sessionId, ended: { $ne: true } }, { lastSeen: now(), season, episode });
        return res.status(200).json({ success: true });
      }

      if (action === 'watch-end') {
        const { sessionId } = body;
        if (sessionId) {
          await WatchSession.deleteOne({ sessionId });
          const log = await WatchLog.findOne({ sessionId });
          if (log) {
            log.ended = true;
            log.endTs = now();
            log.durationMin = durMin(log.ts, now());
            await log.save();
          }
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'report-create') {
        await Report.create({
          type: body.type || 'video',
          status: 'new',
          title: body.title || '',
          movieId: body.movieId,
          mediaType: body.mediaType || '',
          message: String(body.message || '').slice(0, 2000),
          username: body.username || 'Guest',
          email: body.email || '',
          ua: req.headers['user-agent'] || '',
          ts: now(),
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'report-update') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const status = body.status === 'resolved' || body.status === 'deleted' || body.status === 'new' ? body.status : null;
        if (!body.id || !status) return res.status(400).json({ error: 'id and status required' });
        await Report.findByIdAndUpdate(body.id, { status, resolvedAt: status === 'resolved' ? now() : undefined });
        return res.status(200).json({ success: true });
      }

      if (action === 'vip-create') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const kind = ['permanent', '7-day', '30-day', '1-time'].includes(body.kind) ? body.kind : 'permanent';
        const days = kind === '7-day' ? 7 : kind === '30-day' ? 30 : kind === '1-time' ? 1 : null;
        const code = String(body.code || `AFX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`).slice(0, 24);
        const created = await VipCode.create({ code, kind, days, status: 'active', createdAt: now() });
        return res.status(200).json({ success: true, code: created });
      }

      if (action === 'vip-revoke') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        if (!body.id) return res.status(400).json({ error: 'id required' });
        await VipCode.findByIdAndUpdate(body.id, { status: 'revoked', revokedAt: now() });
        return res.status(200).json({ success: true });
      }

      if (action === 'vip-redeem') {
        const code = String(body.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ error: 'code required' });
        const doc = await VipCode.findOne({ code });
        if (!doc || doc.status !== 'active') return res.status(400).json({ error: 'Invalid or inactive code' });
        doc.status = 'used';
        doc.usedAt = now();
        doc.usedBy = body.username || 'Guest';
        await doc.save();
        return res.status(200).json({ success: true, kind: doc.kind, days: doc.days });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'GET') {
      const { query } = req;

      if (query.type === 'stats') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const t = now();
        const dayAgo = t - 86400000;
        const weekAgo = t - 7 * 86400000;
        const monthAgo = t - 30 * 86400000;
        const [totalViews, viewsToday, viewsWeek, viewsMonth] = await Promise.all([
          PageView.countDocuments({}),
          PageView.countDocuments({ ts: { $gte: dayAgo } }),
          PageView.countDocuments({ ts: { $gte: weekAgo } }),
          PageView.countDocuments({ ts: { $gte: monthAgo } }),
        ]);
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });
        const activeSessions = (await WatchSession.find({}).sort({ lastSeen: -1 }).lean()).map((s) => ({ ...s, user: s.username || 'Guest' }));
        return res.status(200).json({ totalViews, viewsToday, viewsWeek, viewsMonth, activeNow: activeSessions.length, activeSessions });
      }

      if (query.type === 'most-watched') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const range = query.range || 'all';
        const t = now();
        const match = {};
        if (range === 'today') match.ts = { $gte: t - 86400000 };
        if (range === 'week') match.ts = { $gte: t - 7 * 86400000 };
        const results = await WatchLog.aggregate([
          { $match: match },
          { $group: { _id: { movieId: '$movieId', type: '$type', title: '$title', poster_path: '$poster_path' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]);
        return res.status(200).json({ items: results.map((r) => ({ movieId: r._id.movieId, type: r._id.type, title: r._id.title, poster_path: r._id.poster_path, count: r.count })) });
      }

      if (query.type === 'active-sessions') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const t = now();
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });
        const sessions = (await WatchSession.find({}).sort({ lastSeen: -1 }).lean()).map((s) => ({ ...s, user: s.username || 'Guest' }));
        return res.status(200).json({ sessions });
      }

      if (query.type === 'users') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const t = now();
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });
        const [pvGroups, wlGroups, activeDocs] = await Promise.all([
          PageView.aggregate([{ $group: { _id: { $ifNull: ['$user', 'Guest'] }, visits: { $sum: 1 }, firstSeen: { $min: '$ts' }, lastSeen: { $max: '$ts' } } }]),
          WatchLog.aggregate([{ $group: { _id: { $ifNull: ['$username', 'Guest'] }, watchCount: { $sum: 1 }, watchMinutes: { $sum: { $ifNull: ['$durationMin', 0] } }, firstSeen: { $min: '$ts' }, lastSeen: { $max: { $ifNull: ['$endTs', '$lastSeen', '$ts'] } } } }]),
          WatchSession.find({}).select('username lastSeen').lean(),
        ]);
        const activeUsers = new Set(activeDocs.map((s) => s.username || 'Guest'));
        const map = new Map();
        pvGroups.forEach((g) => map.set(g._id, { user: g._id, visits: g.visits, firstSeen: g.firstSeen, lastSeen: g.lastSeen, watchCount: 0, watchMinutes: 0, active: false }));
        wlGroups.forEach((g) => {
          const u = map.get(g._id) || { user: g._id, visits: 0, firstSeen: null, lastSeen: null };
          u.watchCount = g.watchCount;
          u.watchMinutes = g.watchMinutes;
          if (!u.firstSeen || g.firstSeen < u.firstSeen) u.firstSeen = g.firstSeen;
          if (!u.lastSeen || g.lastSeen > u.lastSeen) u.lastSeen = g.lastSeen;
          map.set(g._id, u);
        });
        activeUsers.forEach((u) => {
          const x = map.get(u);
          if (x) x.active = true;
          else map.set(u, { user: u, visits: 0, firstSeen: null, lastSeen: null, watchCount: 0, watchMinutes: 0, active: true });
        });
        const users = [...map.values()].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 200);
        return res.status(200).json({ users });
      }

      if (query.type === 'user') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const user = query.user || 'Guest';
        const [pvs, logs, activeDoc] = await Promise.all([
          PageView.find({ user }).lean(),
          WatchLog.find({ username: user }).sort({ ts: -1 }).lean(),
          WatchSession.exists({ username: user }),
        ]);
        const profile = { user, firstSeen: null, lastSeen: null, visits: pvs.length, watchCount: logs.length, watchMinutes: 0, active: !!activeDoc };
        pvs.forEach((p) => {
          if (!profile.firstSeen || p.ts < profile.firstSeen) profile.firstSeen = p.ts;
          if (!profile.lastSeen || p.ts > profile.lastSeen) profile.lastSeen = p.ts;
        });
        logs.forEach((l) => {
          profile.watchMinutes += (l.durationMin || 0);
          const lLast = l.endTs || l.lastSeen || l.ts;
          if (!profile.lastSeen || lLast > profile.lastSeen) profile.lastSeen = lLast;
          if (!profile.firstSeen || l.ts < profile.firstSeen) profile.firstSeen = l.ts;
        });
        const history = logs.map((l) => ({
          sessionId: l.sessionId, movieId: l.movieId, title: l.title || 'Untitled', type: l.type || 'movie', season: l.season || 1, episode: l.episode || 1,
          poster_path: l.poster_path || '', backdrop_path: l.backdrop_path || '', startedAt: l.ts, lastSeen: l.lastSeen || l.endTs || l.ts,
          inProgress: !l.ended && ((now() - (l.lastSeen || l.endTs || l.ts)) < ACTIVE_WINDOW_MS),
          durationMin: l.durationMin ?? durMin(l.ts, l.endTs || l.lastSeen || l.ts), ended: !!l.ended,
        }));
        return res.status(200).json({ profile, history });
      }

      if (query.type === 'vip-grants') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const limit = Math.min(Number(query.limit) || 200, 500);
        const grants = await TrialGrant.find({}).sort({ grantedAt: -1 }).limit(limit).lean();
        return res.status(200).json({ grants });
      }

      if (query.type === 'reports') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const status = query.status || 'all';
        const filter = status === 'all' ? {} : { status };
        const reports = await Report.find(filter).sort({ ts: -1 }).limit(200).lean();
        return res.status(200).json({ reports });
      }

      if (query.type === 'vip-codes') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const codes = await VipCode.find({}).sort({ createdAt: -1 }).limit(300).lean();
        const totals = {
          total: codes.length,
          active: codes.filter((c) => c.status === 'active').length,
          used: codes.filter((c) => c.status === 'used').length,
          revoked: codes.filter((c) => c.status === 'revoked').length,
        };
        return res.status(200).json({ codes, totals });
      }

      if (query.type === 'broadcast') {
        const doc = await Broadcast.findOne({ singleton: 'main' });
        return res.status(200).json({ message: doc?.message || '', updatedAt: doc?.updatedAt || 0 });
      }

      return res.status(400).json({ error: 'Unknown query type' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Analytics API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
