const { connectToDatabase } = require('../../lib/mongodb');
const { handlePreflight } = require('../../lib/helpers');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code } = req.body || {};
    if (!code) return res.status(200).json({ valid: false, error: 'code required' });

    const { db } = await connectToDatabase();
    const codes = db.collection('vipCodes');

    const entry = await codes.findOne({ code: code.toUpperCase() });

    if (!entry || entry.status !== 'active') {
      return res.status(200).json({ valid: false });
    }

    if (entry.expires && Date.now() > entry.expires) {
      await codes.updateOne({ code: entry.code }, { $set: { status: 'revoked' } });
      return res.status(200).json({ valid: false });
    }

    if (entry.type === '1use') {
      await codes.updateOne({ code: entry.code }, { $set: { status: 'used' } });
    }

    await db.collection('vipRedemptions').insertOne({
      code: entry.code,
      at: new Date(),
    });

    return res.status(200).json({ valid: true, expires: entry.expires || null });
  } catch (err) {
    console.error('vip/redeem error:', err);
    return res.status(500).json({ valid: false, error: 'Server error' });
  }
};
