const { connectToDatabase } = require('../../../lib/mongodb');
const { handlePreflight } = require('../../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.query;
  const { userName, season, ep } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code is required' });

  try {
    const { db } = await connectToDatabase();
    const rooms = db.collection('rooms');

    await rooms.updateOne(
      { code: code.toUpperCase() },
      { $set: { season: season || 1, ep: ep || 1, lastSyncBy: userName, updatedAt: new Date() } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('rooms/sync error:', err);
    return res.status(500).json({ error: 'Server error syncing playback' });
  }
};
