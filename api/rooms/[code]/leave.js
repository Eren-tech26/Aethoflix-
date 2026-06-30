const { connectToDatabase } = require('../../../lib/mongodb');
const { handlePreflight } = require('../../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.query;
  const { userName } = req.body || {};
  if (!code || !userName) {
    return res.status(400).json({ error: 'code and userName are required' });
  }

  try {
    const { db } = await connectToDatabase();
    const rooms = db.collection('rooms');

    await rooms.updateOne(
      { code: code.toUpperCase() },
      { $pull: { viewers: userName }, $set: { updatedAt: new Date() } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('rooms/leave error:', err);
    return res.status(500).json({ error: 'Server error leaving room' });
  }
};
