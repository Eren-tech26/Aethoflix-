import { useCallback, useEffect, useRef, useState } from 'react';
import { Armchair, ArrowLeft, ArrowRight, BellRing, Check, ChevronDown, Film, Grid2X2, LoaderCircle, Maximize, Minimize, Monitor, Mouse, Pause, PersonStanding, Play, RotateCcw, Users, Volume2, VolumeX, X } from 'lucide-react';
import CinemaScene from './components/CinemaScene';
import ExperiencePanels, { type Panel } from './components/ExperiencePanels';
import Joystick from './components/Joystick';
import SiteView, { type TheatreIntent } from './site/SiteView';
import AdminApp from './admin/AdminApp';
import TheatreControls from './components/TheatreControls';
import type { CatalogTitle, ServerKey } from './catalog/types';
import type { CinemaEngine } from './cinema/CinemaEngine';
import { makeEmbed, readServerPreferences, serversFor } from './catalog/servers';
import { getTitleById } from './catalog/tmdb';
import { INITIAL_SNAPSHOT, type CinemaSnapshot, type PlayerProfile, type Quality } from './cinema/types';
import type { LayoutValidation } from './cinema/world';
import { useWatchParty } from './watch-party/useWatchParty';
import { cleanProfile, loadProfile, saveProfile } from './watch-party/profile';
import { PlayerAvatar } from './components/PlayerProfilePanel';
import { formatTime, SeekBar } from './components/ScreenPlayerPanel';

function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="32" height="34" viewBox="0 0 36 40" fill="none" aria-hidden="true"><path d="M18.1 3 2 34.5h7.8L22 10.5 18.1 3Z" fill="currentColor" /><path d="m24.5 15.7-4.1 8 5.6 10.8H34l-9.5-18.8Z" fill="currentColor" /><path d="m17.1 27.2 6.1 3.5-6.1 3.5v-7Z" fill="currentColor" /></svg>;
}

function initialQuality(): Quality {
  try { const saved = localStorage.getItem('aethoflix-quality-v2'); if (saved === 'auto' || saved === 'high' || saved === 'performance') return saved; } catch { /* Storage is optional in private browsing. */ }
  return 'performance';
}

function initialMotion() {
  try { const saved = localStorage.getItem('aethoflix-reduced-motion'); if (saved !== null) return saved === 'true'; } catch { /* The system preference is the fallback. */ }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function App() {
  const engine = useRef<CinemaEngine | null>(null);
  const pendingSeat = useRef<string | null>(null);
  const pendingAutoPlay = useRef<{ title: CatalogTitle; season: number; episode: number; server: ServerKey } | null>(null);
  const [snapshot, setSnapshot] = useState<CinemaSnapshot>(INITIAL_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(() => new URLSearchParams(window.location.search).has('party') ? 'party' : null);
  const [catalogReturn, setCatalogReturn] = useState<Panel | null>(null);
  const [view, setView] = useState<'site' | 'cinema'>(() => (new URLSearchParams(window.location.search).has('party') ? 'cinema' : 'site'));
  const [catalogTitle, setCatalogTitle] = useState<CatalogTitle | null>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [movieHint, setMovieHint] = useState(false);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile);
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [reducedMotion, setReducedMotion] = useState(initialMotion);
  const [refreshTarget, setRefreshTarget] = useState(() => { try { return localStorage.getItem('aethoflix-high-refresh') === 'on'; } catch { return false; } });
  const [waitersOn, setWaitersOn] = useState(true);
  const [validation, setValidation] = useState<LayoutValidation | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configuration = useRef({ quality, reducedMotion, panel, profile, waitersOn });
  configuration.current = { quality, reducedMotion, panel, profile, waitersOn };
  const movieMode = snapshot.mode === 'seated' || snapshot.mode === 'sitting';
  const transitioning = snapshot.mode === 'sitting' || snapshot.mode === 'standing';
  const closePanel = useCallback(() => setPanel(null), []);
  const enterTheatre = useCallback((title?: CatalogTitle, intent: TheatreIntent = 'party', deepLink?: { season: number; episode: number; server: ServerKey }) => {
    setCatalogTitle(title ?? null);
    setReady(false);
    setView('cinema');
    if (title && intent === 'play') {
      pendingAutoPlay.current = { title, season: deepLink?.season ?? 1, episode: deepLink?.episode ?? 1, server: deepLink?.server ?? 'nxsha' };
      setPanel(null);
    } else if (intent === 'ownVideo' || intent === 'ownLink') {
      setPanel('screen');
    } else {
      setPanel(title ? 'catalog' : 'party');
    }
  }, []);
  const backToSite = useCallback(() => { pendingSeat.current = null; setPanel(null); setView('site'); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const idParam = params.get('id');
    if ((type !== 'movie' && type !== 'tv') || !idParam) return;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return;
    const season = Math.max(1, Number(params.get('s')) || 1);
    const episode = Math.max(1, Number(params.get('e')) || 1);
    const srvIndex = Number(params.get('srv'));
    const controller = new AbortController();
    void getTitleById(id, type, 'standard', controller.signal).then((title) => {
      if (controller.signal.aborted) return;
      const options = serversFor(title.anime);
      const server = (Number.isInteger(srvIndex) && options[srvIndex] ? options[srvIndex].key : options[0]?.key) ?? 'nxsha';
      enterTheatre(title, 'play', { season, episode, server });
    }).catch((err) => { if (!controller.signal.aborted) console.error('Deep-link title lookup failed:', err); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const revealHud = useCallback(() => {
    if (!movieMode) return;
    setHudVisible(true);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHudVisible(false), 6500);
  }, [movieMode]);
  useEffect(() => {
    if (movieMode) {
      setHudVisible(false);
      setMovieHint(true);
      const hintTimer = setTimeout(() => setMovieHint(false), 7000);
      return () => clearTimeout(hintTimer);
    }
    setHudVisible(true);
    setMovieHint(false);
  }, [movieMode]);
  useEffect(() => {
    if (!movieMode) return;
    const onDown = () => revealHud();
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [movieMode, revealHud]);
  useEffect(() => () => { if (hudTimer.current) clearTimeout(hudTimer.current); }, []);
  const openCatalogFromParty = useCallback(() => { setCatalogReturn('party'); setPanel('catalog'); }, []);
  const closeCatalog = useCallback(() => {
    const back = catalogReturn;
    setCatalogReturn(null);
    setPanel(back);
  }, [catalogReturn]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5200);
  }, []);

  const watchParty = useWatchParty({ engine, ready, profile, notify });
  const inParty = watchParty.state.status === 'connected';
  const canControlPlayback = !inParty || watchParty.state.room?.hostId === watchParty.state.selfId;
  const updateProfile = useCallback((value: PlayerProfile) => {
    const next = cleanProfile(value);
    setProfile(next);
    saveProfile(next);
    notify('Your player has been updated. Make yourself at home.');
  }, [notify]);

  const toggleWaiters = useCallback(() => {
    setWaitersOn((v) => {
      const next = !v;
      engine.current?.setServiceVisible(next);
      return next;
    });
  }, []);

  const onEngine = useCallback((instance: CinemaEngine | null) => {
    engine.current = instance;
    if (instance) {
      instance.setQuality(configuration.current.quality);
      instance.setReducedMotion(configuration.current.reducedMotion);
      instance.setInputEnabled(configuration.current.panel === null);
      instance.setProfile(configuration.current.profile);
      instance.setServiceVisible(configuration.current.waitersOn);
    }
  }, []);

  const onSnapshot = useCallback((next: CinemaSnapshot) => {
    setSnapshot(next);
    watchParty.receiveSnapshot(next);
    if (next.mode === 'explore' && pendingSeat.current) {
      const id = pendingSeat.current;
      pendingSeat.current = null;
      queueMicrotask(() => engine.current?.takeSeat(id));
    }
  }, [watchParty.receiveSnapshot]);

  useEffect(() => {
    // Theatre always prefers a real quality mode immediately; performance is the low-end default.
    engine.current?.setQuality(quality || 'performance');
    try { localStorage.setItem('aethoflix-quality-v2', quality); } catch { /* Preferences need not persist. */ }
  }, [quality]);
  useEffect(() => {
    engine.current?.setReducedMotion(reducedMotion);
    try { localStorage.setItem('aethoflix-reduced-motion', String(reducedMotion)); } catch { /* Preferences need not persist. */ }
  }, [reducedMotion]);
  useEffect(() => {
    engine.current?.setRefreshTarget(refreshTarget);
    try { localStorage.setItem('aethoflix-high-refresh', refreshTarget ? 'on' : 'off'); } catch { /* Preferences need not persist. */ }
  }, [refreshTarget]);
  useEffect(() => { engine.current?.setInputEnabled(panel === null); }, [panel]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notify('Fullscreen is not available in this browser. You can still explore the full room.');
    } catch { notify('Your browser could not enter fullscreen. Try the browser fullscreen control instead.'); }
  }, [notify]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName) || panel) return;
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen(); }
      if (event.key === '?') { event.preventDefault(); setPanel('controls'); }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); window.removeEventListener('keydown', onKeyDown); };
  }, [panel, toggleFullscreen]);

  const reset = () => {
    pendingSeat.current = null;
    engine.current?.resetView();
    setPanel(null);
  };

  const chooseSeat = (id: string) => {
    setPanel(null);
    if (snapshot.mode === 'seated') {
      if (snapshot.seatId === id) return;
      pendingSeat.current = id;
      engine.current?.stand();
    } else engine.current?.takeSeat(id);
  };

  const primaryAction = () => {
    if (snapshot.mode === 'seated') engine.current?.stand();
    else if (snapshot.mode === 'walking') engine.current?.cancelWalk();
    else if (snapshot.mode === 'explore') engine.current?.takeSeat();
  };

  const nearSeat = !!snapshot.nearbySeatId && !snapshot.overview;
  const showSitStand = movieMode || snapshot.mode === 'walking' || snapshot.mode === 'standing' || !!snapshot.reservingSeat || nearSeat;
  let actionLabel = nearSeat ? `Sit ${snapshot.nearbySeatId}` : 'Sit';
  if (snapshot.mode === 'walking') actionLabel = 'Cancel';
  if (snapshot.mode === 'sitting') actionLabel = 'Sit';
  if (snapshot.mode === 'seated') actionLabel = 'Stand';
  if (snapshot.mode === 'standing') actionLabel = 'Stand';
  if (snapshot.reservingSeat) actionLabel = 'Wait';

  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin') return <AdminApp />;
  if (view === 'site') return <SiteView onEnterTheatre={enterTheatre} />;

  return <>
    <div className={`app-shell ${ready ? 'is-ready' : ''} ${movieMode ? 'movie-session' : ''} ${movieMode && !hudVisible ? 'hud-hidden' : ''} ${reducedMotion ? 'reduced-motion' : ''}`} inert={panel ? true : undefined}>
      <header className="site-header">
        <button className="back-to-site" onClick={backToSite} title="Back to the movie site" aria-label="Back to the movie site"><ArrowLeft size={16} /><span>Site</span></button>
        <button className="brand" onClick={reset} aria-label="AethoFlix, return to the entrance"><BrandMark /><span className="brand-name">AETHOFLIX</span><span className="brand-divider" /><span className="brand-product">Watch Party</span></button>
        <nav className="main-nav" aria-label="Experience navigation"><button className="nav-link is-active" onClick={closePanel}>The cinema</button><button className="nav-link" onClick={() => setPanel('experience')}>The experience</button></nav>
        <div className="header-right"><button className={`watch-party-button ${inParty ? 'is-connected' : ''}`} onClick={() => setPanel('party')} title="Watch Party: TMDB collection and shared screening"><Users size={15} strokeWidth={1.5} /><span>Watch party</span>{inParty && <span className="party-button-count">{watchParty.state.members.length}/10</span>}</button><button className="profile-button" onClick={() => setPanel('player')} aria-label={`Customize your player, ${profile.name}`} title="Your player"><PlayerAvatar profile={profile} /></button></div>
      </header>

      <main className="cinema-stage" aria-label="The AethoFlix private cinema">
        <CinemaScene
          onEngine={onEngine}
          onUpdate={onSnapshot}
          onReady={() => {
            setReady(true);
            if (pendingAutoPlay.current) {
              const pending = pendingAutoPlay.current;
              pendingAutoPlay.current = null;
              try {
                const selection = {
                  server: pending.server,
                  anime: pending.title.anime,
                  season: pending.season,
                  episode: pending.episode,
                  animeId: null,
                  animeEpisode: pending.episode,
                  animeEdition: '',
                  preferences: readServerPreferences(pending.server),
                };
                const media = makeEmbed(pending.title, selection);
                void engine.current?.loadMedia(media, true);
                setTimeout(() => {
                  engine.current?.takeSeat('B3');
                }, 550);
              } catch (err) {
                console.error(err);
              }
            }
          }}
          onMessage={notify}
          onError={setError}
          onValidation={setValidation}
        />
        <div className="stage-top-shade" aria-hidden="true" /><div className="stage-bottom-shade" aria-hidden="true" /><div className="stage-vignette" aria-hidden="true" />
        <TheatreControls
          engine={engine.current}
          snapshot={snapshot}
          movieMode={movieMode}
          hudVisible={hudVisible}
          waitersOn={waitersOn}
          quality={quality}
          onToggleWaiters={toggleWaiters}
          onQuality={setQuality}
          onNotify={notify}
        />

        <div className={`scene-intro ${!snapshot.overview ? 'is-hidden' : ''}`}><span className="eyebrow"><span className="intro-line" />THE OUTSIDE WORLD CAN WAIT</span><h1>The AethoFlix Cinema<span>.</span></h1><p>Step inside. Settle in. Make a little room for a great story.</p></div>

        <div className="scene-controls">
          <div className="desktop-controls">{movieMode ? <><span className="control-hint"><kbd>E</kbd><span>Stand anytime</span></span><span className="control-hint">{snapshot.embed ? <><Mouse size={16} /><span>Use the screen controls</span></> : <><kbd className="wide-key">Space</kbd><span>Play / pause</span></>}</span></> : <><span className="control-hint"><span className="key-group"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move</span></span><span className="control-hint look-control"><Mouse size={16} strokeWidth={1.4} /><span>Drag to look</span></span><span className="control-hint interact-control"><kbd>E</kbd><span>Sit / stand</span></span></>}</div>
          {!movieMode && !transitioning && ready && <Joystick onMove={(x, y) => engine.current?.setJoystick(x, y)} />}
          <div className="seat-action"><div className="seat-action-buttons">{(movieMode || snapshot.eatingProgress !== null) && <button className={`service-bell-button ${snapshot.eatingProgress !== null ? 'is-eating' : ''}`} onClick={() => engine.current?.ringBell()} disabled={!ready || !!error || snapshot.servicePhase !== 'idle' || snapshot.eatingProgress !== null} title={snapshot.eatingProgress !== null ? snapshot.foodName : snapshot.servicePhase !== 'idle' ? 'Server on the way' : 'Ring for service'} aria-label={snapshot.eatingProgress !== null ? 'Enjoying your order' : 'Ring for service'}>{snapshot.eatingProgress !== null ? <LoaderCircle className="spin" size={15} /> : <BellRing size={16} strokeWidth={1.5} />}</button>}{showSitStand && <button className={`primary-button take-seat-button ${snapshot.mode === 'seated' ? 'stand-button' : ''}`} onClick={primaryAction} disabled={!ready || !!error || transitioning || !!snapshot.reservingSeat} title={snapshot.mode === 'walking' ? 'Cancel the walk' : actionLabel} aria-label={actionLabel}>{transitioning || snapshot.mode === 'walking' || snapshot.reservingSeat ? <LoaderCircle className="spin" size={16} /> : snapshot.mode === 'seated' || snapshot.mode === 'standing' ? <PersonStanding size={18} /> : <Armchair size={17} strokeWidth={1.65} />}</button>}<button className="seat-map-button" onClick={() => setPanel('seats')} disabled={!ready || !!error} aria-label="Choose a seat on the seating map" title="Choose your seat"><Grid2X2 size={16} strokeWidth={1.5} /></button></div>{snapshot.eatingProgress !== null && <span className="service-progress" aria-hidden="true"><i style={{ width: `${Math.round(snapshot.eatingProgress * 100)}%` }} /></span>}<span className="seat-action-caption">{movieMode ? `Seat ${snapshot.seatId}. Enjoy the view.` : snapshot.mode === 'walking' ? 'Use the movement controls to take over.' : snapshot.mode === 'standing' ? 'The room is yours to explore again.' : 'Make yourself comfortable.'}</span></div>
          <button className="reset-view" onClick={reset} disabled={!ready || !!error} title="Return to the rear entrance"><RotateCcw size={14} strokeWidth={1.5} /><span>Reset view</span></button><span className="mobile-look-hint">Drag the room to look around</span>
        </div>
        {!error && <div className={`cinema-loading ${ready ? 'is-loaded' : ''}`} aria-hidden={ready} role="status"><BrandMark className="loading-mark" /><span className="loading-overline">SOMETHING GOOD IS ABOUT TO BEGIN</span><h2>Preparing your private cinema.</h2><span className="loading-track"><i /></span></div>}
        {error && <div className="cinema-error" role="alert"><Monitor size={35} strokeWidth={1} /><h2>Your seat is still here.</h2><p>{error}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again<RotateCcw size={16} /></button></div>}
        {movieMode && movieHint && !hudVisible && <span className="movie-tap-hint" role="status">Tap anywhere for controls · E to stand</span>}
      </main>

      <footer className="playback-bar">
        {snapshot.duration > 0 && <div className="footer-film-timeline"><SeekBar compact snapshot={snapshot} disabled={!canControlPlayback || snapshot.loading} onSeek={(time) => engine.current?.seek(time)} /></div>}
        <div className="now-playing"><button className="playback-toggle" onClick={() => snapshot.embed ? setPanel('screen') : engine.current?.togglePlayback()} disabled={!ready || !!error || snapshot.loading || (!snapshot.embed && !canControlPlayback && !snapshot.autoplayBlocked)} aria-label={snapshot.embed ? 'Open provider player controls' : snapshot.autoplayBlocked ? 'Enable playback on this tab' : snapshot.playing ? 'Pause screen playback' : 'Resume screen playback'}>{snapshot.embed ? <Monitor size={14} /> : snapshot.playing && !snapshot.autoplayBlocked ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button className="film-button" onClick={() => setPanel('screen')} disabled={!ready || !!error} aria-label={`Open screen player, ${snapshot.filmTitle}`}><span className="footer-eyebrow">{snapshot.loading ? 'LOADING YOUR FILM' : snapshot.embed ? 'SELECTED PROVIDER' : snapshot.autoplayBlocked ? 'TAP PLAY TO START' : inParty ? 'WATCHING TOGETHER' : 'NOW SHOWING'}</span><span className="film-meta"><strong>{snapshot.filmTitle}</strong><span className="film-kind">{snapshot.embed ? 'External player' : snapshot.mediaKind === 'file' ? 'Your collection' : snapshot.mediaKind === 'url' ? 'Video player' : 'Ambient scene'}</span><ChevronDown size={12} /></span></button></div>
        {inParty ? <button className="footer-center party-footer-presence" onClick={() => setPanel('party')}><Users size={14} /><span>{watchParty.state.members.length} in your watch party</span><span className="footer-local-label">ONLINE</span></button> : snapshot.duration > 0 ? <button className="footer-center footer-timecode" onClick={() => setPanel('screen')}><span>{formatTime(snapshot.currentTime)}<span> / {formatTime(snapshot.duration)}</span></span><span>Open player<ArrowRight size={11} /></span></button> : <div className="footer-center"><Film size={13} strokeWidth={1.3} /><span>Little room. Big screen. Just right.</span></div>}
        <div className="experience-tools">{movieMode && <button className="waiters-toggle tool-button" onClick={toggleWaiters} aria-pressed={waitersOn} title={waitersOn ? 'Hide the waiters while you watch' : 'Bring the waiters back'}><BellRing size={15} strokeWidth={1.5} /><span>Waiters {waitersOn ? 'on' : 'off'}</span></button>}<span className="tool-divider" /><button className="sound-button tool-button" onClick={() => snapshot.embed ? setPanel('screen') : engine.current?.toggleMute()} disabled={!ready || !!error} aria-label={snapshot.embed ? 'Open provider sound controls' : snapshot.muted ? 'Turn sound on' : 'Mute sound'}>{snapshot.embed || !snapshot.muted ? <Volume2 size={16} strokeWidth={1.5} /> : <VolumeX size={16} strokeWidth={1.5} />}<span>{snapshot.embed ? 'Provider sound' : `Sound ${snapshot.muted ? 'off' : 'on'}`}</span></button><span className="tool-divider" /><button className="quality-button tool-button" onClick={() => setPanel('settings')} title="Graphics and accessibility settings"><Monitor size={15} strokeWidth={1.5} /><span>{quality === 'auto' ? 'Adaptive' : quality === 'high' ? 'Ultra' : 'Performance'}</span><span className="fps-counter"><i />{snapshot.fps || '--'} <span>FPS</span>{snapshot.highRefresh && <b>120Hz</b>}</span></button><span className="tool-divider" /><button className="icon-button fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>{fullscreen ? <Minimize size={17} strokeWidth={1.5} /> : <Maximize size={17} strokeWidth={1.5} />}</button></div>
      </footer>
    </div>
    {panel && <ExperiencePanels panel={panel} onClose={closePanel} snapshot={snapshot} onChooseSeat={chooseSeat} quality={quality} onQuality={setQuality} reducedMotion={reducedMotion} onReducedMotion={setReducedMotion} refreshTarget={refreshTarget} onRefreshTarget={setRefreshTarget} validation={validation} onReset={reset} engine={engine.current} party={watchParty} profile={profile} onProfile={updateProfile} onOpenPanel={setPanel} onOpenCatalog={openCatalogFromParty} onCloseCatalog={closeCatalog} initialCatalogTitle={catalogTitle} cinemaReady={ready && !error} />}
    {toast && <div className="notification-toast" role="status" key={toast}><Check size={16} /><span>{toast}</span><button aria-label="Dismiss message" onClick={() => setToast('')}><X size={15} /></button></div>}
  </>;
}