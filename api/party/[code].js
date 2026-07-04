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
  pendingRequests: [{type: String}],
  mutedUsers: [{type: String}],
  bannedUsers: [{type: String}],
  hostElapsedSeconds: {type: Number, default: 0},
  hostElapsedUpdatedAt: {type: Number, default: 0},
  hostSource: {type: Number, default: 0},
  hostPlaying: {type: Boolean, default: false},
  nudge: {
    text: String,
    ts: Number
  },
  createdAt: {type: Date, default: Date.now, expires: 21600}
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
      if(!hostName || !hostName.trim()) return res.status(400).json({error: 'Host name required'});

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
        pendingRequests: [],
        mutedUsers: [],
        bannedUsers: [],
        hostElapsedSeconds: 0,
        hostElapsedUpdatedAt: Date.now(),
        hostSource: 0,
        hostPlaying: false,
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
      const {action, name, nudgeText, elapsedSeconds} = req.body;
      const room = await Party.findOne({code});
      if(!room) return res.status(404).json({error: 'Room not found'});

      if(action === 'request-join'){
        if(room.bannedUsers.includes(name)) return res.status(403).json({error: 'You have been removed from this party'});
        if(!room.members.includes(name) && !room.pendingRequests.includes(name)){
          room.pendingRequests.push(name);
        }
      }

      else if(action === 'approve-join'){
        room.pendingRequests = room.pendingRequests.filter(n => n !== name);
        if(!room.members.includes(name)) room.members.push(name);
      }

      else if(action === 'reject-join'){
        room.pendingRequests = room.pendingRequests.filter(n => n !== name);
      }

      else if(action === 'leave'){
        room.members = room.members.filter(m => m !== name);
      }

      else if(action === 'mute'){
        if(!room.mutedUsers.includes(name)) room.mutedUsers.push(name);
      }

      else if(action === 'unmute'){
        room.mutedUsers = room.mutedUsers.filter(m => m !== name);
      }

      else if(action === 'kick'){
        room.members = room.members.filter(m => m !== name);
        room.mutedUsers = room.mutedUsers.filter(m => m !== name);
      }

      else if(action === 'ban'){
        room.members = room.members.filter(m => m !== name);
        room.mutedUsers = room.mutedUsers.filter(m => m !== name);
        if(!room.bannedUsers.includes(name)) room.bannedUsers.push(name);
      }

      else if(action === 'nudge'){
        room.nudge = {text: nudgeText, ts: Date.now()};
      }

      else if(action === 'host-heartbeat'){
        room.hostElapsedSeconds = elapsedSeconds || 0;
        room.hostElapsedUpdatedAt = Date.now();
        if(req.body.source !== undefined) room.hostSource = req.body.source;
        if(req.body.playing !== undefined) room.hostPlaying = req.body.playing;
      }

      else {
        return res.status(400).json({error: 'Unknown action'});
      }

      await room.save();
      return res.status(200).json(room);
    }

    if(req.method === 'DELETE'){
      await Party.deleteOne({code});
      return res.status(200).json({success: true});
    }

    res.status(405).json({error: 'Method not allowed'});
  }catch(err){
    console.error('Party API error:', err);
    res.status(500).json({error: 'Server error'});
  }
}
