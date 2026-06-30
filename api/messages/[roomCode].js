const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomCode } = req.query;
  if (!roomCode) return res.status(400).json({ error: 'Missing roomCode' });

  try {
    const { db } = await connectToDatabase();
    const messages = db.collection('messages');

    const now = new Date();
    const list = await messages
      .find({ roomCode: roomCode.toUpperCase(), expiresAt: { $gt: now } })
      .sort({ timestamp: 1 })
      .limit(100)
      .toArray();

    return res.status(200).json(list);
  } catch (err) {
    console.error('messages/[roomCode] error:', err);
    return res.status(500).json({ error: 'Server error fetching messages' });
  }
};
