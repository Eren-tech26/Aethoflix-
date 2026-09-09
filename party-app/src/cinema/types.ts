import type { EmbedMedia } from '../catalog/types';

export type Mode = 'explore' | 'walking' | 'sitting' | 'seated' | 'standing';
export type Quality = 'auto' | 'high' | 'performance';
export type PlayerProfile = { name: string; color: string };
export type PlayerPose = { x: number; y: number; z: number; yaw: number; sit: number; phase: number; speed: number };
export type RemotePlayer = PlayerProfile & { id: string; seatId: string | null };
export type MediaSelection =
  | { id: string; kind: 'ambient'; title: string }
  | { id: string; kind: 'url'; title: string; url: string }
  | { id: string; kind: 'file'; title: string; file: File }
  | EmbedMedia;
export type ProviderStatus = 'idle' | 'opening' | 'opened' | 'slow' | 'error';
export type PlaybackState = { sourceId: string; playing: boolean; time: number; duration: number; rate: number; loop: boolean; updatedAt: number };
export type PlaybackChange = Partial<Pick<PlaybackState, 'playing' | 'time' | 'rate' | 'loop'>>;
export type PartyBridge = {
  canControl: boolean;
  reserveSeat: (seatId: string) => Promise<boolean>;
  releaseSeat: (seatId?: string) => void;
  playback: (change: PlaybackChange) => void;
};

export const AMBIENT_MEDIA: MediaSelection = { id: 'afterlight', kind: 'ambient', title: 'Afterlight' };
export const DEMO_MEDIA: MediaSelection = {
  id: 'sintel-trailer', kind: 'url', title: 'Sintel - Official Trailer',
  url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
};

export function playbackPosition(state: PlaybackState, now = Date.now()): number {
  const position = Math.max(0, state.time + (state.playing ? Math.max(0, now - state.updatedAt) / 1000 * state.rate : 0));
  if (!state.duration) return position;
  return state.loop ? position % state.duration : Math.min(position, state.duration);
}

export type CinemaSnapshot = {
  mode: Mode;
  seatId: string | null;
  nearbySeatId: string | null;
  fps: number;
  lightLevel: number;
  playing: boolean;
  muted: boolean;
  filmTitle: string;
  localFilm: boolean;
  currentTime: number;
  duration: number;
  overview: boolean;
  sourceId: string;
  mediaKind: MediaSelection['kind'];
  volume: number;
  rate: number;
  loop: boolean;
  buffering: boolean;
  loading: boolean;
  autoplayBlocked: boolean;
  playbackError: string;
  embed: EmbedMedia | null;
  providerStatus: ProviderStatus;
  reservingSeat: string | null;
  servicePhase: 'idle' | 'summoned' | 'coming' | 'delivering' | 'returning';
  foodName: string;
  eatingProgress: number | null;
  highRefresh: boolean;
  pose: PlayerPose;
};

export const INITIAL_SNAPSHOT: CinemaSnapshot = {
  mode: 'explore', seatId: null, nearbySeatId: null, fps: 0, lightLevel: 1,
  playing: true, muted: true, filmTitle: 'Afterlight', localFilm: false,
  currentTime: 0, duration: 0, overview: true,
  sourceId: 'afterlight', mediaKind: 'ambient', volume: 0.65, rate: 1, loop: true,
  buffering: false, loading: false, autoplayBlocked: false, playbackError: '', reservingSeat: null, embed: null, providerStatus: 'idle',
  servicePhase: 'idle', foodName: '', eatingProgress: null, highRefresh: false,
  pose: { x: 5.35, y: 0, z: 0.03, yaw: 0.14, sit: 0, phase: 0, speed: 0 },
};