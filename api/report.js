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

/* ── Report: one doc per user-submitted issue report ── */
const reportSchema = new mongoose.Schema({
  type: String,        // video|audio|subtitles|buffering|crash|wrong|other
  desc: String,        // what the user typed
  title: String,       // movie/series they were watching
  movieId: Number,
  url: String,         // page URL when reported
  user: { type: String, default: 'Guest' },   // username or guest_xxxx device id
  ts: { type: Number, default: () => Date.now() },
  status: { type: String, default: 'new' },   // new | resolved
  resolvedAt: Number,
  telegramSent: { type: Boolean, default: false }
});
reportSchema.index({ ts: -1 });
reportSchema.index({ status: 1 });
const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

const TYPE_NAMES = {
  video: '🎬 Video not loading',
  audio: '🔊 Audio/Sound issue',
  subtitles: '📝 Subtitles problem',
  buffering: '⚡ Buffering/Lag',
  crash: '💥 App crash',
  wrong: '❌ Wrong content',
  other: '❓ Other issue'
};

/* ── Optional Telegram delivery (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) ── */
async function sendTelegram(report){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chat) return false;
  try{
    const text =
      '⚠️ NEW REPORT — AethoFlix\n' +
      '━━━━━━━━━━━━━━━━\n' +
      'Type:  ' + (TYPE_NAMES[report.type] || report.type) + '\n' +
      'Title: ' + (report.title || '—') + '\n' +
      'Movie ID: ' + (report.movieId ?? '—') + '\n' +
      'User:  ' + (report.user || 'Guest') + '\n' +
      'URL:   ' + (report.url || '—') + '\n\n' +
      'Description:\n' + (report.desc || '—');
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text })
    });
    const data = await r.json();
    return !!(data && data.ok);
  }catch(err){
    console.error('Telegram send error:', err);
    return false;
  }
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS') return res.status(200).end();

  await connectDB();

  try{
    /* ── POST → create a report (called from index.html submitReport) ── */
    if(req.method === 'POST'){
      const { type, desc, title, id, url, user } = req.body || {};
      if(!type || !desc) return res.status(400).json({ error: 'type and desc required' });

      const report = await Report.create({
        type, desc: String(desc).slice(0, 500),
        title: title || '', movieId: id || undefined, url: url || '',
        user: user || 'Guest'
      });

      // deliver to Telegram (only if configured — never blocks the response)
      if(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID){
        const ok = await sendTelegram(report);
        if(ok){ report.telegramSent = true; await report.save(); }
      }

      return res.status(200).json({ success: true, id: report._id });
    }

    if(req.method === 'GET'){
      const { query } = req;

      if(query.type === 'stats'){
        const [total, fresh, resolved] = await Promise.all([
          Report.countDocuments({}),
          Report.countDocuments({ status: 'new' }),
          Report.countDocuments({ status: 'resolved' })
        ]);
        const latest = await Report.findOne({}).sort({ ts: -1 }).lean();
        return res.status(200).json({ total, new: fresh, resolved, latest });
      }

      const filter = {};
      if(query.status === 'new') filter.status = 'new';
      if(query.status === 'resolved') filter.status = 'resolved';
      const reports = await Report.find(filter).sort({ ts: -1 }).limit(200).lean();
      return res.status(200).json({ reports });
    }

    /* ── PUT → resolve / delete ── */
    if(req.method === 'PUT'){
      const { action, id } = req.body || {};
      if(!id) return res.status(400).json({ error: 'id required' });

      if(action === 'resolve'){
        await Report.updateOne({ _id: id }, { status: 'resolved', resolvedAt: Date.now() });
        return res.status(200).json({ success: true });
      }
      if(action === 'delete'){
        await Report.deleteOne({ _id: id });
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('Report API error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
