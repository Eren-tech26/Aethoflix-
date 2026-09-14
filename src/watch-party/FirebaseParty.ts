import { get, onDisconnect, onValue, ref, remove, runTransaction, serverTimestamp, set, update, type Unsubscribe } from 'firebase/database';
import { AMBIENT_MEDIA, playbackPosition, type MediaSelection, type PlaybackChange, type PlaybackState, type PlayerPose, type PlayerProfile } from '../cinema/types';
import { SEATS } from '../cinema/world';
import { validateEmbed } from '../catalog/servers';
import { firebaseDb, ensureFirebaseUser } from './firebase';
import { cleanProfile } from './profile';
import type { PartyMember, PartyRoom, PartyState } from './types';

type Callbacks = {
  onState: (state: PartyState) => void;
  onMedia: (media: MediaSelection) => void;
  onPlayback: (playback: PlaybackState, forceSeek?: boolean) => void;
  onPose: (id: string, pose: PlayerPose) => void;
  onNotice: (message: string) => void;
  onMuted: (muted: boolean) => void;
};

const BOT_PRESETS = [
  { name: 'Mira', color: '#8a6f9e' }, { name: 'Kenji', color: '#4f7d8a' },
  { name: 'Zara', color: '#a46a52' }, { name: 'Ryu', color: '#5d7a4f' },
];

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

export function parseRoomCode(input: string): string {
  let value = input.trim();
  if (value.includes('://')) { try { value = new URL(value).searchParams.get('party') ?? ''; } catch { return ''; } }
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function inviteUrl(code: string): string {
  const url = new URL('https://aethoflix.vercel.app/');
  url.searchParams.set('party', code);
  return url.toString();
}

export function emptyFirebaseParty(selfId = ''): PartyState {
  return { status: 'idle', selfId, room: null, members: [], source: AMBIENT_MEDIA, playback: null, error: '' };
}

function serializableMedia(media: MediaSelection): MediaSelection {
  if (media.kind === 'file') throw new Error('Local files cannot be sent to other devices. Use a direct video link or a catalogue provider for an online party.');
  return media;
}

function validMedia(value: unknown): value is MediaSelection {
  if (!value || typeof value !== 'object') return false;
  const media = value as MediaSelection;
  if (typeof media.id !== 'string' || typeof media.title !== 'string') return false;
  if (media.kind === 'ambient') return media.id === AMBIENT_MEDIA.id;
  if (media.kind === 'url') return typeof media.url === 'string' && media.url.length <= 8192;
  if (media.kind === 'embed') return validateEmbed(media);
  return false;
}

function validPose(value: unknown): value is PlayerPose {
  if (!value || typeof value !== 'object') return false;
  const pose = value as PlayerPose;
  return [pose.x, pose.y, pose.z, pose.yaw, pose.sit, pose.phase, pose.speed].every(Number.isFinite)
    && Math.abs(pose.x) < 20 && Math.abs(pose.z) < 12;
}

export class FirebaseParty {
  private uid = '';
  private profile: PlayerProfile;
  private callbacks: Callbacks;
  private state = emptyFirebaseParty();
  private media: MediaSelection = AMBIENT_MEDIA;
  private subscriptions: Unsubscribe[] = [];
  private code = '';
  private lastMediaId = '';
  private lastPlaybackUpdated = 0;
  private disposed = false;
  private botTimer: ReturnType<typeof setInterval> | null = null;

  constructor(profile: PlayerProfile, callbacks: Callbacks) {
    this.profile = cleanProfile(profile);
    this.callbacks = callbacks;
    void ensureFirebaseUser().then((user) => {
      if (this.disposed) return;
      this.uid = user.uid;
      this.state.selfId = user.uid;
      this.publish();
    }).catch(() => this.fail('Firebase sign-in failed. Enable Anonymous Authentication in the Firebase console, then reload.'));
  }

  get isHost() { return this.state.room?.hostId === this.uid; }
  get connected() { return this.state.status === 'connected'; }
  get snapshot() { return this.state; }
  get currentMedia() { return this.media; }

  private async ready() {
    const user = await ensureFirebaseUser();
    this.uid = user.uid;
    this.state.selfId = user.uid;
    return user;
  }

  private publish() {
    if (!this.disposed) this.callbacks.onState({ ...this.state, room: this.state.room ? { ...this.state.room } : null,
      members: this.state.members.map((member) => ({ ...member })), source: { ...this.state.source }, playback: this.state.playback ? { ...this.state.playback } : null });
  }

  async create(title: string, media: MediaSelection, playback: PlaybackState): Promise<void> {
    await this.leave(false);
    await this.ready();
    const sharedMedia = serializableMedia(media);
    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomCode();
      const meta: PartyRoom = { code: candidate, title: title.trim().slice(0, 48) || 'A little movie night', hostId: this.uid, screening: false, online: true };
      const result = await runTransaction(ref(firebaseDb, `rooms/${candidate}/meta`), (current) => current === null ? meta : undefined, { applyLocally: false });
      if (result.committed) { code = candidate; break; }
    }
    if (!code) throw new Error('Could not reserve a room code. Please try again.');
    this.code = code;
    this.media = sharedMedia;
    const member: PartyMember = { ...this.profile, id: this.uid, ready: false, seatId: null, joinedAt: Date.now(), muted: false };
    const nextPlayback = { ...playback, sourceId: sharedMedia.id, time: playbackPosition(playback), playing: false, updatedAt: Date.now() };
    await Promise.all([
      set(ref(firebaseDb, `rooms/${code}/members/${this.uid}`), member),
      set(ref(firebaseDb, `rooms/${code}/media`), sharedMedia),
      set(ref(firebaseDb, `rooms/${code}/playback`), nextPlayback),
    ]);
    await onDisconnect(ref(firebaseDb, `rooms/${code}`)).remove();
    this.state = { status: 'connected', selfId: this.uid, room: { code, title: title.trim().slice(0, 48) || 'A little movie night', hostId: this.uid, screening: false, online: true }, members: [member], source: { id: sharedMedia.id, title: sharedMedia.title, kind: sharedMedia.kind }, playback: nextPlayback, error: '' };
    this.lastMediaId = sharedMedia.id;
    this.lastPlaybackUpdated = nextPlayback.updatedAt;
    this.subscribe();
    this.callbacks.onPlayback(nextPlayback);
    this.publish();
  }

  async join(input: string): Promise<void> {
    const code = parseRoomCode(input);
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter the six-character room code or paste the invitation link.');
    await this.leave(false);
    await this.ready();
    this.state = { ...emptyFirebaseParty(this.uid), status: 'connecting', room: { code, title: 'Joining your cinema', hostId: '', screening: false, online: true } };
    this.publish();
    const [metaSnap, banSnap, membersSnap] = await Promise.all([
      get(ref(firebaseDb, `rooms/${code}/meta`)), get(ref(firebaseDb, `rooms/${code}/bans/${this.uid}`)), get(ref(firebaseDb, `rooms/${code}/members`)),
    ]);
    if (!metaSnap.exists()) throw this.failError('Room not found. Check the code and make sure the host is still online.');
    if (banSnap.exists()) throw this.failError('You have been banned from this room by its host.');
    const membersValue = membersSnap.val() as Record<string, PartyMember> | null;
    if (membersValue && Object.keys(membersValue).length >= 10) throw this.failError('All ten places are taken.');
    const meta = metaSnap.val() as PartyRoom;
    this.code = code;
    const member: PartyMember = { ...this.profile, id: this.uid, ready: false, seatId: null, joinedAt: Date.now(), muted: false };
    await set(ref(firebaseDb, `rooms/${code}/members/${this.uid}`), member);
    await Promise.all([
      onDisconnect(ref(firebaseDb, `rooms/${code}/members/${this.uid}`)).remove(),
      onDisconnect(ref(firebaseDb, `rooms/${code}/poses/${this.uid}`)).remove(),
    ]);
    this.state = { ...emptyFirebaseParty(this.uid), status: 'connected', room: meta, members: [member], error: '' };
    this.subscribe();
    this.publish();
  }

  private subscribe() {
    this.unsubscribe();
    const base = `rooms/${this.code}`;
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/meta`), (snap) => {
      if (!snap.exists()) { if (this.connected) this.fail('The host ended this watch party.'); return; }
      this.state.room = snap.val() as PartyRoom;
      this.publish();
    }));
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/members`), (snap) => {
      const value = snap.val() as Record<string, PartyMember> | null;
      const members = value ? Object.values(value).filter((member) => member && typeof member.id === 'string').slice(0, 10) : [];
      if (this.connected && !members.some((member) => member.id === this.uid)) { this.fail('The host removed you from this room.'); return; }
      this.state.members = members;
      const self = members.find((member) => member.id === this.uid);
      this.callbacks.onMuted(!!self?.muted);
      this.publish();
    }));
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/media`), (snap) => {
      const value: unknown = snap.val();
      if (!validMedia(value)) return;
      this.media = value;
      this.state.source = { id: value.id, title: value.title, kind: value.kind };
      if (value.id !== this.lastMediaId) { this.lastMediaId = value.id; this.callbacks.onMedia(value); }
      this.publish();
    }));
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/playback`), (snap) => {
      const playback = snap.val() as PlaybackState | null;
      if (!playback || !Number.isFinite(playback.updatedAt)) return;
      const force = playback.updatedAt !== this.lastPlaybackUpdated && Math.abs(playback.time - (this.state.playback?.time ?? 0)) > 0.5;
      this.lastPlaybackUpdated = playback.updatedAt;
      this.state.playback = playback;
      this.callbacks.onPlayback(playback, force);
      this.publish();
    }));
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/poses`), (snap) => {
      const value = snap.val() as Record<string, unknown> | null;
      if (!value) return;
      Object.entries(value).forEach(([id, pose]) => { if (id !== this.uid && validPose(pose)) this.callbacks.onPose(id, pose); });
    }));
    this.subscriptions.push(onValue(ref(firebaseDb, `${base}/controls/${this.uid}`), (snap) => {
      const control = snap.val() as { kick?: boolean; banned?: boolean; muted?: boolean } | null;
      if (!control) return;
      if (control.banned) this.fail('You were banned from this room by its host.');
      else if (control.kick) this.fail('You were removed from this room by its host.');
      else if (typeof control.muted === 'boolean') this.callbacks.onMuted(control.muted);
    }));
  }

  updateProfile(profile: PlayerProfile) {
    this.profile = cleanProfile(profile);
    if (this.connected) void update(ref(firebaseDb, `rooms/${this.code}/members/${this.uid}`), this.profile);
  }

  setReady(ready: boolean) { if (this.connected) void update(ref(firebaseDb, `rooms/${this.code}/members/${this.uid}`), { ready }); }

  async reserveSeat(seatId: string): Promise<boolean> {
    if (!this.connected || !/^[AB][1-5]$/.test(seatId)) return !this.connected;
    const oldSeat = this.state.members.find((member) => member.id === this.uid)?.seatId;
    const result = await runTransaction(ref(firebaseDb, `rooms/${this.code}/seats/${seatId}`), (current) => current === null || current === this.uid ? this.uid : undefined, { applyLocally: false });
    if (!result.committed) return false;
    if (oldSeat && oldSeat !== seatId) await remove(ref(firebaseDb, `rooms/${this.code}/seats/${oldSeat}`));
    await update(ref(firebaseDb, `rooms/${this.code}/members/${this.uid}`), { seatId });
    return true;
  }

  releaseSeat(seatId?: string) {
    if (!this.connected) return;
    const current = seatId ?? this.state.members.find((member) => member.id === this.uid)?.seatId;
    if (current) void remove(ref(firebaseDb, `rooms/${this.code}/seats/${current}`));
    void update(ref(firebaseDb, `rooms/${this.code}/members/${this.uid}`), { seatId: null });
  }

  sendPose(pose: PlayerPose) { if (this.connected && validPose(pose)) void set(ref(firebaseDb, `rooms/${this.code}/poses/${this.uid}`), pose); }

  changePlayback(change: PlaybackChange) {
    if (!this.isHost || !this.state.playback || this.media.kind === 'embed') return;
    const next = { ...this.state.playback, time: playbackPosition(this.state.playback), ...change, updatedAt: Date.now() };
    void set(ref(firebaseDb, `rooms/${this.code}/playback`), next);
  }

  setDuration(sourceId: string, duration: number) {
    if (this.isHost && this.state.playback?.sourceId === sourceId && Number.isFinite(duration) && duration > 0) void update(ref(firebaseDb, `rooms/${this.code}/playback`), { duration });
  }

  shareMedia(media: MediaSelection, duration: number) {
    if (!this.isHost) return;
    const shared = serializableMedia(media);
    this.media = shared;
    this.lastMediaId = shared.id;
    const playback: PlaybackState = { sourceId: shared.id, playing: false, time: 0, duration, rate: 1, loop: true, updatedAt: Date.now() };
    void update(ref(firebaseDb, `rooms/${this.code}`), { media: shared, playback, 'meta/screening': false });
    this.state.members.forEach((member) => { void update(ref(firebaseDb, `rooms/${this.code}/members/${member.id}`), { ready: !!member.bot }); });
  }

  startScreening() {
    if (!this.isHost || this.state.members.some((member) => !member.ready)) return false;
    void update(ref(firebaseDb, `rooms/${this.code}/meta`), { screening: true });
    if (this.media.kind !== 'embed') this.changePlayback({ playing: true });
    return true;
  }

  async kick(id: string, ban = false) {
    if (!this.isHost || id === this.uid) return;
    const member = this.state.members.find((item) => item.id === id);
    if (!member || member.bot) { if (member?.bot) await this.removeBot(id); return; }
    await set(ref(firebaseDb, `rooms/${this.code}/controls/${id}`), ban ? { banned: true } : { kick: true });
    if (ban) await set(ref(firebaseDb, `rooms/${this.code}/bans/${id}`), { by: this.uid, at: serverTimestamp() });
    const updates: Record<string, null> = { [`members/${id}`]: null, [`poses/${id}`]: null };
    if (member.seatId) updates[`seats/${member.seatId}`] = null;
    await update(ref(firebaseDb, `rooms/${this.code}`), updates);
    this.callbacks.onNotice(`${member.name} was ${ban ? 'banned' : 'removed'}.`);
  }

  async mute(id: string, muted: boolean) {
    if (!this.isHost || id === this.uid) return;
    await Promise.all([
      update(ref(firebaseDb, `rooms/${this.code}/members/${id}`), { muted }),
      set(ref(firebaseDb, `rooms/${this.code}/controls/${id}`), { muted }),
    ]);
  }

  setBots(count: number) {
    if (!this.isHost) return;
    void this.replaceBots(Math.max(0, Math.min(4, Math.floor(count))));
  }

  private async replaceBots(count: number) {
    const existing = this.state.members.filter((member) => member.bot);
    await Promise.all(existing.map((member) => this.removeBot(member.id)));
    const occupied = new Set(this.state.members.filter((member) => !member.bot).map((member) => member.seatId).filter(Boolean));
    const seats = SEATS.filter((seat) => !occupied.has(seat.id));
    for (let i = 0; i < count && i < seats.length; i++) {
      const id = `bot-${i + 1}-${Date.now()}`;
      const preset = BOT_PRESETS[i % BOT_PRESETS.length];
      const member: PartyMember = { ...preset, id, bot: true, ready: true, seatId: seats[i].id, joinedAt: Date.now(), muted: false };
      const pose: PlayerPose = { x: seats[i].x, y: seats[i].elevation, z: seats[i].z - 0.09, yaw: 0, sit: 1, phase: 0, speed: 0 };
      await Promise.all([set(ref(firebaseDb, `rooms/${this.code}/members/${id}`), member), set(ref(firebaseDb, `rooms/${this.code}/poses/${id}`), pose), set(ref(firebaseDb, `rooms/${this.code}/seats/${seats[i].id}`), id)]);
    }
  }

  private async removeBot(id: string) {
    const member = this.state.members.find((item) => item.id === id);
    const updates: Record<string, null> = { [`members/${id}`]: null, [`poses/${id}`]: null };
    if (member?.seatId) updates[`seats/${member.seatId}`] = null;
    await update(ref(firebaseDb, `rooms/${this.code}`), updates);
  }

  async leave(notify = true): Promise<void> {
    this.unsubscribe();
    if (this.code && this.uid) {
      if (this.isHost) {
        await remove(ref(firebaseDb, `rooms/${this.code}`)).catch(() => undefined);
      } else {
        const member = this.state.members.find((item) => item.id === this.uid);
        const updates: Record<string, null> = { [`members/${this.uid}`]: null, [`poses/${this.uid}`]: null, [`controls/${this.uid}`]: null };
        if (member?.seatId) updates[`seats/${member.seatId}`] = null;
        await update(ref(firebaseDb, `rooms/${this.code}`), updates).catch(() => undefined);
      }
    }
    this.code = '';
    this.media = AMBIENT_MEDIA;
    this.state = emptyFirebaseParty(this.uid);
    if (notify) this.publish();
  }

  private unsubscribe() { this.subscriptions.forEach((stop) => stop()); this.subscriptions = []; if (this.botTimer) clearInterval(this.botTimer); this.botTimer = null; }
  private failError(message: string) { this.state = { ...emptyFirebaseParty(this.uid), status: 'error', error: message }; this.publish(); return new Error(message); }
  private fail(message: string) { void this.leave(false).finally(() => { this.state = { ...emptyFirebaseParty(this.uid), status: 'error', error: message }; this.publish(); }); }
  dispose() { this.disposed = true; void this.leave(false); }
}