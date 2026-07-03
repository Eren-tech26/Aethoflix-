const mongoose = require('mongoose');

let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI).then(m => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const commentSchema = new mongoose.Schema({
  movieId: { type: String, required: true, index: true },
  username: { type: String, required: true, maxlength: 30 },
  text: { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});
const Comment = mongoose.models.Comment || mongoose.model('Comment', commentSchema);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  const { movieId } = req.query;

  try {
    if (req.method === 'GET') {
      const comments = await Comment.find({ movieId }).sort({ createdAt: -1 });
      return res.status(200).json(comments);
    }

    if (req.method === 'POST') {
      const { username, text } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Comment text required' });
      }
      const comment = await Comment.create({
        movieId,
        username: (username || 'Anonymous').trim().slice(0, 30),
        text: text.trim().slice(0, 500)
      });
      return res.status(201).json(comment);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
