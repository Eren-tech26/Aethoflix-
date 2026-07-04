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

const partySchema = new mongoose.Schema({
  code: {type: String, required: true, unique: true},
  movieId: Number,
  type: String,
  season: Number,
  episode: Number,
  hostName: String,
  members: [{type: String}],
  nudge: {
    text: String,
    ts: Number
  },
  createdAt: {type: Date, default: Date.now}
});

const Party = mongoose.models.Party || mongoose.model('Party', partySchema);

function generateCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();
  const {code} = req.query;

  try{
    if(req.method === 'POST'){
      const {movieId, type, season, episode, hostName} = req.body;
      let newCode = generateCode();
      let exists = await Party.findOne({code: newCode});
      while(exists){
        newCode = generateCode();
        exists = await Party.findOne({code: newCode});
      }
      const room = await Party.create({
        code: newCode,
        movieId, type, season, episode,
        hostName,
        members: [hostName],
        nudge: null
      });
      return res.status(201).json(room);
    }

    if(req.method === 'GET'){
      const room = await Party.findOne({code});
      if(!room) return res.status(404).json({error: 'Room not found'});
      return res.status(200).json(room);
    }

    if(req.method === 'PUT'){
      const {action, name, nudgeText} = req.body;
      const room = await Party.findOne({code});
      if(!room) return res.status(404).json({error: 'Room not found'});

      if(action === 'join'){
        if(!room.members.includes(name)) room.members.push(name);
      }
      if(action === 'leave'){
        room.members = room.members.filter(m => m !== name);
      }
      if(action === 'nudge'){
        room.nudge = {text: nudgeText, ts: Date.now()};
      }

      await room.save();
      return res.status(200).json(room);
    }

    res.status(405).json({error: 'Method not allowed'});
  }catch(err){
    console.error('Party API error:', err);
    res.status(500).json({error: 'Server error'});
  }
}
