import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
let isConnected = false;

async function connectDB(){
  if(isConnected) return;
  try{
    await mongoose.connect(MONGO_URI);
    isConnected = true;
  }catch(err){
    console.error('DB error:', err);
    throw err;
  }
}

const vipCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  type: { type: String, default: 'permanent' }, // permanent | 7d | 30d | 1use
  status: { type: String, default: 'active' },  // active | used | revoked
  expires: { type: Number, default: null },
  created: { type: Number, default: () => Date.now() }
});
const VipCode = mongoose.models.VipCode || mongoose.model('VipCode', vipCodeSchema);

const redemptionSchema = new mongoose.Schema({
  code: String,
  deviceLabel: String, // optional, e.g. rough UA — not tied to identity
  at: { type: Number, default: () => Date.now() }
});
const Redemption = mongoose.models.Redemption || mongoose.model('Redemption', redemptionSchema);

function generateCodeStr(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VIP-';
  for(let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    if(req.method === 'GET'){
      const { query } = req;

      // Redeem check / validate a specific code (used by the player-side VIP gate)
      if(query.check){
        const code = await VipCode.findOne({ code: query.check.toUpperCase() });
        if(!code) return res.status(200).json({ valid: false, reason: 'not_found' });
        if(code.status === 'revoked') return res.status(200).json({ valid: false, reason: 'revoked' });
        if(code.status === 'used' && code.type === '1use') return res.status(200).json({ valid: false, reason: 'used' });
        if(code.expires && Date.now() > code.expires) return res.status(200).json({ valid: false, reason: 'expired' });
        return res.status(200).json({ valid: true, code: code.code, expires: code.expires, type: code.type });
      }

      // List all codes (admin panel)
      const codes = await VipCode.find({}).sort({ created: -1 }).lean();
      const redemptions = await Redemption.find({}).sort({ at: -1 }).limit(200).lean();
      return res.status(200).json({ codes, redemptions });
    }

    if(req.method === 'POST'){
      const { action } = req.body;

      if(action === 'generate'){
        const { type } = req.body;
        let expires = null;
        if(type === '7d') expires = Date.now() + 7 * 86400000;
        if(type === '30d') expires = Date.now() + 30 * 86400000;

        let code = generateCodeStr();
        while(await VipCode.findOne({ code })) code = generateCodeStr();

        const doc = await VipCode.create({ code, type: type || 'permanent', status: 'active', expires });
        return res.status(201).json(doc);
      }

      if(action === 'redeem'){
        const { code } = req.body;
        if(!code) return res.status(400).json({ error: 'Code required' });
        const entered = code.toUpperCase();
        const found = await VipCode.findOne({ code: entered });

        if(!found) return res.status(200).json({ success: false, reason: 'not_found' });
        if(found.status === 'revoked') return res.status(200).json({ success: false, reason: 'revoked' });
        if(found.status === 'used' && found.type === '1use') return res.status(200).json({ success: false, reason: 'used' });
        if(found.expires && Date.now() > found.expires) return res.status(200).json({ success: false, reason: 'expired' });

        if(found.type === '1use'){
          found.status = 'used';
          await found.save();
        }
        await Redemption.create({ code: entered });

        return res.status(200).json({ success: true, code: found.code, expires: found.expires, type: found.type });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if(req.method === 'PUT'){
      const { action, code } = req.body;
      if(action === 'revoke'){
        await VipCode.findOneAndUpdate({ code }, { status: 'revoked' });
        return res.status(200).json({ success: true });
      }
      if(action === 'revoke-all'){
        await VipCode.updateMany({ status: 'active' }, { status: 'revoked' });
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    if(req.method === 'DELETE'){
      await VipCode.deleteMany({});
      await Redemption.deleteMany({});
      return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('VIP API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
