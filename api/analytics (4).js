import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
let isConnected = false;

async function connectDB(){
  if(isConnected) return;
  try{
    await mongoose.connect(MONGO_URI);
    isConnected = true;
  }catch(err){
    console.error('DB error:', err);
    throw err;
  }
}

/* ── PageView: one doc per site visit (now tracks WHICH user/device) ── */
const pageViewSchema = new mongoose.Schema({
  user: { type: String, default: 'Guest' },   // username OR persistent guest_xxxx device id
  path: String,
  referrer: String,
  ua: String,
  ts: { type: Number, default: () => Date.now() }
});
pageViewSchema.index({ user: 1, ts: -1 });
const PageView = mongoose.models.PageView || mongoose.model('PageView', pageViewSchema);

/* ── WatchSession: one doc per active "someone is watching X" session, updated via heartbeat ── */
const watchSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  movieId: Number,
  type: String,
  title: String,
  season: Number,
  episode: Number,
  username: String,
  email: String,
  poster_path: String,      // TMDB poster path so admin can render real artwork
  backdrop_path: String,    // TMDB backdrop path
  startedAt: { type: Number, default: () => Date.now() },
  lastSeen: { type: Number, default: () => Date.now() }
});
const WatchSession = mongoose.models.WatchSession || mongoose.model('WatchSession', watchSessionSchema);

/* ── WatchLog: permanent per-USER record every time someone starts watching.
      Feeds BOTH "most watched" AND the per-user watch history / profile. ── */
const watchLogSchema = new mongoose.Schema({
  sessionId: String,
  movieId: Number,
  type: String,
  title: String,
  username: { type: String, default: 'Guest' },   // who watched (username or guest_xxxx)
  email: String,
  season: Number,
  episode: Number,
  poster_path: String,    // TMDB poster path
  backdrop_path: String,  // TMDB backdrop path
  ts: { type: Number, default: () => Date.now() },        // startedAt
  lastSeen: { type: Number, default: () => Date.now() },  // kept alive by heartbeat
  endTs: Number,                                          // set on watch-end
  durationMin: Number,                                    // minutes watched
  ended: { type: Boolean, default: false }
});
watchLogSchema.index({ username: 1, ts: -1 });
watchLogSchema.index({ title: 1, ts: -1 });
const WatchLog = mongoose.models.WatchLog || mongoose.model('WatchLog', watchLogSchema);

/* ── TrialGrant: records every FREE 7-DAY trial won at signup so ADMIN sees it as TRIAL (not full VIP) ── */
const trialGrantSchema = new mongoose.Schema({
  user: { type: String, default: 'Guest' },      // username
  username: String,
  email: String,
  kind: { type: String, default: 'trial' },      // 'trial' | 'code' | 'manual'
  days: { type: Number, default: 7 },
  grantedAt: { type: Number, default: () => Date.now() },
  expiresAt: { type: Number, default: () => Date.now() }
});
trialGrantSchema.index({ grantedAt: -1 });
const TrialGrant = mongoose.models.TrialGrant || mongoose.model('TrialGrant', trialGrantSchema);

const ACTIVE_WINDOW_MS = 120000; // a watch session counts as "active" if heartbeat within last 2 min

/* tiny helpers */
const now = () => Date.now();
function durMin(startTs, endTs){ return Math.max(0, Math.round(((endTs || now()) - startTs) / 60000)); }

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    if(req.method === 'POST' || req.method === 'PUT'){
      const { action } = req.body;

      if(action === 'vip-grant'){
        const { kind, user, username, email, days, grantedAt, expiresAt } = req.body;
        const who = user || username || 'Guest';
        if(!who || who === 'Guest') return res.status(200).json({ success: true, skipped: 'guest' });
        await TrialGrant.create({
          user: who, username: who, email: email || '',
          kind: kind || 'trial',
          days: days || 7,
          grantedAt: grantedAt || now(),
          expiresAt: expiresAt || (now() + (days || 7) * 86400000)
        });
        return res.status(200).json({ success: true });
      }

      if(action === 'pageview'){
        const { path, referrer, user } = req.body;
        await PageView.create({
          user: user || 'Guest',
          path: path || '/',
          referrer: referrer || '',
          ua: req.headers['user-agent'] || ''
        });
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-start'){
        const { sessionId, movieId, type, title, season, episode, username, email, poster, backdrop } = req.body;
        if(!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const pp = poster || null;
        const bp = backdrop || null;

        await WatchSession.findOneAndUpdate(
          { sessionId },
          { sessionId, movieId, type, title, season, episode, username: username || 'Guest', email: email || '', poster_path: pp, backdrop_path: bp, startedAt: now(), lastSeen: now() },
          { upsert: true }
        );
        // permanent per-user watch record
        await WatchLog.create({
          sessionId, movieId, type, title,
          username: username || 'Guest', email: email || '',
          season, episode, poster_path: pp, backdrop_path: bp,
          ts: now(), lastSeen: now(), ended: false
        });
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-heartbeat'){
        const { sessionId, season, episode } = req.body;
        if(!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const update = { lastSeen: now() };
        if(season !== undefined) update.season = season;
        if(episode !== undefined) update.episode = episode;
        await WatchSession.findOneAndUpdate({ sessionId }, update);
        // keep the watch log alive too (live duration while watching)
        await WatchLog.updateOne({ sessionId, ended: { $ne: true } }, { lastSeen: now(), season, episode });
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-end'){
        const { sessionId } = req.body;
        if(sessionId){
          await WatchSession.deleteOne({ sessionId });
          const log = await WatchLog.findOne({ sessionId });
          if(log){
            log.ended = true;
            log.endTs = now();
            log.durationMin = durMin(log.ts, now());
            await log.save();
          }
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if(req.method === 'GET'){
      const { query } = req;

      if(query.type === 'stats'){
        const t = now();
        const dayAgo = t - 86400000;
        const weekAgo = t - 7 * 86400000;
        const monthAgo = t - 30 * 86400000;

        const [totalViews, viewsToday, viewsWeek, viewsMonth] = await Promise.all([
          PageView.countDocuments({}),
          PageView.countDocuments({ ts: { $gte: dayAgo } }),
          PageView.countDocuments({ ts: { $gte: weekAgo } }),
          PageView.countDocuments({ ts: { $gte: monthAgo } })
        ]);

        // Clean up stale sessions (no heartbeat in ACTIVE_WINDOW_MS) before counting
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });
        const activeSessions = (await WatchSession.find({}).sort({ lastSeen: -1 }).lean())
          .map(s => ({ ...s, user: s.username || 'Guest' }));   // expose `user` for the admin UI
        const activeNow = activeSessions.length;

        return res.status(200).json({
          totalViews, viewsToday, viewsWeek, viewsMonth, activeNow, activeSessions
        });
      }

      if(query.type === 'most-watched'){
        const range = query.range || 'all'; // 'today' | 'week' | 'all'
        const t = now();
        const match = {};
        if(range === 'today') match.ts = { $gte: t - 86400000 };
        if(range === 'week') match.ts = { $gte: t - 7 * 86400000 };

        const results = await WatchLog.aggregate([
          { $match: match },
          { $group: { _id: { movieId: '$movieId', type: '$type', title: '$title' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 }
        ]);

        return res.status(200).json({
          items: results.map(r => ({ movieId: r._id.movieId, type: r._id.type, title: r._id.title, count: r.count }))
        });
      }

      if(query.type === 'active-sessions'){
        const t = now();
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });
        const sessions = (await WatchSession.find({}).sort({ lastSeen: -1 }).lean())
          .map(s => ({ ...s, user: s.username || 'Guest' }));
        return res.status(200).json({ sessions });
      }

      /* ═══════════ NEW — every user with usage summary ═══════════ */
      if(query.type === 'users'){
        const t = now();
        await WatchSession.deleteMany({ lastSeen: { $lt: t - ACTIVE_WINDOW_MS } });

        const [pvGroups, wlGroups, activeDocs] = await Promise.all([
          PageView.aggregate([
            { $group: { _id: { $ifNull: ['$user', 'Guest'] },
                        visits: { $sum: 1 },
                        firstSeen: { $min: '$ts' },
                        lastSeen: { $max: '$ts' } } }
          ]),
          WatchLog.aggregate([
            { $group: { _id: { $ifNull: ['$username', 'Guest'] },
                        watchCount: { $sum: 1 },
                        watchMinutes: { $sum: { $ifNull: ['$durationMin', 0] } },
                        firstSeen: { $min: '$ts' },
                        lastSeen: { $max: { $ifNull: ['$endTs', '$lastSeen', '$ts'] } } } }
          ]),
          WatchSession.find({}).select('username lastSeen').lean()
        ]);

        const activeUsers = new Set(activeDocs.map(s => s.username || 'Guest'));
        const map = new Map();

        pvGroups.forEach(g => map.set(g._id, { user: g._id, visits: g.visits, firstSeen: g.firstSeen, lastSeen: g.lastSeen, watchCount: 0, watchMinutes: 0, active: false }));
        wlGroups.forEach(g => {
          const u = map.get(g._id) || { user: g._id, visits: 0, firstSeen: null, lastSeen: null };
          u.watchCount = g.watchCount;
          u.watchMinutes = g.watchMinutes;
          if (!u.firstSeen || g.firstSeen < u.firstSeen) u.firstSeen = g.firstSeen;
          if (!u.lastSeen || g.lastSeen > u.lastSeen) u.lastSeen = g.lastSeen;
          map.set(g._id, u);
        });
        activeUsers.forEach(u => {
          const x = map.get(u);
          if (x) x.active = true;
          else map.set(u, { user: u, visits: 0, firstSeen: null, lastSeen: null, watchCount: 0, watchMinutes: 0, active: true });
        });

        const users = [...map.values()]
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
          .slice(0, 200);

        return res.status(200).json({ users });
      }

      /* ═══════════ NEW — one user's full profile + watch history ═══════════ */
      if(query.type === 'user'){
        const user = query.user || 'Guest';
        const [pvs, logs, activeDoc] = await Promise.all([
          PageView.find({ user }).lean(),
          WatchLog.find({ username: user }).sort({ ts: -1 }).lean(),
          WatchSession.exists({ username: user })
        ]);

        const profile = {
          user,
          firstSeen: null,
          lastSeen: null,
          visits: pvs.length,
          watchCount: logs.length,
          watchMinutes: 0,
          active: !!activeDoc
        };
        pvs.forEach(p => {
          if (!profile.firstSeen || p.ts < profile.firstSeen) profile.firstSeen = p.ts;
          if (!profile.lastSeen || p.ts > profile.lastSeen) profile.lastSeen = p.ts;
        });
        logs.forEach(l => {
          profile.watchMinutes += (l.durationMin || 0);
          const lLast = l.endTs || l.lastSeen || l.ts;
          if (!profile.lastSeen || lLast > profile.lastSeen) profile.lastSeen = lLast;
          if (!profile.firstSeen || l.ts < profile.firstSeen) profile.firstSeen = l.ts;
        });

        const history = logs.map(l => ({
          sessionId: l.sessionId,
          movieId: l.movieId,
          title: l.title || 'Untitled',
          type: l.type || 'movie',
          season: l.season || 1,
          episode: l.episode || 1,
          poster_path: l.poster_path || '',
          backdrop_path: l.backdrop_path || '',
          startedAt: l.ts,
          lastSeen: l.lastSeen || l.endTs || l.ts,
          // "in progress" ONLY while it is genuinely live right now — never an old watch
          inProgress: !l.ended && ((now() - (l.lastSeen || l.endTs || l.ts)) < ACTIVE_WINDOW_MS),
          durationMin: l.durationMin ?? durMin(l.ts, l.endTs || l.lastSeen || l.ts),
          ended: !!l.ended
        }));

        return res.status(200).json({ profile, history });
      }

      /* ═══════════ NEW — free 7-day trial grants (shown as TRIAL, not full VIP) ═══════════ */
      if(query.type === 'vip-grants'){
        const limit = Math.min(Number(query.limit) || 200, 500);
        const grants = (await TrialGrant.find({}).sort({ grantedAt: -1 }).limit(limit).lean());
        return res.status(200).json({ grants });
      }

      return res.status(400).json({ error: 'Unknown query type' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('Analytics API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
