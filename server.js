const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ DB Connected')).catch(err => console.log('❌ DB Error:', err));

// Room Schema
const roomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true },
  hostId: String,
  hostName: String,
  title: String,
  videoId: String,
  videoType: String,
  currentTime: Number,
  isPlaying: Boolean,
  createdAt: { type: Date, default: Date.now, expires: 21600 },
  members: [{ userId: String, username: String, avatar: String, joinedAt: Date }],
  messages: [{ 
    userId: String,
    username: String,
    avatar: String,
    text: String,
    timestamp: { type: Date, default: Date.now, expires: 240 }
  }]
});

const Room = mongoose.model('Room', roomSchema);

function genRoomId() {
  return 'party_' + Math.random().toString(36).slice(2, 10);
}

// REST API
app.post('/api/room/create', async (req, res) => {
  try {
    const { hostId, hostName, avatar, title, videoId, videoType } = req.body;
    const roomId = genRoomId();
    
    const room = new Room({
      roomId,
      hostId,
      hostName,
      title,
      videoId,
      videoType,
      currentTime: 0,
      isPlaying: false,
      members: [{ userId: hostId, username: hostName, avatar, joinedAt: new Date() }]
    });
    
    await room.save();
    res.json({ success: true, roomId, inviteLink: `https://aethoflix.vercel.app/party.html?room=${roomId}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/room/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log('🟢 Connected:', socket.id);

  socket.on('join-room', async (data) => {
    const { roomId, userId, username, avatar } = data;
    socket.join(roomId);
    
    try {
      const room = await Room.findOne({ roomId });
      if (!room) {
        socket.emit('error', 'Room not found');
        return;
      }

      const exists = room.members.some(m => m.userId === userId);
      if (!exists) {
        room.members.push({ userId, username, avatar, joinedAt: new Date() });
        await room.save();
      }

      io.to(roomId).emit('user-joined', { userId, username, avatar, members: room.members });
      socket.emit('room-data', { room, isHost: room.hostId === userId });
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('play', (data) => {
    io.to(data.roomId).emit('play', data);
  });

  socket.on('pause', (data) => {
    io.to(data.roomId).emit('pause', data);
  });

  socket.on('send-message', async (data) => {
    const { roomId, userId, username, avatar, text } = data;
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        const msg = { userId, username, avatar, text, timestamp: new Date() };
        room.messages.push(msg);
        if (room.messages.length > 100) room.messages = room.messages.slice(-100);
        await room.save();
        io.to(roomId).emit('message', msg);
      }
    } catch (err) {
      console.log('Chat error:', err);
    }
  });

  socket.on('end-room', async (data) => {
    const { roomId } = data;
    io.to(roomId).emit('room-ended');
    io.socketsLeave(roomId);
    try {
      await Room.deleteOne({ roomId });
    } catch (err) {
      console.log('Error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));
