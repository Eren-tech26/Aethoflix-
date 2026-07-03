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

const userSchema = new mongoose.Schema({
  uid: {type: String, required: true, unique: true},
  email: String,
  displayName: String,
  photoURL: String,
  watchlist: [{type: Object}],
  createdAt: {type: Date, default: Date.now}
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();
  const {uid} = req.query;

  try{
    if(req.method === 'GET'){
      const user = await User.findOne({uid});
      return res.status(200).json(user || {watchlist: []});
    }

    if(req.method === 'POST'){
      const {email, displayName, photoURL} = req.body;
      let user = await User.findOne({uid});
      if(!user){
        user = await User.create({uid, email, displayName, photoURL});
      } else {
        user.email = email;
        user.displayName = displayName;
        user.photoURL = photoURL;
        await user.save();
      }
      return res.status(201).json(user);
    }

    if(req.method === 'PUT'){
      const {watchlist} = req.body;
      const user = await User.findOneAndUpdate({uid}, {watchlist}, {new: true});
      return res.status(200).json(user);
    }

    res.status(405).json({error: 'Method not allowed'});
  }catch(err){
    console.error('API error:', err);
    res.status(500).json({error: 'Server error'});
  }
}
