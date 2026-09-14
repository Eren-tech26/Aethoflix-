import { Report, connectDB, cors, now, adminPinOk } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await connectDB();
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Database connection failed' });
  }

  try {
    if (req.method === 'GET') {
      if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
      const status = req.query.status || 'all';
      const filter = status === 'all' ? {} : { status };
      const reports = await Report.find(filter).sort({ ts: -1 }).limit(200).lean();
      return res.status(200).json({ reports });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.action === 'update') {
        if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
        const status = body.status === 'resolved' || body.status === 'deleted' || body.status === 'new' ? body.status : null;
        if (!body.id || !status) return res.status(400).json({ error: 'id and status required' });
        await Report.findByIdAndUpdate(body.id, { status, resolvedAt: status === 'resolved' ? now() : undefined });
        return res.status(200).json({ success: true });
      }
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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Report API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
