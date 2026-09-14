import { Broadcast, connectDB, cors, now, adminPinOk } from './_db.js';

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
      const doc = await Broadcast.findOne({ singleton: 'main' });
      return res.status(200).json({ message: doc?.message || '', updatedAt: doc?.updatedAt || 0 });
    }

    if (req.method === 'POST') {
      if (!adminPinOk(req)) return res.status(401).json({ error: 'Unauthorized' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const doc = await Broadcast.findOneAndUpdate(
        { singleton: 'main' },
        { message: String(body.message || '').slice(0, 500), updatedAt: now() },
        { upsert: true, new: true },
      );
      return res.status(200).json({ message: doc.message, updatedAt: doc.updatedAt });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Broadcast API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
