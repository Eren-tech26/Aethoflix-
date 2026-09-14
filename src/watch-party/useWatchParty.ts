import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot, MediaSelection, PlayerProfile } from '../cinema/types';
import { emptyFirebaseParty, FirebaseParty, parseRoomCode } from './FirebaseParty';
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
  const client = useRef<FirebaseParty | null>(null);
  const [state, setState] = useState<PartyState>(() => emptyFirebaseParty());
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
    let hostMuted = false;
    const party = new FirebaseParty(latestProfile.current, {
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
      onMuted: (muted) => {
        if (muted && !hostMuted) {
          engine.current?.setHostMuted(true);
          notify('The host muted your room audio. External provider audio must be muted inside its player.');
        } else if (!muted && hostMuted) {
          engine.current?.setHostMuted(false);
          notify('The host restored your room audio.');
        }
        hostMuted = muted;
      },
    });
    client.current = party;
    setState(party.snapshot);
    return () => {
      mediaEpoch.current++;
      party.dispose();
      engine.current?.setHostMuted(false);
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

  const create = useCallback(async (title: string, player?: PlayerProfile) => {
    const cinema = engine.current;
    const party = client.current;
    if (!cinema || !party) throw new Error('The cinema is still loading. Please try again in a moment.');
    const source = cinema.getMediaSelection();
    const currentSeat = cinema.getSnapshot().seatId;
    if (source.kind === 'file') throw new Error('A local video cannot be sent to remote Firebase guests. Choose a catalogue title or direct HTTPS video link before creating the online room.');
    mediaEpoch.current++;
    setMediaError('');
    if (player) party.updateProfile(player);
    await party.create(title, source, cinema.getPlaybackState());
    if (currentSeat) await party.reserveSeat(currentSeat);
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
    void client.current?.leave();
    setMediaError('');
    setRoomLocation(null);
    notify('You left the watch party. The cinema is still yours to enjoy.');
  }, [notify]);

  const loadMedia = useCallback(async (media: MediaSelection) => {
    const cinema = engine.current;
    const party = client.current;
    if (!cinema || !party) throw new Error('The cinema is still getting ready.');
    if (party.connected && !party.isHost) throw new Error('Only the host can change the shared film.');
    if (party.connected && media.kind === 'file') throw new Error('A local file stays on this device and cannot be sent through Firebase. Leave the room to play it solo, or use a direct video link for the online party.');
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
  const setBots = useCallback((count: number) => { client.current?.setBots(count); }, []);
  const kick = useCallback((id: string) => client.current?.kick(id, false) ?? Promise.resolve(), []);
  const ban = useCallback((id: string) => client.current?.kick(id, true) ?? Promise.resolve(), []);
  const mute = useCallback((id: string, muted: boolean) => client.current?.mute(id, muted) ?? Promise.resolve(), []);

  return { state, mediaError, create, join, leave, loadMedia, retryMedia, receiveSnapshot, setReady: setReadyState, setBots, kick, ban, mute, start };
}

export type WatchPartyController = ReturnType<typeof useWatchParty>;