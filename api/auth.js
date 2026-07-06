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
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true, default: null },
  passwordHash: { type: String, required: true },
  createdAt: { type: Number, default: () => Date.now() }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Turns "john.doe+92@example.com" into a clean username candidate "john_doe92"
function slugifyEmail(email){
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if(base.length < 3) base = ('user_' + base).slice(0, 20);
  if(base.length > 20) base = base.slice(0, 20);
  return base;
}

// Ensures the derived username is unique, appending a short numeric suffix if needed
async function uniqueUsernameFrom(base){
  let candidate = base;
  let i = 0;
  while(await User.findOne({ username: candidate })){
    i++;
    const suffix = String(i);
    candidate = (base.slice(0, 20 - suffix.length) + suffix);
  }
  return candidate;
}

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
        const identifier = username.toLowerCase().trim();
        const isEmail = identifier.includes('@');

        if(password.length < 6){
          return res.status(200).json({ success: false, reason: 'weak_password' });
        }

        let email = null;
        let finalUsername;

        if(isEmail){
          if(!EMAIL_RE.test(identifier)){
            return res.status(200).json({ success: false, reason: 'invalid_email' });
          }
          const existingEmail = await User.findOne({ email: identifier });
          if(existingEmail) return res.status(200).json({ success: false, reason: 'taken' });

          email = identifier;
          finalUsername = await uniqueUsernameFrom(slugifyEmail(identifier));
        }else{
          if(!USERNAME_RE.test(identifier)){
            return res.status(200).json({ success: false, reason: 'invalid_username' });
          }
          const existingUser = await User.findOne({ username: identifier });
          if(existingUser) return res.status(200).json({ success: false, reason: 'taken' });

          finalUsername = identifier;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username: finalUsername, email, passwordHash });
        const token = makeToken(user);
        return res.status(201).json({ success: true, username: user.username, token });
      }

      if(action === 'login'){
        let { username, password } = req.body;
        if(!username || !password) return res.status(400).json({ success: false, reason: 'missing_fields' });
        const identifier = username.toLowerCase().trim();

        const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
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
