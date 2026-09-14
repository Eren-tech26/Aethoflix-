import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  if (!MONGO_URI) throw new Error('MONGO_URI is not configured');
  await mongoose.connect(MONGO_URI);
  isConnected = true;
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');
}

export const now = () => Date.now();
export const ACTIVE_WINDOW_MS = 120000;
export function durMin(startTs, endTs) {
  return Math.max(0, Math.round(((endTs || now()) - startTs) / 60000));
}

const pageViewSchema = new mongoose.Schema({
  user: { type: String, default: 'Guest' },
  path: String,
  referrer: String,
  ua: String,
  ts: { type: Number, default: () => Date.now() },
});
pageViewSchema.index({ user: 1, ts: -1 });
export const PageView = mongoose.models.PageView || mongoose.model('PageView', pageViewSchema);

const watchSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  movieId: Number,
  type: String,
  title: String,
  season: Number,
  episode: Number,
  username: String,
  email: String,
  poster_path: String,
  backdrop_path: String,
  startedAt: { type: Number, default: () => Date.now() },
  lastSeen: { type: Number, default: () => Date.now() },
});
export const WatchSession = mongoose.models.WatchSession || mongoose.model('WatchSession', watchSessionSchema);

const watchLogSchema = new mongoose.Schema({
  sessionId: String,
  movieId: Number,
  type: String,
  title: String,
  username: { type: String, default: 'Guest' },
  email: String,
  season: Number,
  episode: Number,
  poster_path: String,
  backdrop_path: String,
  ts: { type: Number, default: () => Date.now() },
  lastSeen: { type: Number, default: () => Date.now() },
  endTs: Number,
  durationMin: Number,
  ended: { type: Boolean, default: false },
});
watchLogSchema.index({ username: 1, ts: -1 });
watchLogSchema.index({ title: 1, ts: -1 });
export const WatchLog = mongoose.models.WatchLog || mongoose.model('WatchLog', watchLogSchema);

const trialGrantSchema = new mongoose.Schema({
  user: { type: String, default: 'Guest' },
  username: String,
  email: String,
  kind: { type: String, default: 'trial' },
  days: { type: Number, default: 7 },
  grantedAt: { type: Number, default: () => Date.now() },
  expiresAt: { type: Number, default: () => Date.now() },
});
trialGrantSchema.index({ grantedAt: -1 });
export const TrialGrant = mongoose.models.TrialGrant || mongoose.model('TrialGrant', trialGrantSchema);

const broadcastSchema = new mongoose.Schema({
  singleton: { type: String, default: 'main', unique: true },
  message: { type: String, default: '' },
  updatedAt: { type: Number, default: () => Date.now() },
});
export const Broadcast = mongoose.models.Broadcast || mongoose.model('Broadcast', broadcastSchema);

const reportSchema = new mongoose.Schema({
  type: { type: String, default: 'video' },
  status: { type: String, default: 'new' },
  title: String,
  movieId: Number,
  mediaType: String,
  message: String,
  username: { type: String, default: 'Guest' },
  email: String,
  ua: String,
  ts: { type: Number, default: () => Date.now() },
  resolvedAt: Number,
});
reportSchema.index({ status: 1, ts: -1 });
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

const vipCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  kind: { type: String, default: 'permanent' },
  days: Number,
  status: { type: String, default: 'active' },
  createdAt: { type: Number, default: () => Date.now() },
  usedAt: Number,
  usedBy: String,
  revokedAt: Number,
});
vipCodeSchema.index({ status: 1, createdAt: -1 });
export const VipCode = mongoose.models.VipCode || mongoose.model('VipCode', vipCodeSchema);

export function adminPinOk(req) {
  const pin = String(req.headers['x-admin-pin'] || req.query?.pin || req.body?.pin || '');
  const expected = String(process.env.ADMIN_PIN || '2611');
  return pin === expected;
}
