import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Boxes, Download, Info, Layers, LoaderCircle, Search, Server } from 'lucide-react';
import { backdropUrl, type TmdbEndpoint } from '../catalog/config';
import { getEpisodes, getTitleDetails, searchAnimeEditions } from '../catalog/tmdb';
import { animeDownloadUrl, makeEmbed, movieDownloadUrl, readServerPreferences, saveServerPreferences, serversFor } from '../catalog/servers';
import type { AnimeEdition, CatalogTitle, Episode, ServerKey, ServerPreferences, TitleDetails } from '../catalog/types';
import { endWatchSession, heartbeatWatchSession, startWatchSession } from '../analytics/client';

type Props = {
  title: CatalogTitle;
  endpoint: TmdbEndpoint;
  season: number;
  episode: number;
  onSeasonEpisode: (season: number, episode: number) => void;
  onBack: () => void;
  onOpen3D: () => void;
  onToast: (message: string) => void;
  initialServerIndex?: number;
};

const ANIME_KEYS: ServerKey[] = ['megaplay', 'recloud', 'zokoanime'];

export default function PlayerView({ title, endpoint, season, episode, onSeasonEpisode, onBack, onOpen3D, onToast, initialServerIndex }: Props) {
  const isTv = title.mediaType === 'tv';
  const servers = useMemo(() => serversFor(title.anime), [title.anime]);
  const [server, setServer] = useState<ServerKey>(() => {
    if (Number.isInteger(initialServerIndex) && initialServerIndex! >= 0) return servers[Math.min(initialServerIndex!, servers.length - 1)]?.key ?? (title.anime ? 'megaplay' : 'nxsha');
    return title.anime ? 'megaplay' : 'nxsha';
  });
  const [prefs, setPrefs] = useState<Record<string, ServerPreferences>>(() =>
    Object.fromEntries(serversFor(true).map((item) => [item.key, readServerPreferences(item.key)])));
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesBusy, setEpisodesBusy] = useState(false);
  const [edition, setEdition] = useState<AnimeEdition | null>(null);
  const [editionBusy, setEditionBusy] = useState(false);
  const [frameLoading, setFrameLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const screenRef = useRef<HTMLDivElement>(null);

  const preference = prefs[server] ?? readServerPreferences(server);
  const isAnimeServer = ANIME_KEYS.includes(server);

  useEffect(() => {
    const controller = new AbortController();
    getTitleDetails(title, endpoint, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setDetails(value);
      if (isTv && !value.seasons.some((item) => item.number === season)) {
        onSeasonEpisode(value.seasons.find((item) => item.number > 0)?.number ?? 1, 1);
      }
    }).catch(() => { /* Details are optional for playback. */ });
    return () => controller.abort();
  }, [title.id, title.mediaType, endpoint]);

  useEffect(() => {
    if (!isTv) return;
    const controller = new AbortController();
    setEpisodesBusy(true);
    getEpisodes(title.id, season, endpoint, controller.signal).then((value) => {
      if (!controller.signal.aborted) setEpisodes(value);
    }).catch(() => { if (!controller.signal.aborted) setEpisodes([]); })
      .finally(() => { if (!controller.signal.aborted) setEpisodesBusy(false); });
    return () => controller.abort();
  }, [title.id, isTv, season, endpoint]);

  useEffect(() => {
    if (!title.anime) { setEdition(null); return; }
    const controller = new AbortController();
    setEditionBusy(true);
    searchAnimeEditions(title.title, controller.signal).then((matches) => {
      if (!controller.signal.aborted) setEdition(matches[0] ?? null);
    }).catch(() => { if (!controller.signal.aborted) setEdition(null); })
      .finally(() => { if (!controller.signal.aborted) setEditionBusy(false); });
    return () => controller.abort();
  }, [title.anime, title.title]);

  const changePreference = (next: Partial<ServerPreferences>) => {
    const value = { ...preference, ...next };
    setPrefs((current) => ({ ...current, [server]: value }));
    saveServerPreferences(server, value);
    setReloadKey((v) => v + 1);
  };

  const embed = useMemo(() => {
    try {
      return {
        media: makeEmbed(title, {
          server, anime: title.anime, season: isTv ? season : 1, episode: isTv ? episode : 1,
          animeId: edition?.id ?? null,
          animeMalId: edition?.malId ?? null,
          animeEpisode: isTv ? episode : 1,
          animeEdition: edition?.title ?? '',
          preferences: preference,
        }),
        error: '',
      };
    } catch (problem) {
      return { media: null, error: problem instanceof Error ? problem.message : 'This server could not be prepared.' };
    }
  }, [title, server, season, episode, edition, preference, isTv]);

  useEffect(() => { setFrameLoading(true); }, [embed.media?.url, reloadKey]);

  useEffect(() => {
    const sessionId = `${title.mediaType}-${title.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startWatchSession({
      sessionId,
      movieId: title.id,
      type: title.anime ? 'anime' : title.mediaType,
      title: title.title,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
      poster: title.posterPath,
      backdrop: title.backdropPath,
    });
    const heartbeat = window.setInterval(() => heartbeatWatchSession(sessionId, isTv ? season : undefined, isTv ? episode : undefined), 30000);
    const onLeave = () => endWatchSession(sessionId);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', onLeave);
      endWatchSession(sessionId);
    };
  }, [title.id, title.mediaType, title.anime, title.title, title.posterPath, title.backdropPath, isTv, season, episode]);

  useEffect(() => {
    screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [season, episode, server, reloadKey]);

  const download = () => {
    const url = title.anime
      ? animeDownloadUrl(edition?.id ?? null, isTv ? episode : 1, preference.audio, edition?.malId)
      : movieDownloadUrl(title.id, title.mediaType, season, episode);
    if (!url) { onToast('Still matching this anime on AniList — try the download again in a moment.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
    onToast(title.anime ? 'Opening the Zokoanime download hub.' : 'Opening the Nxsha download hub.');
  };

  const currentEpisode = episodes.find((item) => item.number === episode);
  const subtitle = isTv ? `Season ${season} · Episode ${episode}${currentEpisode ? ` · ${currentEpisode.name}` : ''}` : `${title.year || 'Movie'}${details?.runtime ? ` · ${details.runtime} min` : ''}`;

  return (
    <div className="player-theater-view">
      <div className="player-header-bar">
        <div className="player-header-left">
          <button className="player-back-btn" onClick={onBack}><ArrowLeft size={15} />Back</button>
          <div className="player-title-info">
            <span className="player-main-title">{title.title}</span>
            <span className="player-sub-title">{subtitle}</span>
          </div>
        </div>
        <div className="player-header-right">
          <button className="player-action-pill-btn theatre-accent" onClick={onOpen3D} title="Watch this in the 3D theatre with friends">
            <Boxes size={15} /><span>3D Theatre</span>
          </button>
          <button className="player-action-pill-btn" onClick={download} title={title.anime ? 'Download via anime provider' : 'Download via Nxsha'}>
            <Download size={14} /><span className="dl-label">Download</span>
          </button>
        </div>
      </div>

      <div className="theater-screen-container">
        <div className="video-frame-wrapper">
          {embed.media ? (
            <iframe
              key={`${embed.media.url}-${reloadKey}`}
              className="video-frame-element"
              src={embed.media.url}
              title={`${title.title} player`}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              {...(server === 'nxsha' ? { sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation' } : {})}
              onLoad={() => setFrameLoading(false)}
            />
          ) : null}
          <div className={`frame-overlay ${frameLoading || !embed.media ? 'show' : ''}`}>
            {embed.media ? <>
              <span className="fo-spinner" />
              <p className="fo-title">Opening this server…</p>
              <p className="fo-sub">If it stays blank, pick a different server below. Nothing switches automatically.</p>
            </> : <>
              <p className="fo-title">This server needs a little more information</p>
              <p className="fo-sub">{embed.error}</p>
            </>}
          </div>
        </div>
      </div>

      <div className="player-content-body">
        <div className="player-section-card">
          <div className="player-section-header">
            <span className="section-badge-title"><Server size={16} />Servers</span>
            <span className="anime-opt-note">{title.anime ? '8 anime servers' : '5 servers'}</span>
          </div>
          <div className="server-pills-row">
            {servers.map((item) => {
              const animeServer = ANIME_KEYS.includes(item.key);
              const probing = animeServer && editionBusy;
              const unavailable = animeServer && !editionBusy && !edition && item.key !== 'zokoanime';
              return (
                <button
                  key={item.key}
                  className={`server-btn ${animeServer ? 'anime-server' : ''} ${server === item.key ? 'active' : ''} ${probing ? 'probing' : ''} ${unavailable ? 'unavailable' : ''}`}
                  onClick={() => { setServer(item.key); setReloadKey((value) => value + 1); }}
                  title={unavailable ? 'No AniList match was found for this title' : `Server ${item.number} — ${item.name}`}
                >
                  {item.number}. {item.name}<span className="server-tag">{item.tag}</span>
                </button>
              );
            })}
          </div>
          <div className="server-notice">
            <Info size={15} />
            <span>If a server does not work, <b>try another one</b>. Nothing switches automatically.</span>
          </div>
          {isTv && (
            <div className="player-quick-episodes">
              <button className="mp-lang-btn" disabled={episode <= 1} onClick={() => onSeasonEpisode(season, episode - 1)}>Prev</button>
              <span>S{season} · E{episode}</span>
              <button className="mp-lang-btn" onClick={() => onSeasonEpisode(season, episode + 1)}>Next</button>
            </div>
          )}
          {isAnimeServer && (
            <div className="mp-lang-row">
              <span className="mp-lang-label">Audio</span>
              {(['sub', 'dub'] as const).map((audio) => (
                <button key={audio} className={`mp-lang-btn ${preference.audio === audio ? 'active' : ''}`} onClick={() => changePreference({ audio })}>{audio === 'sub' ? 'Sub' : 'Dub'}</button>
              ))}
              {server === 'recloud' && <>
                <span className="mp-lang-label" style={{ marginLeft: 10 }}>Source</span>
                {(['hd-1', 'hd-2'] as const).map((source) => (
                  <button key={source} className={`mp-lang-btn ${preference.source === source ? 'active' : ''}`} onClick={() => changePreference({ source })}>{source.toUpperCase()}</button>
                ))}
              </>}
              <span className="anime-opt-note">Saved for this server{edition ? ` · matched ${edition.title}` : ''}</span>
            </div>
          )}
        </div>

        {isTv && (
          <div className="player-section-card">
            <div className="player-section-header"><span className="section-badge-title"><Layers size={16} />Episodes</span></div>
            <div className="episodes-controls-head">
              <div className="seasons-selector-row">
                {(details?.seasons.length ? details.seasons : [{ number: season, name: `Season ${season}`, episodeCount: 0 }]).map((item) => (
                  <button key={item.number} className={`season-tab-btn ${item.number === season ? 'active' : ''}`} onClick={() => { onSeasonEpisode(item.number, 1); screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{item.name}</button>
                ))}
              </div>
              <div className="episodes-search-box">
                <Search size={14} />
                <input
                  type="number"
                  min="1"
                  max={Math.max(episodes.length, 1)}
                  placeholder="Ep #"
                  aria-label="Jump to episode number"
                  onChange={() => { /* controlled by Enter / Go */ }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const raw = (e.target as HTMLInputElement).value;
                    const num = Number(raw);
                    const max = episodes.length || Number.MAX_SAFE_INTEGER;
                    if (!Number.isInteger(num) || num < 1 || num > max) return;
                    onSeasonEpisode(season, num);
                    (e.target as HTMLInputElement).value = '';
                    window.setTimeout(() => screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                  }}
                />
                <button
                  type="button"
                  className="mp-lang-btn"
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
                    const num = Number(input?.value || 0);
                    const max = episodes.length || Number.MAX_SAFE_INTEGER;
                    if (!Number.isInteger(num) || num < 1 || num > max) return;
                    onSeasonEpisode(season, num);
                    if (input) input.value = '';
                    window.setTimeout(() => screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                  }}
                >Go</button>
              </div>
            </div>
            {episodesBusy ? <div className="search-status"><LoaderCircle className="spin" size={20} /><span>Loading episodes…</span></div>
              : episodes.length ? (
                <div className="episodes-grid">
                  {episodes.map((item) => (
                    <button key={item.number} className={`episode-card ${item.number === episode ? 'active' : ''}`} onClick={() => { onSeasonEpisode(season, item.number); screenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                      <span className="episode-thumb">
                        {backdropUrl(title.backdropPath) ? <img src={backdropUrl(title.backdropPath)} alt="" loading="lazy" /> : null}
                        <span className="episode-number-badge">E{item.number}</span>
                      </span>
                      <span className="episode-body">
                        <span className="episode-title">{item.name || `Episode ${item.number}`}</span>
                        <span className="episode-desc">{item.airDate ? `Aired ${item.airDate}` : 'Air date unavailable'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : <div className="search-status"><span>No episode list is available for this season.</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}
