import { AMBIENT_MEDIA, playbackPosition, type MediaSelection, type PlaybackChange, type PlaybackState, type PlayerPose, type PlayerProfile } from '../cinema/types';
import { cleanProfile } from './profile';
import { validateEmbed } from '../catalog/servers';
import type { PartyMember, PartyMessage, PartyPayload, PartyRoom, PartyState } from './types';

type Callbacks = {
  onState: (state: PartyState) => void;
  onMedia: (media: MediaSelection) => void;
  onPlayback: (playback: PlaybackState, forceSeek?: boolean) => void;
  onPose: (id: string, pose: PlayerPose) => void;
  onNotice: (message: string) => void;
};

function identifier() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => alphabet[byte % alphabet.length]).join('');
}

export function parseRoomCode(input: string): string {
  let value = input.trim();
  if (value.includes('://')) {
    try { value = new URL(value).searchParams.get('party') ?? ''; } catch { return ''; }
  }
  return value.toUpperCase().replace(/[\s-]/g, '');
}

export function inviteUrl(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('party', code);
  url.hash = '';
  return url.toString();
}

export function emptyParty(selfId = ''): PartyState {
  return { status: 'idle', selfId, room: null, members: [], source: AMBIENT_MEDIA, playback: null, error: '' };
}

function validPose(pose: PlayerPose): boolean {
  return !!pose && ['x', 'y', 'z', 'yaw', 'sit', 'phase', 'speed'].every((key) => Number.isFinite(pose[key as keyof PlayerPose]))
    && Math.abs(pose.x) < 12 && Math.abs(pose.z) < 10 && pose.y >= -0.1 && pose.y < 3;
}

function validProfile(value: PlayerProfile): boolean {
  return !!value && typeof value.name === 'string' && typeof value.color === 'string';
}

function validPlayback(value: PlaybackState): boolean {
  return !!value && typeof value.sourceId === 'string' && value.sourceId.length <= 160 && typeof value.playing === 'boolean'
    && typeof value.loop === 'boolean' && Number.isFinite(value.time) && value.time >= 0 && Number.isFinite(value.duration)
    && value.duration >= 0 && Number.isFinite(value.rate) && value.rate >= 0.25 && value.rate <= 2 && Number.isFinite(value.updatedAt);
}

function validMembers(value: PartyMember[]): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every((member) => member && typeof member.id === 'string'
    && member.id.length <= 100 && validProfile(member) && typeof member.ready === 'boolean' && Number.isFinite(member.joinedAt)
    && (member.seatId === null || /^[AB][1-5]$/.test(member.seatId))) && new Set(value.map((member) => member.id)).size === value.length;
}

function validRoom(room: PartyRoom, code: string, sender: string): boolean {
  return !!room && room.code === code && room.hostId === sender && typeof room.title === 'string' && room.title.length <= 48 && typeof room.screening === 'boolean';
}

function validMedia(media: MediaSelection): boolean {
  if (!media || typeof media.id !== 'string' || media.id.length > 160 || typeof media.title !== 'string' || media.title.length > 300) return false;
  if (media.kind === 'ambient') return media.id === AMBIENT_MEDIA.id;
  if (media.kind === 'url') return typeof media.url === 'string' && media.url.length <= 8192;
  if (media.kind === 'embed') return validateEmbed(media);
  return media.kind === 'file' && media.file instanceof File && media.file.size <= 250 * 1024 * 1024;
}

// This transport is deliberately same-browser only. No simulated members or remote-service claims.
export class LocalParty {
  readonly id = identifier();
  private profile: PlayerProfile;
  private callbacks: Callbacks;
  private channel: BroadcastChannel | null = null;
  private state = emptyParty(this.id);
  private media: MediaSelection = AMBIENT_MEDIA;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeen = new Map<string, number>();
  private poses = new Map<string, PlayerPose>();
  private pendingSeats = new Map<string, { resolve: (allowed: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private joinResolve: (() => void) | null = null;
  private joinReject: ((error: Error) => void) | null = null;
  private lastHostMessage = 0;
  private disposed = false;

  constructor(profile: PlayerProfile, callbacks: Callbacks) {
    this.profile = cleanProfile(profile);
    this.callbacks = callbacks;
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  get isHost() { return this.state.room?.hostId === this.id; }
  get connected() { return this.state.status === 'connected'; }
  get snapshot() { return this.state; }
  get currentMedia() { return this.media; }

  private publish() {
    if (!this.disposed) this.callbacks.onState({ ...this.state, room: this.state.room ? { ...this.state.room } : null,
      playback: this.state.playback ? { ...this.state.playback } : null, source: { ...this.state.source }, members: this.state.members.map((member) => ({ ...member })) });
  }
  private send(payload: PartyPayload, target?: string) {
    if (!this.channel || !this.state.room) return;
    const message = { ...payload, version: 1, code: this.state.room.code, sender: this.id, target } satisfies PartyMessage;
    try { this.channel.postMessage(message); }
    catch { this.callbacks.onNotice('This browser could not share the update. Keep the host tab open and try rejoining.'); }
  }

  private open(code: string) {
    if (typeof BroadcastChannel === 'undefined') throw new Error('This browser does not support local watch parties. Try a current version of Chrome, Safari, or Firefox.');
    this.channel = new BroadcastChannel(`aethoflix-party-v1-${code}`);
    this.channel.onmessage = this.receive;
    this.heartbeat = setInterval(this.tick, 2000);
  }

  create(title: string, media: MediaSelection, playback: PlaybackState) {
    this.leave(false);
    const code = roomCode();
    this.open(code);
    this.media = media;
    this.state = {
      status: 'connected', selfId: this.id, error: '',
      room: { code, title: title.trim().slice(0, 48) || 'A little movie night', hostId: this.id, screening: false },
      members: [{ ...this.profile, id: this.id, joinedAt: Date.now(), ready: false, seatId: null }],
      source: { id: media.id, kind: media.kind, title: media.title },
      playback: { ...playback, sourceId: media.id, time: playbackPosition(playback), playing: false, updatedAt: Date.now() },
    };
    this.callbacks.onPlayback(this.state.playback!);
    this.publish();
  }

  join(input: string): Promise<void> {
    const code = parseRoomCode(input);
    if (!/^[A-Z0-9]{6}$/.test(code)) return Promise.reject(new Error('Enter the six-character room code, or paste the invitation link.'));
    if (this.connected && this.state.room?.code === code) return Promise.resolve();
    this.leave(false);
    try { this.open(code); } catch (error) { return Promise.reject(error); }
    this.state = { ...emptyParty(this.id), status: 'connecting', room: { code, title: 'Joining your cinema', hostId: '', screening: false } };
    this.publish();
    return new Promise((resolve, reject) => {
      this.joinResolve = resolve;
      this.joinReject = reject;
      this.joinTimer = setTimeout(() => this.fail('Room not found. Keep its host tab open in this same browser and browser profile. Other devices cannot join this local preview.'), 9000);
      this.send({ type: 'join', profile: this.profile });
    });
  }

  private receive = (event: MessageEvent<PartyMessage>) => {
    const message = event.data;
    if (!message || !this.state.room || message.version !== 1 || typeof message.sender !== 'string' || message.sender === this.id || message.code !== this.state.room.code || (message.target && message.target !== this.id)) return;
    if (message.sender === this.state.room.hostId) this.lastHostMessage = Date.now();

    if (message.type === 'join' && this.isHost && validProfile(message.profile)) {
      let member = this.state.members.find((item) => item.id === message.sender);
      if (!member && this.state.members.length >= 10) { this.send({ type: 'rejected', reason: 'All ten places are taken. Ask the host to make room, then try again.' }, message.sender); return; }
      if (!member) {
        member = { ...cleanProfile(message.profile), id: message.sender, ready: false, seatId: null, joinedAt: Date.now() };
        this.state.members.push(member);
        this.callbacks.onNotice(`${member.name} joined the cinema.`);
      }
      this.lastSeen.set(message.sender, Date.now());
      this.send({ type: 'welcome', room: this.state.room!, members: this.state.members, playback: this.state.playback!, poses: Object.fromEntries(this.poses) }, message.sender);
      this.send({ type: 'media', media: this.media }, message.sender);
      this.broadcastRoster();
      return;
    }

    if (message.type === 'welcome' && this.state.status === 'connecting') {
      if (!validRoom(message.room, this.state.room.code, message.sender) || !validMembers(message.members) || !validPlayback(message.playback) || !message.members.some((member) => member.id === this.id) || !message.members.some((member) => member.id === message.sender)) return;
      this.state = { ...this.state, status: 'connected', room: message.room, members: message.members, playback: message.playback, error: '' };
      this.lastHostMessage = Date.now();
      if (this.joinTimer) clearTimeout(this.joinTimer);
      this.joinTimer = null;
      this.joinResolve?.();
      this.joinResolve = this.joinReject = null;
      this.publish();
      if (message.poses && typeof message.poses === 'object') Object.entries(message.poses).slice(0, 10).forEach(([id, pose]) => {
        if (id !== this.id && this.state.members.some((member) => member.id === id) && validPose(pose)) { this.poses.set(id, pose); this.callbacks.onPose(id, pose); }
      });
      this.callbacks.onPlayback(message.playback);
      return;
    }
    if (message.type === 'rejected' && this.state.status === 'connecting' && typeof message.reason === 'string') { this.fail(message.reason.slice(0, 600)); return; }
    if (!this.connected) return;
    const member = this.state.members.find((item) => item.id === message.sender);
    if (!member) return;
    this.lastSeen.set(member.id, Date.now());
    const fromHost = message.sender === this.state.room!.hostId;

    switch (message.type) {
      case 'roster':
        if (fromHost && validRoom(message.room, this.state.room!.code, message.sender) && validMembers(message.members)) {
          if (!message.members.some((item) => item.id === this.id)) { this.fail('Your tab disconnected from the room. Rejoin using the room code.'); return; }
          this.state.room = message.room;
          this.state.members = message.members;
          this.publish();
        }
        break;
      case 'media':
        if (fromHost && validMedia(message.media)) {
          this.media = message.media;
          this.state.source = { id: message.media.id, kind: message.media.kind, title: message.media.title };
          this.callbacks.onMedia(message.media);
          this.publish();
        }
        break;
      case 'playback':
        if (fromHost && validPlayback(message.playback)) {
          this.state.playback = message.playback;
          this.callbacks.onPlayback(message.playback, message.forceSeek === true);
        }
        break;
      case 'profile':
        if (this.isHost && validProfile(message.profile)) { Object.assign(member, cleanProfile(message.profile)); this.broadcastRoster(); }
        break;
      case 'ready':
        if (this.isHost && typeof message.ready === 'boolean') { member.ready = message.ready; this.broadcastRoster(); }
        break;
      case 'pose':
        if (validPose(message.pose)) { this.poses.set(member.id, message.pose); this.callbacks.onPose(member.id, message.pose); }
        break;
      case 'seat-request':
        if (this.isHost && typeof message.requestId === 'string') {
          const allowed = this.assignSeat(member.id, message.seatId);
          this.send({ type: 'seat-result', allowed, requestId: message.requestId }, member.id);
        }
        break;
      case 'seat-result': {
        if (!fromHost) break;
        const request = this.pendingSeats.get(message.requestId);
        if (request) { clearTimeout(request.timer); request.resolve(message.allowed === true); this.pendingSeats.delete(message.requestId); }
        break;
      }
      case 'release-seat':
        if (this.isHost && (!message.seatId || member.seatId === message.seatId)) { member.seatId = null; this.broadcastRoster(); }
        break;
      case 'leave':
        if (this.isHost) { this.state.members = this.state.members.filter((item) => item.id !== member.id); this.poses.delete(member.id); this.broadcastRoster(); }
        break;
      case 'ended':
        if (fromHost) this.fail(typeof message.reason === 'string' ? message.reason.slice(0, 600) : 'The host ended this watch party. You can keep exploring on your own.');
        break;
    }
  };

  private broadcastRoster() {
    if (!this.state.room) return;
    this.send({ type: 'roster', room: this.state.room, members: this.state.members });
    this.publish();
  }

  updateProfile(profile: PlayerProfile) {
    this.profile = cleanProfile(profile);
    if (!this.connected) return;
    if (this.isHost) { Object.assign(this.state.members.find((member) => member.id === this.id)!, this.profile); this.broadcastRoster(); }
    else this.send({ type: 'profile', profile: this.profile });
  }

  setReady(ready: boolean) {
    if (!this.connected) return;
    if (this.isHost) { this.state.members.find((member) => member.id === this.id)!.ready = ready; this.broadcastRoster(); }
    else this.send({ type: 'ready', ready });
  }

  reserveSeat(seatId: string): Promise<boolean> {
    if (!this.connected) return Promise.resolve(true);
    if (this.isHost) return Promise.resolve(this.assignSeat(this.id, seatId));
    return new Promise((resolve) => {
      const requestId = identifier();
      const timer = setTimeout(() => { this.pendingSeats.delete(requestId); this.releaseSeat(seatId); resolve(false); this.callbacks.onNotice('The host did not respond to the seat request. Try again in a moment.'); }, 5500);
      this.pendingSeats.set(requestId, { resolve, timer });
      this.send({ type: 'seat-request', seatId, requestId });
    });
  }

  private assignSeat(id: string, seatId: string): boolean {
    if (!/^[AB][1-5]$/.test(seatId) || this.state.members.some((member) => member.id !== id && member.seatId === seatId)) return false;
    const member = this.state.members.find((item) => item.id === id);
    if (!member) return false;
    member.seatId = seatId;
    this.broadcastRoster();
    return true;
  }

  releaseSeat(seatId?: string) {
    if (!this.connected) return;
    if (this.isHost) {
      const member = this.state.members.find((item) => item.id === this.id)!;
      if (!seatId || member.seatId === seatId) { member.seatId = null; this.broadcastRoster(); }
    } else this.send({ type: 'release-seat', seatId });
  }

  sendPose(pose: PlayerPose) { if (this.connected) { this.poses.set(this.id, pose); this.send({ type: 'pose', pose }); } }

  changePlayback(change: PlaybackChange) {
    if (!this.isHost || !this.state.playback || this.media.kind === 'embed') return;
    const current = this.state.playback;
    this.state.playback = { ...current, time: playbackPosition(current), ...change, updatedAt: Date.now() };
    this.callbacks.onPlayback(this.state.playback, change.time !== undefined);
    this.send({ type: 'playback', playback: this.state.playback, forceSeek: change.time !== undefined });
    this.publish();
  }

  setDuration(sourceId: string, duration: number) {
    if (this.isHost && this.state.playback?.sourceId === sourceId && Number.isFinite(duration) && duration !== this.state.playback.duration) {
      this.state.playback.duration = duration;
      this.send({ type: 'playback', playback: this.state.playback });
    }
  }

  shareMedia(media: MediaSelection, duration: number) {
    if (!this.isHost) return;
    this.media = media;
    this.state.source = { id: media.id, title: media.title, kind: media.kind };
    this.state.playback = { sourceId: media.id, playing: false, time: 0, duration, rate: 1, loop: true, updatedAt: Date.now() };
    this.state.room!.screening = false;
    this.state.members.forEach((member) => { member.ready = false; });
    this.send({ type: 'media', media });
    this.callbacks.onPlayback(this.state.playback);
    this.send({ type: 'playback', playback: this.state.playback });
    this.broadcastRoster();
  }

  startScreening() {
    if (!this.isHost || !this.state.room || this.state.members.some((member) => !member.ready)) return false;
    this.state.room.screening = true;
    if (this.media.kind !== 'embed') this.changePlayback({ playing: true });
    this.broadcastRoster();
    return true;
  }

  private tick = () => {
    if (this.state.status === 'connecting') { this.send({ type: 'join', profile: this.profile }); return; }
    if (!this.connected) return;
    this.send({ type: 'ping' });
    if (this.isHost) {
      const members = this.state.members.filter((member) => member.id === this.id || Date.now() - (this.lastSeen.get(member.id) ?? member.joinedAt) < 180000);
      if (members.length !== this.state.members.length) {
        this.state.members = members;
        for (const id of this.poses.keys()) if (!members.some((member) => member.id === id)) this.poses.delete(id);
        this.broadcastRoster();
      }
      if (this.state.playback) {
        const playback = this.state.playback;
        if (!playback.loop && playback.duration && playbackPosition(playback) >= playback.duration && playback.playing) this.changePlayback({ playing: false, time: playback.duration });
        this.send({ type: 'playback', playback: this.state.playback! });
      }
    } else if (Date.now() - this.lastHostMessage > 180000) this.fail('The host tab is no longer responding. Reopen the invitation when the host is back.');
  };

  private onPageHide = () => this.leave();
  private onVisible = () => { if (!document.hidden) { this.tick(); if (this.state.playback) this.callbacks.onPlayback(this.state.playback); } };

  private fail(message: string) {
    const reject = this.joinReject;
    this.joinReject = null;
    this.leave(false);
    this.state = { ...emptyParty(this.id), status: 'error', error: message };
    reject?.(new Error(message));
    this.publish();
  }

  leave(notify = true) {
    if (this.connected) this.send(this.isHost ? { type: 'ended', reason: 'The host ended this watch party. Your player and the cinema are still available.' } : { type: 'leave' });
    this.channel?.close();
    this.channel = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    this.heartbeat = this.joinTimer = null;
    this.pendingSeats.forEach(({ resolve, timer }) => { clearTimeout(timer); resolve(false); });
    this.pendingSeats.clear();
    this.lastSeen.clear();
    this.poses.clear();
    this.media = AMBIENT_MEDIA;
    this.joinReject?.(new Error('Joining was cancelled.'));
    this.joinReject = this.joinResolve = null;
    this.state = emptyParty(this.id);
    if (notify) this.publish();
  }

  dispose() {
    this.disposed = true;
    this.leave(false);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}