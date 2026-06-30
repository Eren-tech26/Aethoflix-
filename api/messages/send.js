const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { roomCode, userName, message } = req.body || {};
    if (!roomCode || !userName || !message) {
      return res.status(400).json({ error: 'roomCode, userName, and message are required' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const { db } = await connectToDatabase();
    const messages = db.collection('messages');

    const now = new Date();
    await messages.insertOne({
      roomCode: roomCode.toUpperCase(),
      userName,
      message,
      timestamp: now,
      expiresAt: new Date(now.getTime() + 4 * 60 * 1000),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('messages/send error:', err);
    return res.status(500).json({ error: 'Server error sending message' });
  }
};
