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

/* ── PageView: one doc per site visit ── */
const pageViewSchema = new mongoose.Schema({
  path: String,
  referrer: String,
  ua: String,
  ts: { type: Number, default: () => Date.now() }
});
const PageView = mongoose.models.PageView || mongoose.model('PageView', pageViewSchema);

/* ── WatchSession: one doc per active "someone is watching X" session, updated via heartbeat ── */
const watchSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  movieId: Number,
  type: String,
  title: String,
  season: Number,
  episode: Number,
  startedAt: { type: Number, default: () => Date.now() },
  lastSeen: { type: Number, default: () => Date.now() }
});
const WatchSession = mongoose.models.WatchSession || mongoose.model('WatchSession', watchSessionSchema);

/* ── WatchLog: permanent record every time someone starts watching something (for "most watched") ── */
const watchLogSchema = new mongoose.Schema({
  movieId: Number,
  type: String,
  title: String,
  ts: { type: Number, default: () => Date.now() }
});
const WatchLog = mongoose.models.WatchLog || mongoose.model('WatchLog', watchLogSchema);

const ACTIVE_WINDOW_MS = 30000; // a watch session counts as "active" if heartbeat within last 30s

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    if(req.method === 'POST'){
      const { action } = req.body;

      if(action === 'pageview'){
        const { path, referrer } = req.body;
        await PageView.create({
          path: path || '/',
          referrer: referrer || '',
          ua: req.headers['user-agent'] || ''
        });
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-start'){
        const { sessionId, movieId, type, title, season, episode } = req.body;
        if(!sessionId) return res.status(400).json({ error: 'sessionId required' });

        await WatchSession.findOneAndUpdate(
          { sessionId },
          { sessionId, movieId, type, title, season, episode, startedAt: Date.now(), lastSeen: Date.now() },
          { upsert: true }
        );
        await WatchLog.create({ movieId, type, title });
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-heartbeat'){
        const { sessionId, season, episode } = req.body;
        if(!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const update = { lastSeen: Date.now() };
        if(season !== undefined) update.season = season;
        if(episode !== undefined) update.episode = episode;
        await WatchSession.findOneAndUpdate({ sessionId }, update);
        return res.status(200).json({ success: true });
      }

      if(action === 'watch-end'){
        const { sessionId } = req.body;
        if(sessionId) await WatchSession.deleteOne({ sessionId });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if(req.method === 'GET'){
      const { query } = req;

      if(query.type === 'stats'){
        const now = Date.now();
        const dayAgo = now - 86400000;
        const weekAgo = now - 7 * 86400000;
        const monthAgo = now - 30 * 86400000;

        const [totalViews, viewsToday, viewsWeek, viewsMonth] = await Promise.all([
          PageView.countDocuments({}),
          PageView.countDocuments({ ts: { $gte: dayAgo } }),
          PageView.countDocuments({ ts: { $gte: weekAgo } }),
          PageView.countDocuments({ ts: { $gte: monthAgo } })
        ]);

        // Clean up stale sessions (no heartbeat in ACTIVE_WINDOW_MS) before counting
        await WatchSession.deleteMany({ lastSeen: { $lt: now - ACTIVE_WINDOW_MS } });
        const activeSessions = await WatchSession.find({}).sort({ lastSeen: -1 }).lean();
        const activeNow = activeSessions.length;

        return res.status(200).json({
          totalViews, viewsToday, viewsWeek, viewsMonth, activeNow, activeSessions
        });
      }

      if(query.type === 'most-watched'){
        const range = query.range || 'all'; // 'today' | 'week' | 'all'
        const now = Date.now();
        const match = {};
        if(range === 'today') match.ts = { $gte: now - 86400000 };
        if(range === 'week') match.ts = { $gte: now - 7 * 86400000 };

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
        const now = Date.now();
        await WatchSession.deleteMany({ lastSeen: { $lt: now - ACTIVE_WINDOW_MS } });
        const sessions = await WatchSession.find({}).sort({ lastSeen: -1 }).lean();
        return res.status(200).json({ sessions });
      }

      return res.status(400).json({ error: 'Unknown query type' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('Analytics API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
