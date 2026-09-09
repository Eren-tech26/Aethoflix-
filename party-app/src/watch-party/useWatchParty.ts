import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot, MediaSelection, PlayerProfile } from '../cinema/types';
import { emptyParty, LocalParty, parseRoomCode } from './LocalParty';
import type { PartyState } from './types';

type Options = {
  engine: RefObject<CinemaEngine | null>;
  ready: boolean;
  profile: PlayerProfile;
  notify: (message: string) => void;
};

function setRoomLocation(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('party', code);
  else url.searchParams.delete('party');
  try { window.history.replaceState(null, '', url); } catch { /* Embedded previews may restrict URL updates. The room code still works. */ }
}

export function useWatchParty({ engine, ready, profile, notify }: Options) {
  const client = useRef<LocalParty | null>(null);
  const [state, setState] = useState<PartyState>(() => emptyParty());
  const [mediaError, setMediaError] = useState('');
  const mediaEpoch = useRef(0);
  const lastPoseAt = useRef(0);
  const latestProfile = useRef(profile);
  latestProfile.current = profile;

  const connectEngine = useCallback((next: PartyState) => {
    const cinema = engine.current;
    const room = client.current;
    if (!cinema || !room) return;
    if (next.status === 'connected') {
      cinema.setPartyBridge({
        canControl: next.room?.hostId === next.selfId,
        reserveSeat: (id) => room.reserveSeat(id),
        releaseSeat: (id) => room.releaseSeat(id),
        playback: (change) => room.changePlayback(change),
      });
      cinema.setRemotePlayers(next.members.filter((member) => member.id !== next.selfId));
    } else {
      cinema.setPartyBridge(null);
      cinema.setRemotePlayers([]);
    }
  }, [engine]);

  useEffect(() => {
    const party = new LocalParty(latestProfile.current, {
      onState: (next) => {
        if (next.status === 'idle' || next.status === 'error') {
          mediaEpoch.current++;
          engine.current?.cancelMediaLoading();
          if (engine.current?.getSnapshot().mediaKind === 'embed') engine.current.restoreAmbient();
          if (next.error) notify(next.error);
        }
        setState(next); connectEngine(next);
      },
      onMedia: (media) => {
        const cinema = engine.current;
        if (!cinema) return;
        const epoch = ++mediaEpoch.current;
        setMediaError('');
        void cinema.loadMedia(media, false).then(() => {
          if (epoch !== mediaEpoch.current || !party.connected) return;
          const playback = party.snapshot.playback;
          if (playback) cinema.applyPlayback(playback);
        }).catch((error: unknown) => {
          if (epoch !== mediaEpoch.current) return;
          const message = error instanceof Error ? error.message : 'The shared video could not be opened.';
          setMediaError(message);
          party.setReady(false);
          notify(message);
        });
      },
      onPlayback: (playback, forceSeek) => engine.current?.applyPlayback(playback, forceSeek),
      onPose: (id, pose) => engine.current?.setRemotePose(id, pose),
      onNotice: notify,
    });
    client.current = party;
    setState(party.snapshot);
    return () => {
      mediaEpoch.current++;
      party.dispose();
      engine.current?.setPartyBridge(null);
      engine.current?.setRemotePlayers([]);
      client.current = null;
    };
  }, [engine, notify, connectEngine]);

  useEffect(() => { client.current?.updateProfile(profile); engine.current?.setProfile(profile); }, [profile, engine, ready]);
  useEffect(() => { if (ready && client.current) connectEngine(client.current.snapshot); }, [ready, connectEngine]);

  const receiveSnapshot = useCallback((snapshot: CinemaSnapshot) => {
    const party = client.current;
    if (!party?.connected) return;
    party.setDuration(snapshot.sourceId, snapshot.duration);
    if (performance.now() - lastPoseAt.current > 110) { party.sendPose(snapshot.pose); lastPoseAt.current = performance.now(); }
  }, []);

  const create = useCallback((title: string, player?: PlayerProfile) => {
    const cinema = engine.current;
    const party = client.current;
    if (!cinema || !party) throw new Error('The cinema is still loading. Please try again in a moment.');
    const source = cinema.getMediaSelection();
    const currentSeat = cinema.getSnapshot().seatId;
    if (source.kind === 'file' && source.file.size > 250 * 1024 * 1024) throw new Error('For local tab sharing, choose a video smaller than 250 MB. Larger videos can still be watched solo.');
    mediaEpoch.current++;
    setMediaError('');
    if (player) party.updateProfile(player);
    party.create(title, source, cinema.getPlaybackState());
    if (currentSeat) void party.reserveSeat(currentSeat);
    setRoomLocation(party.snapshot.room!.code);
  }, [engine]);

  const join = useCallback(async (code: string, player?: PlayerProfile) => {
    const cinema = engine.current;
    const party = client.current;
    if (!cinema || !party) throw new Error('The cinema is still loading. Please try again in a moment.');
    const normalized = parseRoomCode(code);
    if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new Error('Enter the six-character room code, or paste the invitation link.');
    mediaEpoch.current++;
    setMediaError('');
    cinema.resetView();
    if (player) party.updateProfile(player);
    await party.join(normalized);
    setRoomLocation(party.snapshot.room!.code);
  }, [engine]);

  const leave = useCallback(() => {
    mediaEpoch.current++;
    client.current?.leave();
    setMediaError('');
    setRoomLocation(null);
    notify('You left the watch party. The cinema is still yours to enjoy.');
  }, [notify]);

  const loadMedia = useCallback(async (media: MediaSelection) => {
    const cinema = engine.current;
    const party = client.current;
    if (!cinema || !party) throw new Error('The cinema is still getting ready.');
    if (party.connected && !party.isHost) throw new Error('Only the host can change the shared film.');
    if (party.connected && media.kind === 'file' && media.file.size > 250 * 1024 * 1024) throw new Error('Choose a video under 250 MB for this local watch party.');
    setMediaError('');
    await cinema.loadMedia(media, !party.connected);
    if (party.connected && party.isHost) party.shareMedia(media, cinema.getPlaybackState().duration);
    notify(media.kind === 'embed' ? 'Only your selected provider was opened. Use its own controls; external playback positions are not synchronized.' : media.kind === 'ambient' ? 'Afterlight is back on the screen.' : party.connected ? 'The film is shared with your party. Ready up when you are settled.' : 'Your video is on the cinema screen. Take a seat and enjoy.');
  }, [engine, notify]);

  const retryMedia = useCallback(async () => {
    const party = client.current;
    if (!party?.connected || !engine.current) return;
    setMediaError('');
    await engine.current.loadMedia(party.currentMedia, false);
    if (party.snapshot.playback) engine.current.applyPlayback(party.snapshot.playback);
  }, [engine]);

  const setReadyState = useCallback((value: boolean) => { client.current?.setReady(value); }, []);
  const start = useCallback(() => client.current?.startScreening() ?? false, []);

  return { state, mediaError, create, join, leave, loadMedia, retryMedia, receiveSnapshot, setReady: setReadyState, start };
}

export type WatchPartyController = ReturnType<typeof useWatchParty>;