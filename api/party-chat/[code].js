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

const partyChatSchema = new mongoose.Schema({
  code: {type: String, required: true},
  username: String,
  text: String,
  system: {type: Boolean, default: false},
  createdAt: {type: Date, default: Date.now}
});

const PartyChat = mongoose.models.PartyChat || mongoose.model('PartyChat', partyChatSchema);

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();
  const {code} = req.query;

  try{
    if(req.method === 'GET'){
      const messages = await PartyChat.find({code}).sort({createdAt: 1}).limit(200);
      return res.status(200).json(messages);
    }

    if(req.method === 'POST'){
      const {username, text, system} = req.body;
      const msg = await PartyChat.create({code, username, text, system: !!system});
      return res.status(201).json(msg);
    }

    res.status(405).json({error: 'Method not allowed'});
  }catch(err){
    console.error('Party chat API error:', err);
    res.status(500).json({error: 'Server error'});
  }
}
