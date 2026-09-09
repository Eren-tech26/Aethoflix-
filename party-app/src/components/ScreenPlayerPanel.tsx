import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ExternalLink, Film, FolderOpen, Link, LoaderCircle, LockKeyhole, Maximize, Pause, Play, Repeat2, RotateCcw, SkipBack, SkipForward, Upload, Volume2, VolumeX } from 'lucide-react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import { AMBIENT_MEDIA, DEMO_MEDIA, type CinemaSnapshot, type MediaSelection } from '../cinema/types';
import type { WatchPartyController } from '../watch-party/useWatchParty';
import ProviderPlayer from './ProviderPlayer';

export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SeekBar({ snapshot, onSeek, disabled = false, compact = false }: { snapshot: CinemaSnapshot; onSeek: (time: number) => void; disabled?: boolean; compact?: boolean }) {
  const [preview, setPreview] = useState<number | null>(null);
  const active = !disabled && snapshot.duration > 0;
  const value = preview ?? snapshot.currentTime;
  const percent = snapshot.duration ? Math.min(100, value / snapshot.duration * 100) : 0;
  useEffect(() => setPreview(null), [snapshot.sourceId]);
  return <div className={`player-timeline ${compact ? 'is-compact' : ''}`}>
    <input type="range" aria-label="Playback position" aria-valuetext={`${formatTime(value)} of ${formatTime(snapshot.duration)}`} min={0} max={snapshot.duration || 1} step={0.1} value={snapshot.duration ? Math.min(value, snapshot.duration) : 0} disabled={!active} style={{ background: `linear-gradient(to right, #d6bb90 ${percent}%, #454740 ${percent}%)` }} onChange={(event) => setPreview(Number(event.target.value))} onPointerUp={(event) => { if (active) onSeek(Number(event.currentTarget.value)); setPreview(null); }} onPointerCancel={() => setPreview(null)} onKeyUp={(event) => { if (active && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) { onSeek(Number(event.currentTarget.value)); setPreview(null); } }} onBlur={(event) => { if (preview !== null && active) onSeek(Number(event.currentTarget.value)); setPreview(null); }} />
    {!compact && <div className="timeline-timecodes"><span>{snapshot.duration ? formatTime(value) : 'AMBIENT'}</span><span>{snapshot.duration ? formatTime(snapshot.duration) : 'NO TIME TO KEEP'}</span></div>}
  </div>;
}

type Props = { engine: CinemaEngine | null; snapshot: CinemaSnapshot; party: WatchPartyController; onClose: () => void; onSeats: () => void };

export default function ScreenPlayerPanel({ engine, snapshot, party, onClose, onSeats }: Props) {
  const preview = useRef<HTMLCanvasElement>(null);
  const fullscreenElement = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'library' | 'file' | 'url'>('library');
  const [url, setUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const connected = party.state.status === 'connected';
  const isHost = party.state.room?.hostId === party.state.selfId;
  const canControl = !connected || isHost;
  const busy = loading || snapshot.loading;
  const playDisabled = (!canControl && !snapshot.autoplayBlocked) || busy;

  useEffect(() => {
    engine?.setPreviewCanvas(preview.current);
    return () => engine?.setPreviewCanvas(null);
  }, [engine, snapshot.mediaKind]);

  const load = async (media: MediaSelection) => {
    if (busy) return;
    setLoading(true); setError('');
    try { await party.loadMedia(media); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'This video could not be opened.'); }
    finally { setLoading(false); }
  };

  const loadFile = (file?: File) => {
    if (file) void load({ id: `file-${Date.now()}-${file.size}`, kind: 'file', title: file.name.replace(/\.[^.]+$/, ''), file });
  };

  const loadUrl = (event: FormEvent) => {
    event.preventDefault();
    void load({ id: `url-${Date.now()}`, kind: 'url', title: videoTitle.trim().slice(0, 80) || 'Your screening', url: url.trim() });
  };

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreenElement.current?.requestFullscreen) await fullscreenElement.current.requestFullscreen();
      else setError('Player fullscreen is not available in this browser. Use the cinema fullscreen control instead.');
    } catch { setError('Your browser could not open fullscreen. The player still works inside the cinema.'); }
  };

  return <>
    <div className="panel-heading screen-panel-heading"><span className="eyebrow">THE AETHOFLIX PLAYER</span><h2 id="panel-heading">Your story. Front and center.</h2><p>{snapshot.embed ? 'Your selected provider, with its own playback controls.' : connected ? isHost ? 'You are the host. The shared screen follows your controls.' : 'The host keeps the story in sync. Make yourself comfortable.' : 'The same picture. The same player. Right on the cinema screen.'}</p></div>
    {snapshot.embed ? <ProviderPlayer engine={engine} snapshot={snapshot} /> : <div className="screen-player-view" ref={fullscreenElement}>
      <div className="screen-video-preview"><canvas ref={preview} aria-label={`Live preview of ${snapshot.filmTitle}`} />{(busy || snapshot.buffering) && <div className="video-loading-overlay" role="status"><LoaderCircle className="spin" size={24} /><span>{busy ? 'Preparing your film' : 'Buffering...'}</span></div>}{!busy && !snapshot.buffering && (!snapshot.playing || snapshot.autoplayBlocked) && <button className="video-play-overlay" onClick={() => engine?.togglePlayback()} disabled={playDisabled} aria-label={snapshot.autoplayBlocked ? 'Enable video playback on this tab' : 'Play video'}><Play size={25} fill="currentColor" />{snapshot.autoplayBlocked && <span>Enable playback</span>}</button>}</div>
      <div className="screen-player-controls">
        <SeekBar snapshot={snapshot} disabled={!canControl || busy} onSeek={(time) => engine?.seek(time)} />
        <div className="screen-player-control-row"><div className="transport-buttons"><button className="icon-button" onClick={() => engine?.seek(snapshot.currentTime - 10)} disabled={!canControl || !snapshot.duration || busy} aria-label="Rewind ten seconds" title="Back 10 seconds"><SkipBack size={16} /></button><button className="icon-button main-transport-button" onClick={() => engine?.togglePlayback()} disabled={playDisabled} aria-label={snapshot.autoplayBlocked ? 'Enable playback' : snapshot.playing ? 'Pause video' : 'Play video'}>{snapshot.playing && !snapshot.autoplayBlocked ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button className="icon-button" onClick={() => engine?.seek(snapshot.currentTime + 10)} disabled={!canControl || !snapshot.duration || busy} aria-label="Forward ten seconds" title="Forward 10 seconds"><SkipForward size={16} /></button></div>
          <div className="player-volume"><button className="icon-button" onClick={() => engine?.toggleMute()} aria-label={snapshot.muted ? 'Unmute your sound' : 'Mute your sound'}>{snapshot.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input type="range" min={0} max={1} step={0.01} value={snapshot.muted ? 0 : snapshot.volume} onChange={(event) => engine?.setVolume(Number(event.target.value))} aria-label="Your playback volume" /></div>
          <button className="icon-button player-fullscreen" onClick={() => void fullscreen()} aria-label="Toggle player fullscreen"><Maximize size={16} /></button>
        </div>
      </div>
    </div>}
    <div className="screen-player-title"><div><span className="field-label">{snapshot.embed ? 'EXTERNAL PROVIDER' : snapshot.mediaKind === 'ambient' ? 'AETHOFLIX AMBIENT' : snapshot.mediaKind === 'file' ? 'LOCAL VIDEO' : 'DIRECT VIDEO'}</span><h3>{snapshot.filmTitle}</h3></div>{connected && <span className="player-sync-status"><span className="connection-dot" />{snapshot.embed ? 'Selection shared' : snapshot.autoplayBlocked || snapshot.loading || snapshot.playbackError || party.mediaError ? 'Needs attention' : 'Party playback'}</span>}</div>
    {!snapshot.embed && <div className="screen-player-options"><label>Speed<select value={snapshot.rate} disabled={!canControl || busy} aria-label="Playback speed" onChange={(event) => engine?.changePlayback({ rate: Number(event.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option value={rate} key={rate}>{rate === 1 ? 'Normal' : `${rate}x`}</option>)}</select></label><button className={`loop-control ${snapshot.loop ? 'is-active' : ''}`} disabled={!canControl || busy} aria-pressed={snapshot.loop} onClick={() => engine?.changePlayback({ loop: !snapshot.loop })}><Repeat2 size={14} />Loop {snapshot.loop ? 'on' : 'off'}</button><button className="text-button" onClick={onSeats}><ArmchairIcon />Choose a seat</button></div>}
    {!canControl ? <div className="guest-player-notice"><LockKeyhole size={18} /><div><strong>{snapshot.embed ? 'Your host chooses the source.' : 'Your host has the remote.'}</strong><p>{snapshot.embed ? 'The title, episode, and server follow the host. Playback and sound are controlled separately inside each external iframe.' : 'Play, pause, seeking, speed, and the source follow the host. Your volume is personal.'}</p></div></div> : <>
      <div className="source-tabs" role="tablist" aria-label="Choose a video source">{([{ id: 'library', label: 'To get you started', icon: Film }, { id: 'file', label: 'My video', icon: FolderOpen }, { id: 'url', label: 'Video link', icon: Link }] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item.id} aria-controls="video-source-content" key={item.id} onClick={() => { setTab(item.id); setError(''); }} disabled={busy}><item.icon size={14} /><span>{item.label}</span></button>)}</div>
      <div id="video-source-content" className="source-content">
        {tab === 'library' && <div className="starter-films"><button className="starter-film" onClick={() => void load(AMBIENT_MEDIA)} disabled={busy}><img src="/images/afterlight.jpg" alt="" /><span><strong>Afterlight</strong><small>An alpine escape. No time to keep.</small></span>{snapshot.sourceId === AMBIENT_MEDIA.id ? <Check size={16} /> : <Play size={16} />}</button><button className="starter-film" onClick={() => void load(DEMO_MEDIA)} disabled={busy}><span className="starter-film-art"><Film size={23} strokeWidth={1.2} /></span><span><strong>Sintel</strong><small>The official trailer. Try the video player.</small></span>{snapshot.sourceId === DEMO_MEDIA.id ? <Check size={16} /> : <Play size={16} />}</button><p className="demo-credit">Sintel by the Blender Foundation. <a href="https://durian.blender.org/" target="_blank" rel="noopener noreferrer">About the film<ExternalLink size={10} /></a> Trailer requires internet access.</p></div>}
        {tab === 'file' && <div className={`upload-area ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}><input className="sr-only" ref={fileInput} type="file" accept="video/*" tabIndex={-1} onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = ''; }} /><Upload size={23} strokeWidth={1.3} /><h3>Bring your own story.</h3><p>Drop a video here, or choose one from your device.</p><button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? 'Preparing video...' : 'Choose a video'}<ArrowRight size={15} /></button><small>{connected ? 'MP4 / WebM. Up to 250 MB for local tab sharing.' : 'MP4 and WebM recommended. Nothing is uploaded.'}</small></div>}
        {tab === 'url' && <form className="video-url-form" onSubmit={loadUrl}><label className="field-label" htmlFor="direct-video-url">DIRECT VIDEO URL</label><input id="direct-video-url" type="url" className="cinema-input" placeholder="https://example.com/your-film.mp4" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={busy} /><label className="field-label" htmlFor="direct-video-name">FILM TITLE <span>OPTIONAL</span></label><input id="direct-video-name" className="cinema-input" value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder="A story worth sharing" maxLength={80} disabled={busy} /><p>Direct HTTPS MP4/WebM files only. The server must allow cross-origin playback. YouTube, embed, and subscription-service links will not work.</p><button className="secondary-button full-width" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}Load onto the screen<ArrowRight size={15} /></button></form>}
      </div>
    </>}
    {(error || party.mediaError || snapshot.playbackError) && <div className="player-error-message" role="alert"><p>{error || party.mediaError || snapshot.playbackError}</p>{!canControl && <button className="text-button" disabled={busy} onClick={() => { setError(''); void party.retryMedia().catch((problem: unknown) => setError(problem instanceof Error ? problem.message : 'The video could not be reopened.')); }}><RotateCcw size={14} />Retry shared video</button>}</div>}
    <button className="text-button back-to-cinema" onClick={onClose}>Back to the cinema<ArrowRight size={15} /></button>
    {connected && <p className="panel-footnote">Shared only with tabs in this browser.<br />{snapshot.embed ? 'External player positions are not synchronized.' : 'Direct-video playback is synchronized by the host.'} No cross-device service.</p>}
  </>;
}

function ArmchairIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 13V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v7M5 19v3m14-3v3" /><path d="M3 10a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 4 0v4a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-4a2 2 0 0 1 2-2Z" /></svg>;
}