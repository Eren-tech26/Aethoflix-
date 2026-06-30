const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, userName } = req.body || {};
    if (!code || !userName) {
      return res.status(400).json({ error: 'code and userName are required' });
    }

    const { db } = await connectToDatabase();
    const rooms = db.collection('rooms');

    const room = await rooms.findOne({ code: code.toUpperCase() });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.viewers.includes(userName)) {
      await rooms.updateOne(
        { code: room.code },
        { $push: { viewers: userName }, $set: { updatedAt: new Date() } }
      );
    }

    const updated = await rooms.findOne({ code: room.code });
    return res.status(200).json({ room: updated });
  } catch (err) {
    console.error('rooms/join error:', err);
    return res.status(500).json({ error: 'Server error joining room' });
  }
};
