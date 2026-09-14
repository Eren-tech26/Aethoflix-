import { useEffect, useRef, useState } from 'react';
import { Film, Focus, Gauge, LoaderCircle, Play, Search, Server, Star, Users, X } from 'lucide-react';
import { posterUrl, readEndpoint } from '../catalog/config';
import { searchAnimeEditions, searchTitles } from '../catalog/tmdb';
import { makeEmbed, readServerPreferences, serversFor } from '../catalog/servers';
import type { CatalogTitle } from '../catalog/types';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot, Quality } from '../cinema/types';

type Props = {
  engine: CinemaEngine | null;
  snapshot: CinemaSnapshot;
  movieMode: boolean;
  hudVisible: boolean;
  waitersOn: boolean;
  quality: Quality;
  onToggleWaiters: () => void;
  onQuality: (q: Quality) => void;
  onNotify: (msg: string) => void;
};

export default function TheatreControls({ engine, snapshot, movieMode, hudVisible, waitersOn, quality, onToggleWaiters, onQuality, onNotify }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<CatalogTitle[]>([]);
  const [searched, setSearched] = useState(false);
  const [serversOpen, setServersOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const endpoint = useRef(readEndpoint()).current;
  const hidden = movieMode && !hudVisible;

  useEffect(() => {
    if (!open || !query.trim()) { setItems([]); setSearched(false); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = window.setTimeout(() => {
      searchTitles(query, 'all', 1, endpoint, controller.signal).then((data) => {
        if (!controller.signal.aborted) { setItems(data.results.slice(0, 8)); setSearched(true); }
      }).catch(() => { if (!controller.signal.aborted) { setItems([]); setSearched(true); } })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, endpoint]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) { setOpen(false); setServersOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 40); }, [open]);

  const playTitle = async (title: CatalogTitle) => {
    if (!engine) return;
    setOpen(false); setQuery(''); setServersOpen(false);
    try {
      let animeId: number | null = null;
      let animeMalId: number | null = null;
      let animeEdition = '';
      if (title.anime) {
        const matches = await searchAnimeEditions(title.title, new AbortController().signal).catch(() => []);
        const match = matches[0];
        if (match) { animeId = match.id; animeMalId = match.malId; animeEdition = match.title; }
      }
      const serverKey = title.anime ? 'megaplay' : 'nxsha';
      const media = makeEmbed(title, {
        server: serverKey,
        anime: title.anime,
        season: 1,
        episode: 1,
        animeId,
        animeMalId,
        animeEpisode: 1,
        animeEdition,
        preferences: readServerPreferences(serverKey),
      });
      await engine.loadMedia(media, true);
      if (!movieMode) window.setTimeout(() => { engine.takeSeat('B3'); }, 500);
      onNotify(`Playing “${title.title}” on the cinema screen.`);
    } catch {
      onNotify('That title could not be prepared. Try another result.');
    }
  };

  const switchServer = async (serverKey: ReturnType<typeof serversFor>[number]['key']) => {
    if (!engine || !snapshot.embed) return;
    try {
      const sel = snapshot.embed.selection;
      const media = makeEmbed(snapshot.embed.catalog, {
        ...sel,
        server: serverKey,
        preferences: readServerPreferences(serverKey),
      });
      await engine.loadMedia(media, true);
      setServersOpen(false);
      onNotify(`Switched to ${serverKey}.`);
    } catch (problem) {
      onNotify(problem instanceof Error ? problem.message : 'Could not switch server.');
    }
  };

  const lite = quality === 'performance';
  const embed = snapshot.embed;
  const serverList = embed ? serversFor(embed.selection.anime || embed.catalog.anime) : [];

  return (
    <div className={`theatre-fab-stack ${hidden ? 'is-hidden' : ''}`} ref={box}>
      <button className={`tfab ${waitersOn ? '' : 'is-off'}`} onClick={onToggleWaiters} title={waitersOn ? 'Hide NPCs' : 'Show NPCs'} aria-label="Toggle NPCs"><Users size={16} /></button>
      <button className={`tfab ${snapshot.seatZoom ? 'is-on' : ''}`} onClick={() => engine?.toggleSeatZoom()} title={snapshot.seatZoom ? 'Normal view' : 'Seat zoom'} aria-label="Seat zoom"><Focus size={16} /></button>
      <button className={`tfab ${open ? 'is-on' : ''}`} onClick={() => { setOpen((v) => !v); setServersOpen(false); }} title="Search catalogue" aria-label="Search catalogue"><Search size={16} /></button>
      {embed && <button className={`tfab ${serversOpen ? 'is-on' : ''}`} onClick={() => { setServersOpen((v) => !v); setOpen(false); }} title="Change server" aria-label="Change server"><Server size={16} /></button>}
      <button className={`tfab ${lite ? 'is-lite' : ''}`} onClick={() => onQuality(lite ? 'auto' : 'performance')} title={lite ? 'Switch to Adaptive' : 'Theatre Lite — boost FPS'} aria-label="Theatre lite mode"><Gauge size={16} /></button>

      {open && (
        <div className="tfab-panel">
          <div className="tfab-search">
            <Search size={14} />
            <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a title…" maxLength={120} />
            {busy ? <LoaderCircle className="spin" size={14} /> : query ? <button onClick={() => setQuery('')} aria-label="Clear"><X size={14} /></button> : null}
          </div>
          <div className="tfab-results">
            {!query.trim() ? <p className="tfab-hint">Search movies, series or anime — tap to play instantly.</p>
              : busy ? <p className="tfab-hint"><LoaderCircle className="spin" size={14} /> Searching…</p>
              : items.length ? items.map((item) => (
                <button key={`${item.mediaType}-${item.id}`} className="tfab-item" onClick={() => void playTitle(item)}>
                  <span className="tfab-poster">{posterUrl(item.posterPath) ? <img src={posterUrl(item.posterPath)} alt="" loading="lazy" /> : <Film size={14} />}</span>
                  <span className="tfab-meta"><strong>{item.title}</strong><small>{item.year || 'TBA'} · {item.anime ? 'Anime' : item.mediaType === 'movie' ? 'Movie' : 'Series'}</small></span>
                  {item.rating > 0 && <span className="tfab-rating"><Star size={10} />{item.rating.toFixed(1)}</span>}
                  <Play size={12} />
                </button>
              )) : searched ? <p className="tfab-hint">No matches for “{query}”.</p> : null}
          </div>
        </div>
      )}

      {serversOpen && embed && (
        <div className="tfab-panel servers">
          <p className="tfab-hint">Switch server · {embed.catalog.title}</p>
          <div className="tfab-server-list">
            {serverList.map((server) => (
              <button key={server.key} className={embed.selection.server === server.key ? 'is-active' : ''} onClick={() => void switchServer(server.key)}>
                <span>{server.number}. {server.name}</span>
                <small>{server.tag}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
