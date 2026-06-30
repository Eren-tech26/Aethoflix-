const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing room code' });

  const { db } = await connectToDatabase();
  const rooms = db.collection('rooms');

  if (req.method === 'GET') {
    const room = await rooms.findOne({ code: code.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    return res.status(200).json(room);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
