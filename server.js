const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let db;
let usersCollection;
let otpCollection;
let watchHistoryCollection;
let reportsCollection;
let roomsCollection;
let messagesCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    db = client.db('aethoflix');
    usersCollection = db.collection('users');
    otpCollection = db.collection('otps');
    watchHistoryCollection = db.collection('watch_history');
    reportsCollection = db.collection('reports');
    roomsCollection = db.collection('rooms');
    messagesCollection = db.collection('messages');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}

// Email Transporter (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Generate JWT Token
function generateToken(userId, role = 'user') {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Middleware: Verify Token
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.role = decoded.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/* ═══════════════════════════════════════════════════════════
   AUTH ENDPOINTS
   ═══════════════════════════════════════════════════════════ */

// 1. SIGN UP - Send OTP to email
app.post('/api/auth/signup/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Check if user exists
    const existing = await usersCollection.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save OTP
    await otpCollection.updateOne(
      { email },
      { $set: { otp, expiresAt, type: 'signup' } },
      { upsert: true }
    );

    // Send email
    await transporter.sendMail({
      to: email,
      subject: '🔐 AethoFlix - Verify Your Email',
      html: `
        <h2>Welcome to AethoFlix!</h2>
        <p>Your OTP is: <strong style="font-size:24px;color:#e50914">${otp}</strong></p>
        <p>This OTP expires in 10 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      `
    });

    res.json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. SIGN UP - Verify OTP & Create Account
app.post('/api/auth/signup/verify', async (req, res) => {
  try {
    const { email, otp, password, name } = req.body;

    if (!email || !otp || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    // Verify OTP
    const otpDoc = await otpCollection.findOne({ email, type: 'signup' });
    if (!otpDoc) return res.status(400).json({ error: 'OTP not found. Request new OTP.' });
    if (otpDoc.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (Date.now() > otpDoc.expiresAt) return res.status(400).json({ error: 'OTP expired' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      email,
      name,
      password: hashedPassword,
      role: 'user',
      plan: 'free',
      createdAt: new Date(),
      avatar: null,
      preferences: {
        quality: '720p',
        language: 'en',
        notifications: true
      }
    };

    const result = await usersCollection.insertOne(user);
    await otpCollection.deleteOne({ email, type: 'signup' });

    const token = generateToken(result.insertedId, 'user');
    res.json({
      success: true,
      token,
      user: {
        id: result.insertedId,
        email,
        name,
        role: 'user',
        plan: 'free'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. LOGIN - Send OTP
app.post('/api/auth/login/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Check if user exists
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await otpCollection.updateOne(
      { email },
      { $set: { otp, expiresAt, type: 'login' } },
      { upsert: true }
    );

    // Send email
    await transporter.sendMail({
      to: email,
      subject: '🔐 AethoFlix - Login OTP',
      html: `
        <h2>Login to AethoFlix</h2>
        <p>Your OTP is: <strong style="font-size:24px;color:#e50914">${otp}</strong></p>
        <p>This OTP expires in 10 minutes.</p>
      `
    });

    res.json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. LOGIN - Verify OTP
app.post('/api/auth/login/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Verify OTP
    const otpDoc = await otpCollection.findOne({ email, type: 'login' });
    if (!otpDoc) return res.status(400).json({ error: 'OTP not found' });
    if (otpDoc.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
    if (Date.now() > otpDoc.expiresAt) return res.status(400).json({ error: 'OTP expired' });

    // Get user
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    await otpCollection.deleteOne({ email, type: 'login' });

    const token = generateToken(user._id, user.role);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. LOGIN with Password (Simple ID/Pass)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(400).json({ error: 'Invalid password' });

    const token = generateToken(user._id, user.role);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. GET USER PROFILE
app.get('/api/auth/profile', verifyToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(req.userId) });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
      avatar: user.avatar,
      preferences: user.preferences,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. UPDATE PROFILE
app.put('/api/auth/profile', verifyToken, async (req, res) => {
  try {
    const { name, avatar, preferences } = req.body;

    const update = {};
    if (name) update.name = name;
    if (avatar) update.avatar = avatar;
    if (preferences) update.preferences = preferences;

    await usersCollection.updateOne(
      { _id: new ObjectId(req.userId) },
      { $set: update }
    );

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. LOGOUT (Token invalidation - optional, handled client-side)
app.post('/api/auth/logout', verifyToken, async (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

/* ═══════════════════════════════════════════════════════════
   WATCH HISTORY ENDPOINTS
   ═══════════════════════════════════════════════════════════ */

// Save watch progress
app.post('/api/watch-history/save', verifyToken, async (req, res) => {
  try {
    const { contentId, type, title, poster, currentTime, duration, season, episode } = req.body;

    const history = {
      userId: new ObjectId(req.userId),
      contentId,
      type, // 'movie', 'tv', 'anime'
      title,
      poster,
      currentTime,
      duration,
      watchedPercentage: Math.round((currentTime / duration) * 100),
      season,
      episode,
      lastWatchedAt: new Date()
    };

    const result = await watchHistoryCollection.updateOne(
      { userId: new ObjectId(req.userId), contentId },
      { $set: history },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get continue watching list
app.get('/api/watch-history/continue', verifyToken, async (req, res) => {
  try {
    const history = await watchHistoryCollection
      .find({ userId: new ObjectId(req.userId) })
      .sort({ lastWatchedAt: -1 })
      .limit(20)
      .toArray();

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific content progress
app.get('/api/watch-history/:contentId', verifyToken, async (req, res) => {
  try {
    const history = await watchHistoryCollection.findOne({
      userId: new ObjectId(req.userId),
      contentId: parseInt(req.params.contentId)
    });

    res.json(history || { currentTime: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove from history
app.delete('/api/watch-history/:contentId', verifyToken, async (req, res) => {
  try {
    await watchHistoryCollection.deleteOne({
      userId: new ObjectId(req.userId),
      contentId: parseInt(req.params.contentId)
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   REPORTS ENDPOINTS
   ═══════════════════════════════════════════════════════════ */

// Submit report
app.post('/api/reports/submit', verifyToken, async (req, res) => {
  try {
    const { type, description, contentTitle, contentId } = req.body;

    const report = {
      userId: new ObjectId(req.userId),
      type, // 'video', 'audio', 'subtitles', 'buffering', 'crash', 'wrong', 'other'
      description,
      contentTitle,
      contentId,
      status: 'open', // open, resolved, dismissed
      createdAt: new Date(),
      resolvedAt: null
    };

    await reportsCollection.insertOne(report);
    res.json({ success: true, message: 'Report submitted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all reports (ADMIN ONLY)
app.get('/api/reports', verifyToken, async (req, res) => {
  try {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const reports = await reportsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reports by content
app.get('/api/reports/content/:contentId', verifyToken, async (req, res) => {
  try {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const reports = await reportsCollection
      .find({ contentId: parseInt(req.params.contentId) })
      .toArray();

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update report status (ADMIN ONLY)
app.put('/api/reports/:reportId/status', verifyToken, async (req, res) => {
  try {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { status } = req.body;

    await reportsCollection.updateOne(
      { _id: new ObjectId(req.params.reportId) },
      { $set: { status, resolvedAt: status === 'resolved' ? new Date() : null } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   WATCH PARTY ENDPOINTS (From previous code)
   ═══════════════════════════════════════════════════════════ */

// Create room
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { hostName } = req.body;
    const roomCode = 'party-' + Math.random().toString(36).slice(2, 8).toUpperCase();

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

// Join room
app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomCode, userName } = req.body;

    const room = await roomsCollection.findOne({ roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.viewers.includes(userName)) {
      await roomsCollection.updateOne(
        { roomCode },
        { $push: { viewers: userName } }
      );
    }

    res.json({ room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get room
app.get('/api/rooms/:roomCode', async (req, res) => {
  try {
    const room = await roomsCollection.findOne({ roomCode: req.params.roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
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
      timestamp: new Date()
    };

    await messagesCollection.insertOne(msg);
    res.json(msg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages
app.get('/api/messages/:roomCode', async (req, res) => {
  try {
    const messages = await messagesCollection
      .find({ roomCode: req.params.roomCode })
      .sort({ timestamp: 1 })
      .toArray();

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leave room
app.post('/api/rooms/:roomCode/leave', async (req, res) => {
  try {
    const { userName } = req.body;

    await roomsCollection.updateOne(
      { roomCode: req.params.roomCode },
      { $pull: { viewers: userName } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   HEALTH CHECK
   ═══════════════════════════════════════════════════════════ */

app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Server running', timestamp: new Date() });
});

// Start server
connectDB();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
