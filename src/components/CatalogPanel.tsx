import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, Film, Globe2, LoaderCircle, RotateCcw, Search, Star, X } from 'lucide-react';
import { BYPASS_BASE, posterUrl, readEndpoint, saveEndpoint, TMDB_BASE, TMDB_LOGO, type TmdbEndpoint } from '../catalog/config';
import { getEpisodes, getTitleDetails, resolveAnimeIds, searchTitles } from '../catalog/tmdb';
import type { AnimeEdition, CatalogKind, CatalogPage, CatalogTitle, Episode, TitleDetails } from '../catalog/types';
import type { CinemaSnapshot } from '../cinema/types';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { WatchPartyController } from '../watch-party/useWatchParty';
import ServerPicker from './ServerPicker';
import ProviderPlayer from './ProviderPlayer';

export function TmdbAttribution() {
  return <div className="tmdb-attribution"><a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database"><img src={TMDB_LOGO} alt="TMDB" width="78" height="12" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB. TMDB supplies metadata, not video streams.</p></div>;
}

function Poster({ title, className = '' }: { title: CatalogTitle; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = posterUrl(title.posterPath);
  return <span className={`catalog-poster ${className}`}>{src && !failed ? <img src={src} alt={`${title.title} poster`} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="missing-poster"><Film size={28} /><span>{title.title}</span></span>}</span>;
}

const MY_LIST_KEY = 'aethoflix-my-list-v1';

function isStoredTitle(value: unknown): value is CatalogTitle {
  const title = value as Partial<CatalogTitle>;
  return !!value && typeof value === 'object' && typeof title.id === 'number' && Number.isInteger(title.id)
    && (title.mediaType === 'movie' || title.mediaType === 'tv') && typeof title.title === 'string'
    && typeof title.posterPath === 'string' && typeof title.anime === 'boolean' && typeof title.year === 'string';
}

function readMyList(): CatalogTitle[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MY_LIST_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(isStoredTitle).slice(0, 60) : [];
  } catch { return []; }
}

function writeMyList(list: CatalogTitle[]) {
  try { localStorage.setItem(MY_LIST_KEY, JSON.stringify(list)); } catch { /* The list can remain session-only. */ }
}

type Props = { snapshot: CinemaSnapshot; engine: CinemaEngine | null; party: WatchPartyController; onFinish: () => void; onSeats: () => void; initialTitle?: CatalogTitle | null };

export default function CatalogPanel({ snapshot, engine, party, onFinish, onSeats, initialTitle = null }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CatalogKind>('all');
  const [page, setPage] = useState(1);
  const [endpoint, setEndpoint] = useState<TmdbEndpoint>(readEndpoint);
  const [results, setResults] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<CatalogTitle | null>(initialTitle);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [myList, setMyList] = useState<CatalogTitle[]>(readMyList);
  const [suggestedEdition, setSuggestedEdition] = useState<AnimeEdition | null>(null);
  const [lookupType, setLookupType] = useState<'anilist' | 'mal'>('anilist');
  const [lookupId, setLookupId] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const canControl = party.state.status !== 'connected' || party.state.room?.hostId === party.state.selfId;
  const inList = (title: CatalogTitle) => myList.some((item) => item.id === title.id && item.mediaType === title.mediaType);
  useEffect(() => { if (initialTitle) setSelected(initialTitle); }, [initialTitle?.id, initialTitle?.mediaType]);

  const toggleList = (title: CatalogTitle) => {
    setMyList((previous) => {
      const exists = previous.some((item) => item.id === title.id && item.mediaType === title.mediaType);
      const next = exists ? previous.filter((item) => !(item.id === title.id && item.mediaType === title.mediaType)) : [title, ...previous];
      writeMyList(next);
      return next;
    });
  };

  const doLookup = async () => {
    if (lookupBusy || !lookupId.trim()) return;
    setLookupBusy(true); setLookupError(''); setLookupMessage('');
    const controller = new AbortController();
    try {
      const value = Number(lookupId);
      const edition = await resolveAnimeIds(lookupType === 'anilist' ? { anilistId: value } : { malId: value }, controller.signal);
      setSuggestedEdition(edition);
      setQuery(edition.title);
      setKind('anime');
      setPage(1);
      setLookupMessage(`Matched "${edition.title}" (AniList #${edition.id}${edition.malId ? ` / MAL #${edition.malId}` : ''}). Pick its TMDB entry below and the edition is pre-filled.`);
    } catch (problem) { setLookupError(problem instanceof Error ? problem.message : 'That ID could not be resolved.'); }
    finally { setLookupBusy(false); }
  };

  useEffect(() => {
    if (selected) return;
    if (kind === 'mylist') { setBusy(false); setResults(null); return; }
    const controller = new AbortController();
    setBusy(true); setError('');
    const timer = window.setTimeout(() => {
      void searchTitles(query, kind, page, endpoint, controller.signal).then((value) => { if (!controller.signal.aborted) setResults(value); })
        .catch((problem: unknown) => { if (!controller.signal.aborted) { setResults(null); setError(problem instanceof Error ? problem.message : 'Search is unavailable.'); } })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, query ? 380 : 30);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, kind, page, endpoint, selected, attempt]);

  const changeEndpoint = (next: TmdbEndpoint) => { setEndpoint(next); saveEndpoint(next); setPage(1); };

  return <>
    <div className="catalog-panel-header"><div><span className="eyebrow">THE AETHOFLIX COLLECTION</span><h2 id="panel-heading">Find your next great story.</h2></div><span className="catalog-source-label"><Globe2 size={14} />Powered by TMDB</span></div>
    {!selected ? <>
      <form className="catalog-search" onSubmit={(event) => { event.preventDefault(); setAttempt((value) => value + 1); }}><Search size={20} /><input ref={searchInput} aria-label="Search movies, series, and anime" placeholder="Search movies, series, or anime..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} maxLength={160} autoComplete="off" />{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setPage(1); searchInput.current?.focus(); }}><X size={17} /></button>}<button type="submit" className="search-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={18} />}</button></form>
      <div className="id-lookup-block"><div className="id-lookup-form"><select className="catalog-select id-lookup-select" aria-label="ID type" value={lookupType} disabled={lookupBusy} onChange={(event) => setLookupType(event.target.value as 'anilist' | 'mal')}><option value="anilist">AniList ID</option><option value="mal">MAL ID</option></select><input className="cinema-input" type="number" min="1" max="999999999" inputMode="numeric" aria-label="Anime ID to resolve" placeholder={lookupType === 'anilist' ? 'AniList ID' : 'MAL ID'} value={lookupId} onChange={(event) => setLookupId(event.target.value)} disabled={lookupBusy} /><button className="secondary-button" onClick={() => void doLookup()} disabled={lookupBusy || !lookupId.trim()}>{lookupBusy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}Resolve</button></div><p className="catalog-helper">An optional shortcut for people who already have an ID. Search by title instead — no IDs needed, and the matched edition is pre-filled automatically.</p>{lookupError && <p className="form-error" role="alert">{lookupError}</p>}{lookupMessage && <p className="lookup-success" role="status">{lookupMessage}</p>}</div>
      <div className="catalog-toolbar"><div className="catalog-tabs" role="group" aria-label="Content category">{([{ key: 'all', label: 'All titles' }, { key: 'movie', label: 'Movies' }, { key: 'tv', label: 'Series' }, { key: 'anime', label: 'Anime' }, { key: 'mylist', label: `My list${myList.length ? ` (${myList.length})` : ''}` }] as const).map((item) => <button key={item.key} aria-pressed={kind === item.key} onClick={() => { setKind(item.key); setPage(1); }}>{item.label}</button>)}</div><span>{kind === 'mylist' ? 'SAVED TITLES' : query ? 'SEARCH RESULTS' : 'POPULAR RIGHT NOW'}</span></div>
      {kind === 'mylist' ? myList.length ? <div className="catalog-grid">{myList.map((title) => <div key={`${title.mediaType}-${title.id}`} className="catalog-result"><button className="catalog-result-open" onClick={() => setSelected(title)}><Poster title={title} /><span className="catalog-result-title">{title.title}</span><span className="catalog-result-meta"><span>{title.year || 'Year TBA'}<i />{title.anime ? 'Anime' : title.mediaType === 'movie' ? 'Movie' : 'Series'}</span>{title.rating > 0 && <span><Star size={11} />{title.rating.toFixed(1)}</span>}</span></button><button className={`list-toggle-button ${inList(title) ? 'is-saved' : ''}`} aria-label={inList(title) ? `Remove ${title.title} from your list` : `Save ${title.title} to your list`} onClick={() => toggleList(title)}><Star size={15} fill={inList(title) ? 'currentColor' : 'none'} /></button></div>)}</div> : <div className="catalog-empty"><Star size={30} /><h3>Your list is empty.</h3><p>Save titles from the collection with the star on any poster, and they will wait for you here — movies, series, and anime together.</p></div> : busy ? <div className="catalog-loading" role="status"><LoaderCircle className="spin" size={28} /><span>{query ? 'Finding your stories...' : 'Opening the collection...'}</span></div> : error ? <div className="catalog-error" role="alert"><Globe2 size={30} /><h3>Let us try another route.</h3><p>{error}</p><div><button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}><RotateCcw size={15} />Retry</button><button className="primary-button" onClick={() => changeEndpoint(endpoint === 'standard' ? 'alternate' : 'standard')}>Try {endpoint === 'standard' ? 'alternate' : 'standard'} endpoint<ArrowRight size={16} /></button></div></div> : results?.results.length ? <div className="catalog-grid">{results.results.map((title) => <div key={`${title.mediaType}-${title.id}`} className="catalog-result"><button className="catalog-result-open" onClick={() => setSelected(title)}><Poster title={title} /><span className="catalog-result-title">{title.title}</span><span className="catalog-result-meta"><span>{title.year || 'Year TBA'}<i />{title.anime ? 'Anime' : title.mediaType === 'movie' ? 'Movie' : 'Series'}</span>{title.rating > 0 && <span><Star size={11} />{title.rating.toFixed(1)}</span>}</span></button><button className={`list-toggle-button ${inList(title) ? 'is-saved' : ''}`} aria-label={inList(title) ? `Remove ${title.title} from your list` : `Save ${title.title} to your list`} onClick={() => toggleList(title)}><Star size={15} fill={inList(title) ? 'currentColor' : 'none'} /></button></div>)}</div> : <div className="catalog-empty"><Search size={30} /><h3>No stories found just yet.</h3><p>Try another title or category.{kind === 'anime' ? ' Anime results use TMDB Japanese-animation metadata.' : ''}</p></div>}
      {!busy && !error && results && results.totalPages > 1 && <div className="catalog-pagination"><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} />Previous</button><span>Page {page} of {results.totalPages}</span><button className="secondary-button" disabled={page >= results.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={16} /></button></div>}
    </> : <TitleView key={`${selected.mediaType}-${selected.id}`} title={selected} endpoint={endpoint} snapshot={snapshot} engine={engine} party={party} canControl={canControl} suggestedEdition={suggestedEdition} inList={inList(selected)} onToggleList={() => toggleList(selected)} onBack={() => setSelected(null)} onSeats={onSeats} onFinish={onFinish} />}
    <details className="catalog-connection"><summary><Globe2 size={14} />Metadata connection<span>{endpoint === 'standard' ? 'Standard' : 'Alternate'}</span></summary><div><label className="field-label" htmlFor="tmdb-endpoint">TMDB API ENDPOINT</label><select id="tmdb-endpoint" className="catalog-select" value={endpoint} onChange={(event) => changeEndpoint(event.target.value as TmdbEndpoint)}><option value="standard">Standard: {TMDB_BASE}</option><option value="alternate">Alternate: {BYPASS_BASE}</option></select><p>Use the alternate hostname if your network blocks the standard endpoint. ISP access and alternate-host availability are not guaranteed. This setting only affects metadata search; it never changes your playback server.</p></div></details>
    <TmdbAttribution />
  </>;
}

function TitleView({ title, endpoint, snapshot, engine, party, canControl, suggestedEdition, inList, onToggleList, onBack, onSeats, onFinish }: { title: CatalogTitle; endpoint: TmdbEndpoint; canControl: boolean; suggestedEdition: AnimeEdition | null; inList: boolean; onToggleList: () => void; onBack: () => void } & Omit<Props, 'onFinish'> & { onFinish: () => void }) {
  const existing = snapshot.embed?.catalog.id === title.id && snapshot.embed.catalog.mediaType === title.mediaType ? snapshot.embed : null;
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [season, setSeason] = useState(existing?.selection.season ?? 1);
  const [episode, setEpisode] = useState(existing?.selection.episode ?? 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [error, setError] = useState('');
  const [episodeError, setEpisodeError] = useState('');
  const [busy, setBusy] = useState(true);
  const [episodesBusy, setEpisodesBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const activeHere = snapshot.embed?.catalog.id === title.id && snapshot.embed.catalog.mediaType === title.mediaType;

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError('');
    void getTitleDetails(title, endpoint, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setDetails(value);
      if (value.mediaType === 'tv' && !value.seasons.some((item) => item.number === season)) { setSeason(value.seasons.find((item) => item.number > 0)?.number ?? value.seasons[0]?.number ?? 1); setEpisode(1); }
    }).catch((problem: unknown) => { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Title details could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [title, endpoint, attempt]);

  useEffect(() => {
    if (title.mediaType !== 'tv' || !details) return;
    const controller = new AbortController();
    setEpisodesBusy(true); setEpisodeError(''); setEpisodes([]);
    void getEpisodes(title.id, season, endpoint, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setEpisodes(value);
      if (!value.some((item) => item.number === episode)) setEpisode(value[0]?.number ?? 1);
    }).catch((problem: unknown) => { if (!controller.signal.aborted) setEpisodeError(problem instanceof Error ? problem.message : 'Episodes could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setEpisodesBusy(false); });
    return () => controller.abort();
  }, [title.id, title.mediaType, details, season, endpoint, attempt]);

  return <div className="catalog-title-view">
    <button className="text-button catalog-back" onClick={onBack}><ArrowLeft size={16} />Back to the collection</button>
      <div className="catalog-title-layout"><div className="catalog-title-description"><Poster title={title} className="detail-poster" /><div><span className="eyebrow">{title.anime ? 'ANIME' : title.mediaType === 'movie' ? 'MOVIE' : 'SERIES'} / {title.year || 'COMING SOON'}</span><h3>{title.title}</h3><div className="detail-metadata">{title.rating > 0 && <span><Star size={14} />{title.rating.toFixed(1)} on TMDB</span>}{details?.runtime && <span>{details.runtime} min</span>}</div>{details?.genres.length ? <p className="detail-genres">{details.genres.join(' / ')}</p> : null}<p className="detail-overview">{details?.overview || title.overview || 'A synopsis is not available for this title yet.'}</p><div className="catalog-detail-links"><a className="tmdb-title-link" href={`https://www.themoviedb.org/${title.mediaType}/${title.id}`} target="_blank" rel="noopener noreferrer">View on TMDB<ExternalLink size={13} /></a><button className={`text-button catalog-list-toggle ${inList ? 'is-saved' : ''}`} onClick={onToggleList}>{inList ? <Check size={15} /> : <Star size={15} />}{inList ? 'In your list' : 'Save to my list'}</button></div></div></div>
      <div className="catalog-title-player">
        {busy && <p className="catalog-inline-loading"><LoaderCircle className="spin" size={17} />Loading title details...</p>}
        {error && <div className="form-error" role="alert">{error}<button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Retry details<RotateCcw size={14} /></button></div>}
        {title.mediaType === 'tv' && <div className="episode-selectors"><label><span className="field-label">SEASON</span><select className="catalog-select" disabled={!details || busy} value={season} onChange={(event) => { setSeason(Number(event.target.value)); setEpisode(1); }}>{details?.seasons.length ? details.seasons.map((item) => <option key={item.number} value={item.number}>{item.name}</option>) : <option value={season}>Season {season}</option>}</select></label><label><span className="field-label">EPISODE</span><select className="catalog-select" disabled={episodesBusy || !episodes.length} value={episode} onChange={(event) => setEpisode(Number(event.target.value))}>{episodes.length ? episodes.map((item) => <option key={item.number} value={item.number}>{item.number}. {item.name}</option>) : <option value={episode}>{episodesBusy ? 'Loading episodes...' : `Episode ${episode}`}</option>}</select></label></div>}
        {episodeError && <p className="form-error" role="alert">{episodeError}<button className="text-button" onClick={() => setAttempt((value) => value + 1)}>Retry episodes<RotateCcw size={14} /></button></p>}
        {!canControl && <p className="catalog-helper">Your host chooses the shared title and server. You can browse the collection without changing the screening.</p>}
        <ServerPicker title={details ?? title} season={season} episode={episode} active={snapshot.embed} suggestedEdition={suggestedEdition} disabled={!canControl || snapshot.loading || episodesBusy || (title.mediaType === 'tv' && (!details || !episodes.length))} onLoad={party.loadMedia} />
        {activeHere && <div className="catalog-current-player"><span className="catalog-section-label"><Check size={14} />CURRENT SCREEN SELECTION</span><ProviderPlayer engine={engine} snapshot={snapshot} /><div className="catalog-watch-actions"><button className="primary-button" onClick={onFinish}>Watch in the cinema<ArrowRight size={15} /></button><button className="text-button" onClick={onSeats}>Choose a seat<ChevronRight size={15} /></button></div></div>}
      </div>
    </div>
  </div>;
}