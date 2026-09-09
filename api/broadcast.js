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

const broadcastSchema = new mongoose.Schema({
  singleton: { type: String, default: 'main', unique: true },
  message: { type: String, default: '' },
  updatedAt: { type: Number, default: () => Date.now() }
});
const Broadcast = mongoose.models.Broadcast || mongoose.model('Broadcast', broadcastSchema);

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    if(req.method === 'GET'){
      const doc = await Broadcast.findOne({ singleton: 'main' });
      return res.status(200).json({ message: doc?.message || '', updatedAt: doc?.updatedAt || 0 });
    }

    if(req.method === 'POST'){
      const { message } = req.body;
      const doc = await Broadcast.findOneAndUpdate(
        { singleton: 'main' },
        { message: message || '', updatedAt: Date.now() },
        { upsert: true, new: true }
      );
      return res.status(200).json({ message: doc.message, updatedAt: doc.updatedAt });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('Broadcast API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
