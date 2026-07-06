import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
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

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 20, match: /^[a-z0-9_]+$/ },
  passwordHash: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

function makeToken(user){
  return jwt.sign({ uid: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    if(req.method === 'GET'){
      const { verify } = req.query;
      if(!verify) return res.status(400).json({ error: 'Token required' });
      try{
        const payload = jwt.verify(verify, JWT_SECRET);
        return res.status(200).json({ valid: true, username: payload.username });
      }catch{
        return res.status(200).json({ valid: false });
      }
    }

    if(req.method === 'POST'){
      const { action } = req.body;

      if(action === 'register'){
        let { username, password } = req.body;
        if(!username || !password) return res.status(400).json({ success: false, reason: 'missing_fields' });
        username = username.toLowerCase().trim();

        if(!/^[a-z0-9_]{3,20}$/.test(username)){
          return res.status(200).json({ success: false, reason: 'invalid_username' });
        }
        if(password.length < 6){
          return res.status(200).json({ success: false, reason: 'weak_password' });
        }

        const existing = await User.findOne({ username });
        if(existing) return res.status(200).json({ success: false, reason: 'taken' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, passwordHash });
        const token = makeToken(user);
        return res.status(201).json({ success: true, username: user.username, token });
      }

      if(action === 'login'){
        let { username, password } = req.body;
        if(!username || !password) return res.status(400).json({ success: false, reason: 'missing_fields' });
        username = username.toLowerCase().trim();

        const user = await User.findOne({ username });
        if(!user) return res.status(200).json({ success: false, reason: 'not_found' });

        const match = await bcrypt.compare(password, user.passwordHash);
        if(!match) return res.status(200).json({ success: false, reason: 'wrong_password' });

        const token = makeToken(user);
        return res.status(200).json({ success: true, username: user.username, token });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('Auth API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
