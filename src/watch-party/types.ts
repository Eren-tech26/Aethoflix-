import type { MediaSelection, PlaybackState, PlayerProfile, PlayerPose, RemotePlayer } from '../cinema/types';

export type PartyMember = RemotePlayer & { ready: boolean; joinedAt: number; bot?: boolean; muted?: boolean };
export type PartyRoom = { code: string; title: string; hostId: string; screening: boolean; online?: boolean };
export type MediaDescription = { id: string; kind: MediaSelection['kind']; title: string };
export type PartyState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  selfId: string;
  room: PartyRoom | null;
  members: PartyMember[];
  source: MediaDescription;
  playback: PlaybackState | null;
  error: string;
};

export type PartyPayload =
  | { type: 'join'; profile: PlayerProfile }
  | { type: 'welcome'; room: PartyRoom; members: PartyMember[]; playback: PlaybackState; poses: Record<string, PlayerPose> }
  | { type: 'roster'; room: PartyRoom; members: PartyMember[] }
  | { type: 'media'; media: MediaSelection }
  | { type: 'playback'; playback: PlaybackState; forceSeek?: boolean }
  | { type: 'profile'; profile: PlayerProfile }
  | { type: 'ready'; ready: boolean }
  | { type: 'pose'; pose: PlayerPose }
  | { type: 'seat-request'; seatId: string; requestId: string }
  | { type: 'seat-result'; allowed: boolean; requestId: string }
  | { type: 'release-seat'; seatId?: string }
  | { type: 'ping' }
  | { type: 'leave' }
  | { type: 'ended'; reason: string }
  | { type: 'rejected'; reason: string };

export type PartyMessage = PartyPayload & { version: 1; code: string; sender: string; target?: string };