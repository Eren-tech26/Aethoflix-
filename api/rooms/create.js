const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight, genRoomCode } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userName, contentId, contentType, season, ep } = req.body || {};
    if (!userName) {
      return res.status(400).json({ error: 'userName is required' });
    }

    const { db } = await connectToDatabase();
    const rooms = db.collection('rooms');

    let code;
    for (let i = 0; i < 5; i++) {
      const candidate = genRoomCode();
      const exists = await rooms.findOne({ code: candidate });
      if (!exists) { code = candidate; break; }
    }
    if (!code) {
      return res.status(500).json({ error: 'Could not generate unique room code, try again' });
    }

    const now = new Date();
    const room = {
      code,
      hostName: userName,
      viewers: [userName],
      contentId: contentId || null,
      contentType: contentType || null,
      season: season || 1,
      ep: ep || 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
    };

    await rooms.insertOne(room);

    return res.status(200).json({ code, room });
  } catch (err) {
    console.error('rooms/create error:', err);
    return res.status(500).json({ error: 'Server error creating room' });
  }
};
