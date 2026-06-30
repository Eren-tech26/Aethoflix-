const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Replace with your MongoDB connection string
const MONGO_URI = 'mongodb+srv://Eren200511:Eren@2005@cluster0.mqpoth4.mongodb.net/?appName=Cluster0';
const client = new MongoClient(MONGO_URI);

let db;
let roomsCollection;
let messagesCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    db = client.db('watch_party');
    roomsCollection = db.collection('rooms');
    messagesCollection = db.collection('messages');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

// Generate unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'party-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create a new watch party room
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { hostName } = req.body;
    const roomCode = generateRoomCode();
    
    const room = {
      roomCode,
      hostName,
      viewers: [hostName],
      createdAt: new Date(),
      currentTime: 0,
      isPlaying: false
    };
    
    await roomsCollection.insertOne(room);
    res.json({ roomCode, room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join a room
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomCode, userName } = req.body;
    
    const room = await roomsCollection.findOne({ roomCode });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Add viewer if not already there
    if (!room.viewers.includes(userName)) {
      await roomsCollection.updateOne(
        { roomCode },
        { $push: { viewers: userName } }
      );
    }
    
    res.json({ room: { ...room, viewers: [...(room.viewers || []), userName] } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get room details
app.get('/api/rooms/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const room = await roomsCollection.findOne({ roomCode });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
app.post('/api/messages/send', async (req, res) => {
  try {
    const { roomCode, userName, message } = req.body;
    
    const msg = {
      roomCode,
      userName,
      message,
      timestamp: new Date(),
      _id: new ObjectId()
    };
    
    await messagesCollection.insertOne(msg);
    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a room
app.get('/api/messages/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const messages = await messagesCollection
      .find({ roomCode })
      .sort({ timestamp: 1 })
      .toArray();
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update room state (play/pause, current time)
app.put('/api/rooms/:roomCode/state', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { isPlaying, currentTime } = req.body;
    
    const update = {};
    if (isPlaying !== undefined) update.isPlaying = isPlaying;
    if (currentTime !== undefined) update.currentTime = currentTime;
    
    const result = await roomsCollection.updateOne(
      { roomCode },
      { $set: update }
    );
    
    res.json({ success: result.modifiedCount > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove viewer from room
app.post('/api/rooms/:roomCode/leave', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { userName } = req.body;
    
    await roomsCollection.updateOne(
      { roomCode },
      { $pull: { viewers: userName } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
