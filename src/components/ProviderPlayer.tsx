import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Info, LoaderCircle, Maximize, RotateCcw } from 'lucide-react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot } from '../cinema/types';
import { makeEmbed, saveServerPreferences, serverName, serversFor } from '../catalog/servers';
import type { AnimeEdition, AudioTrack, Episode, ServerKey } from '../catalog/types';
import { getEpisodes, getTitleDetails, searchAnimeEditions } from '../catalog/tmdb';
import { readEndpoint } from '../catalog/config';

export default function ProviderPlayer({ engine, snapshot }: { engine: CinemaEngine | null; snapshot: CinemaSnapshot }) {
  const dock = useRef<HTMLDivElement>(null);
  const fullscreen = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [seasons, setSeasons] = useState<Array<{ number: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [edition, setEdition] = useState<AnimeEdition | null>(null);
  const [editionBusy, setEditionBusy] = useState(false);
  const [epJump, setEpJump] = useState('');

  useEffect(() => {
    engine?.setProviderDock(dock.current);
    return () => engine?.setProviderDock(null);
  }, [engine]);

  const embed = snapshot.embed;

  useEffect(() => {
    if (!embed || (!embed.catalog.anime && !embed.selection.anime)) { setEdition(null); return; }
    if (embed.selection.animeId) {
      setEdition({ id: embed.selection.animeId, malId: embed.selection.animeMalId ?? null, title: embed.selection.animeEdition || embed.catalog.title, year: null, format: '', episodes: null, poster: null });
      return;
    }
    const controller = new AbortController();
    setEditionBusy(true);
    searchAnimeEditions(embed.catalog.title, controller.signal).then((matches) => {
      if (!controller.signal.aborted) setEdition(matches[0] ?? null);
    }).catch(() => { if (!controller.signal.aborted) setEdition(null); })
      .finally(() => { if (!controller.signal.aborted) setEditionBusy(false); });
    return () => controller.abort();
  }, [embed?.catalog.id, embed?.catalog.title, embed?.catalog.anime, embed?.selection.anime, embed?.selection.animeId, embed?.selection.animeMalId, embed?.selection.animeEdition]);

  useEffect(() => {
    if (!embed || embed.catalog.mediaType !== 'tv') { setEpisodes([]); setSeasons([]); return; }
    const controller = new AbortController();
    const endpoint = readEndpoint();
    setBusy(true);
    void getTitleDetails(embed.catalog, endpoint, controller.signal).then(async (details) => {
      if (controller.signal.aborted) return;
      setSeasons(details.seasons.map((season) => ({ number: season.number, name: season.name })));
      const list = await getEpisodes(embed.catalog.id, embed.selection.season, endpoint, controller.signal);
      if (!controller.signal.aborted) setEpisodes(list);
    }).catch(() => {
      if (!controller.signal.aborted) { setEpisodes([]); setSeasons([]); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [embed?.catalog.id, embed?.catalog.mediaType, embed?.selection.season]);

  if (!embed) return null;
  const servers = serversFor(embed.selection.anime || embed.catalog.anime);
  const server = servers.find((item) => item.key === embed.selection.server);
  const isSeries = embed.catalog.mediaType === 'tv' || embed.selection.anime || embed.catalog.anime;
  const currentEpisode = episodes.find((item) => item.number === embed.selection.episode);
  const animeReady = !!(edition?.id || embed.selection.animeId);

  const openFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreen.current?.requestFullscreen) await fullscreen.current.requestFullscreen();
      else setError('Fullscreen is not available in this browser. Use the provider controls instead.');
    } catch { setError('This browser could not enter fullscreen.'); }
  };

  const loadSelection = async (next: {
    server?: ServerKey;
    audio?: AudioTrack;
    season?: number;
    episode?: number;
    animeEpisode?: number;
    animeId?: number | null;
    animeMalId?: number | null;
    animeEdition?: string;
    source?: 'hd-1' | 'hd-2';
  }) => {
    if (!engine) return;
    setError('');
    try {
      const preferences = {
        ...embed.selection.preferences,
        ...(next.audio ? { audio: next.audio } : {}),
        ...(next.source ? { source: next.source } : {}),
      };
      const server = next.server || embed.selection.server;
      if (next.audio || next.server || next.source) saveServerPreferences(server, preferences);
      const media = makeEmbed(embed.catalog, {
        ...embed.selection,
        server,
        season: next.season ?? embed.selection.season,
        episode: next.episode ?? embed.selection.episode,
        animeEpisode: next.animeEpisode ?? next.episode ?? embed.selection.animeEpisode,
        animeId: next.animeId ?? edition?.id ?? embed.selection.animeId,
        animeMalId: next.animeMalId ?? edition?.malId ?? embed.selection.animeMalId ?? null,
        animeEdition: next.animeEdition ?? edition?.title ?? embed.selection.animeEdition,
        preferences,
      });
      await engine.loadMedia(media, true);
      root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That selection could not be opened.');
    }
  };

  // Once auto-matched, if current anime stream lacks IDs, refresh with matched IDs.
  useEffect(() => {
    if (!engine || !embed || !edition || !embed.selection.anime) return;
    if (embed.selection.animeId) return;
    void loadSelection({ animeId: edition.id, animeMalId: edition.malId, animeEdition: edition.title });
  }, [edition?.id]);

  const jumpEpisode = () => {
    const num = Number(epJump);
    if (!Number.isInteger(num) || num < 1) return;
    setEpJump('');
    void loadSelection({ season: embed.selection.season, episode: num, animeEpisode: num });
  };

  return <div className="external-provider-player" ref={root}>
    <div className="provider-player-title"><span><span className="connection-dot" />Server {server?.number} / {serverName(embed.selection.server)}</span><span>EXTERNAL PLAYER</span></div>
    <div ref={fullscreen} className="provider-player-frame"><div ref={dock} className="provider-player-dock" />{snapshot.providerStatus === 'opening' && <div className="provider-loading"><LoaderCircle className="spin" size={21} /><span>Opening this server...</span></div>}</div>

    <div className="provider-server-row">
      {servers.map((item) => (
        <button key={item.key} className={embed.selection.server === item.key ? 'is-active' : ''} disabled={snapshot.loading || ((item.key === 'megaplay' || item.key === 'recloud' || item.key === 'zokoanime') && !animeReady && editionBusy)} onClick={() => void loadSelection({ server: item.key })}>
          {item.number}. {item.name}
        </button>
      ))}
    </div>
    {(embed.selection.anime || embed.catalog.anime) && (
      <p className="catalog-helper">{editionBusy ? 'Matching AniList / MAL…' : edition ? `Matched ${edition.title} · AniList #${edition.id}${edition.malId ? ` · MAL #${edition.malId}` : ''}` : 'No AniList/MAL match yet — try another title or server.'}</p>
    )}

    {(embed.selection.anime || embed.catalog.anime) && (
      <div className="mp-lang-row provider-audio-row">
        <span className="mp-lang-label">AUDIO</span>
        {(['sub', 'dub'] as const).map((audio) => (
          <button key={audio} className={`mp-lang-btn ${embed.selection.preferences.audio === audio ? 'active' : ''}`} disabled={snapshot.loading} onClick={() => void loadSelection({ audio })}>{audio === 'sub' ? 'Sub' : 'Dub'}</button>
        ))}
        {embed.selection.server === 'recloud' && (['hd-1', 'hd-2'] as const).map((source) => (
          <button key={source} className={`mp-lang-btn ${embed.selection.preferences.source === source ? 'active' : ''}`} disabled={snapshot.loading} onClick={() => void loadSelection({ source })}>{source.toUpperCase()}</button>
        ))}
      </div>
    )}

    {isSeries && (
      <div className="provider-episode-bar">
        <label>
          <span className="field-label">SEASON</span>
          <select className="catalog-select" value={embed.selection.season} disabled={busy || snapshot.loading} onChange={(event) => void loadSelection({ season: Number(event.target.value), episode: 1, animeEpisode: 1 })}>
            {(seasons.length ? seasons : [{ number: embed.selection.season, name: `Season ${embed.selection.season}` }]).map((season) => (
              <option key={season.number} value={season.number}>{season.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">EPISODE</span>
          <select className="catalog-select" value={embed.selection.episode} disabled={busy || snapshot.loading} onChange={(event) => void loadSelection({ episode: Number(event.target.value), animeEpisode: Number(event.target.value) })}>
            {(episodes.length ? episodes : [{ number: embed.selection.episode, name: `Episode ${embed.selection.episode}` }]).map((item) => (
              <option key={item.number} value={item.number}>{item.number}. {item.name}</option>
            ))}
          </select>
        </label>
        <div className="provider-episode-stepper">
          <button className="icon-button" disabled={embed.selection.episode <= 1 || snapshot.loading} onClick={() => void loadSelection({ episode: embed.selection.episode - 1, animeEpisode: embed.selection.episode - 1 })} aria-label="Previous episode"><ChevronLeft size={16} /></button>
          <span>{currentEpisode ? `E${currentEpisode.number}` : `E${embed.selection.episode}`}</span>
          <button className="icon-button" disabled={snapshot.loading} onClick={() => void loadSelection({ episode: embed.selection.episode + 1, animeEpisode: embed.selection.episode + 1 })} aria-label="Next episode"><ChevronRight size={16} /></button>
        </div>
        <div className="episodes-search-box">
          <input value={epJump} onChange={(e) => setEpJump(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') jumpEpisode(); }} placeholder="Ep #" aria-label="Jump to episode" />
          <button className="mp-lang-btn" onClick={jumpEpisode}>Go</button>
        </div>
      </div>
    )}

    <div className="provider-player-actions"><button className="text-button" onClick={() => engine?.reloadProvider()}><RotateCcw size={14} />Reload</button><a href={embed.url} target="_blank" rel="noopener noreferrer">Open provider<ExternalLink size={13} /></a><button className="icon-button" onClick={() => void openFullscreen()} title="Fullscreen" aria-label="Fullscreen"><Maximize size={17} /></button></div>
    {(snapshot.providerStatus === 'slow' || snapshot.providerStatus === 'error') && <p className="form-error" role="alert">{snapshot.providerStatus === 'error' ? 'This provider reported an error.' : 'This provider is taking longer than expected.'} Try another server.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="external-player-notice"><Info size={15} /><span>AniList/MAL match automatically for anime servers. Sub/Dub and server changes reload the cinema screen immediately.</span></p>
  </div>;
}
