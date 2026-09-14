import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Boxes, ChevronLeft, ChevronRight, Film, Home, Info, LoaderCircle, Play, Search, Sparkles, Star, Trash2, Tv, Volume2, VolumeX, X } from 'lucide-react';
import { backdropUrl, logoUrl, posterUrl, readEndpoint, saveEndpoint, type TmdbEndpoint } from '../catalog/config';
import { getAnimeByGenre, getTitleById, getTitleDetails, getTitlesByGenre, MOVIE_GENRES, searchTitles, TV_GENRES, type GenreDefinition } from '../catalog/tmdb';
import type { CatalogKind, CatalogTitle, TitleDetails } from '../catalog/types';
import PlayerView from './PlayerView';
import WatchChooser from './WatchChooser';
import SiteAds from '../components/SiteAds';
import { fetchBroadcast, trackPageView } from '../analytics/client';
import { applyDocumentMode, readAppMode, writeAppMode, type AppMode } from '../performance/mode';

export type TheatreIntent = 'party' | 'play' | 'ownVideo' | 'ownLink';
type Props = { onEnterTheatre: (title?: CatalogTitle, intent?: TheatreIntent) => void };
type Page = 'home' | 'movie' | 'tv' | 'anime' | 'search';
type Rail = { items: CatalogTitle[]; busy: boolean; error: string };
type Playing = { title: CatalogTitle; season: number; episode: number; serverIndex?: number; fromBot?: boolean };
type Recent = CatalogTitle & { season: number; episode: number; savedAt: number };

type RailSpec = { key: string; title: string } & (
  | { source: 'trending'; kind: CatalogKind }
  | { source: 'genre'; genre: GenreDefinition }
  | { source: 'animeGenre'; genreId: number }
);

const ANIME_SUBGENRES = [
  { id: 10759, name: 'Action Anime' }, { id: 35, name: 'Comedy Anime' }, { id: 18, name: 'Drama Anime' },
  { id: 10765, name: 'Fantasy & Sci-Fi Anime' }, { id: 9648, name: 'Mystery Anime' }, { id: 10751, name: 'Family Anime' },
];

const HOME_RAILS: RailSpec[] = [
  { key: 'trend-movie', title: 'Trending Movies', source: 'trending', kind: 'movie' },
  { key: 'trend-tv', title: 'Trending Series', source: 'trending', kind: 'tv' },
  { key: 'trend-anime', title: 'Anime Spotlight', source: 'trending', kind: 'anime' },
  ...MOVIE_GENRES.map((genre) => ({ key: `movie-${genre.id}`, title: `${genre.name} Movies`, source: 'genre' as const, genre })),
  ...TV_GENRES.map((genre) => ({ key: `tv-${genre.id}`, title: genre.name, source: 'genre' as const, genre })),
  ...ANIME_SUBGENRES.map((sub) => ({ key: `anime-${sub.id}`, title: sub.name, source: 'animeGenre' as const, genreId: sub.id })),
];

const PAGE_META: Record<Exclude<Page, 'home' | 'search'>, { title: string; sub: string }> = {
  movie: { title: 'Movies', sub: 'Every genre, every mood. Trending and deep cuts side by side.' },
  tv: { title: 'Web Series & TV Shows', sub: 'Episodic stories worth clearing your evening for.' },
  anime: { title: 'Anime', sub: 'Japanese animation, matched automatically to its servers.' },
};

const RECENT_KEY = 'aethoflix-continue-v1';
const WATCHLIST_KEY = 'aethoflix-my-list-v1';
const RAIL_BATCH = 6;
const LITE_RAIL_BATCH = 3;

function readRecent(): Recent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Recent => {
      const entry = item as Partial<Recent>;
      return typeof entry?.id === 'number' && (entry.mediaType === 'movie' || entry.mediaType === 'tv') && typeof entry.title === 'string';
    }).slice(0, 12);
  } catch { return []; }
}
function writeRecent(list: Recent[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* optional */ } }
function readWatchlist(): CatalogTitle[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CatalogTitle => {
      const entry = item as Partial<CatalogTitle>;
      return typeof entry?.id === 'number' && (entry.mediaType === 'movie' || entry.mediaType === 'tv') && typeof entry.title === 'string';
    });
  } catch { return []; }
}
function writeWatchlist(list: CatalogTitle[]) { try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch { /* optional */ } }

function trailerSrc(key: string, muted: boolean) {
  return `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${key}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0`;
}

function PosterCard({ title, isSaved, onOpen, onPlay, onToggleSave }: { title: CatalogTitle; isSaved: boolean; onOpen: () => void; onPlay: () => void; onToggleSave: () => void }) {
  const src = posterUrl(title.posterPath);
  return (
    <div className="poster-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}>
      <div className="poster-media">
        {src ? <img src={src} alt={`${title.title} poster`} loading="lazy" decoding="async" /> : <span className="poster-fallback"><Film size={26} /></span>}
        <div className="card-badges">
          {title.anime && <span className="card-badge">ANIME</span>}
          {title.rating >= 8 && <span className="card-badge gold">TOP</span>}
        </div>
        <div className="poster-quick-actions">
          <button className={`action-mini-btn ${isSaved ? 'saved' : ''}`} aria-label={isSaved ? 'Remove from watchlist' : 'Save to watchlist'} onClick={(event) => { event.stopPropagation(); onToggleSave(); }}><Bookmark size={13} fill={isSaved ? 'currentColor' : 'none'} /></button>
          <button className="action-mini-btn" aria-label={`Play ${title.title}`} onClick={(event) => { event.stopPropagation(); onPlay(); }}><Play size={13} fill="currentColor" /></button>
        </div>
      </div>
      <div className="poster-details">
        <span className="poster-title">{title.title}</span>
        <span className="poster-meta"><span>{title.year || 'TBA'} · {title.mediaType === 'movie' ? 'Movie' : 'Series'}</span>{title.rating > 0 && <span><Star size={10} />{title.rating.toFixed(1)}</span>}</span>
      </div>
    </div>
  );
}

// A rail that only loads when scrolled near the viewport, so dozens of genres stay fast.
function LazyRail({ spec, endpoint, watchlistIds, lite, onOpen, onPlay, onToggleSave, onSwitchEndpoint }: {
  spec: RailSpec; endpoint: TmdbEndpoint; watchlistIds: Set<string>; lite?: boolean;
  onOpen: (title: CatalogTitle) => void; onPlay: (title: CatalogTitle) => void; onToggleSave: (title: CatalogTitle) => void; onSwitchEndpoint: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [rail, setRail] = useState<Rail>({ items: [], busy: true, error: '' });

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisible(true); }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setRail({ items: [], busy: true, error: '' });
    const request = spec.source === 'trending'
      ? searchTitles('', spec.kind, 1, endpoint, controller.signal).then((data) => data.results)
      : spec.source === 'genre'
        ? getTitlesByGenre(spec.genre.id, spec.genre.mediaType, endpoint, controller.signal)
        : getAnimeByGenre(spec.genreId, endpoint, controller.signal);
    request.then((items) => { if (!controller.signal.aborted) setRail({ items: items.slice(0, 20), busy: false, error: '' }); })
      .catch((problem: unknown) => { if (!controller.signal.aborted) setRail({ items: [], busy: false, error: problem instanceof Error ? problem.message : 'Unavailable' }); });
    return () => controller.abort();
  }, [visible, spec, endpoint]);

  if (visible && !rail.busy && !rail.error && rail.items.length === 0) return null;

  return (
    <section className="rail-section" ref={ref}>
      <div className="rail-header"><h2 className="rail-title">{spec.title}</h2></div>
      {!visible || rail.busy ? <div className="rail-track">{Array.from({ length: 8 }).map((_, index) => <span className="skeleton" key={index} />)}</div>
        : rail.error ? <div className="rail-empty">{rail.error}<button className="btn-glass" onClick={onSwitchEndpoint}>Switch endpoint</button></div>
              : <div className="rail-track">{rail.items.slice(0, lite ? 10 : 20).map((item) => (
          <PosterCard key={`${item.mediaType}-${item.id}`} title={item} isSaved={watchlistIds.has(`${item.mediaType}-${item.id}`)} onOpen={() => onOpen(item)} onPlay={() => onPlay(item)} onToggleSave={() => onToggleSave(item)} />
        ))}</div>}
    </section>
  );
}

export default function SiteView({ onEnterTheatre }: Props) {
  const deepLink = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const id = Number(params.get('id'));
    if (!['movie', 'tv', 'anime'].includes(type ?? '') || !Number.isInteger(id) || id <= 0 || id > 2147483647) return null;
    const safeNumber = (key: string, fallback: number, min: number, max: number) => {
      const value = Number(params.get(key));
      return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
    };
    return {
      mediaType: type === 'movie' ? 'movie' as const : 'tv' as const,
      id,
      season: type === 'movie' ? 1 : safeNumber('s', 1, 0, 10000),
      episode: type === 'movie' ? 1 : safeNumber('e', 1, 1, 100000),
      serverIndex: safeNumber('srv', type === 'anime' ? 0 : 2, 0, 7),
      bot: params.get('bot') === 'flix',
    };
  })()).current;
  const [intro, setIntro] = useState(() => {
    if (deepLink) return false;
    try { return sessionStorage.getItem('aethoflix-intro-seen') !== '1'; } catch { return true; }
  });
  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => {
      setIntro(false);
      try { sessionStorage.setItem('aethoflix-intro-seen', '1'); } catch { /* optional */ }
    }, 2600);
    return () => clearTimeout(timer);
  }, [intro]);

  const [endpoint, setEndpoint] = useState<TmdbEndpoint>(readEndpoint);
  const [page, setPage] = useState<Page>('home');
  const [homeGenre, setHomeGenre] = useState<string>('all');
  const [scrolled, setScrolled] = useState(false);
  const [hero, setHero] = useState<Rail>({ items: [], busy: true, error: '' });
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroDetails, setHeroDetails] = useState<Record<string, TitleDetails>>({});
  const [heroTrailerOn, setHeroTrailerOn] = useState(false);
  const [heroMuted, setHeroMuted] = useState(true);
  const [hoveringHero, setHoveringHero] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const heroTrailerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heroUI, setHeroUI] = useState(true);
  const heroUiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleRailCount, setVisibleRailCount] = useState(RAIL_BATCH);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [category, setCategory] = useState<Rail>({ items: [], busy: false, error: '' });
  const [categoryGenre, setCategoryGenre] = useState<number | 'trending'>('trending');
  const [query, setQuery] = useState('');
  const [searchKind, setSearchKind] = useState<CatalogKind>('all');
  const [results, setResults] = useState<CatalogTitle[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [modal, setModal] = useState<CatalogTitle | null>(null);
  const [modalDetails, setModalDetails] = useState<TitleDetails | null>(null);
  const [trailerActive, setTrailerActive] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [chooser, setChooser] = useState<CatalogTitle | null>(null);

  const [playing, setPlaying] = useState<Playing | null>(null);
  const [deepLinkBusy, setDeepLinkBusy] = useState(!!deepLink);
  const [deepLinkError, setDeepLinkError] = useState('');
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const [watchlist, setWatchlist] = useState<CatalogTitle[]>(readWatchlist);
  const [toast, setToast] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [appMode, setAppMode] = useState<AppMode>(() => readAppMode());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    applyDocumentMode(appMode);
    writeAppMode(appMode);
  }, [appMode]);

  useEffect(() => {
    trackPageView();
    void fetchBroadcast().then((data) => { if (data.message) setBroadcast(data.message); });
    const timer = window.setInterval(() => {
      void fetchBroadcast().then((data) => setBroadcast(data.message || ''));
    }, appMode === 'lite' ? 45000 : 20000);
    return () => clearInterval(timer);
  }, [appMode]);

  useEffect(() => {
    if (!deepLink) return;
    const controller = new AbortController();
    setDeepLinkBusy(true);
    setDeepLinkError('');
    const resolve = async () => {
      try {
        return await getTitleById(deepLink.id, deepLink.mediaType, endpoint, controller.signal);
      } catch (firstError) {
        if (controller.signal.aborted) throw firstError;
        const otherEndpoint: TmdbEndpoint = endpoint === 'alternate' ? 'standard' : 'alternate';
        const title = await getTitleById(deepLink.id, deepLink.mediaType, otherEndpoint, controller.signal);
        setEndpoint(otherEndpoint);
        saveEndpoint(otherEndpoint);
        return title;
      }
    };
    resolve().then((title) => {
      if (controller.signal.aborted) return;
      setPlaying({ title, season: deepLink.season, episode: deepLink.episode, serverIndex: deepLink.serverIndex, fromBot: deepLink.bot });
      document.title = `${title.title} | AethoFlix`;
    }).catch((problem: unknown) => {
      if (!controller.signal.aborted) setDeepLinkError(problem instanceof Error ? problem.message : 'This shared title could not be opened.');
    }).finally(() => { if (!controller.signal.aborted) setDeepLinkBusy(false); });
    return () => controller.abort();
  }, [deepLink, endpoint]);

  const watchlistIds = useMemo(() => new Set(watchlist.map((item) => `${item.mediaType}-${item.id}`)), [watchlist]);
  const isSaved = useCallback((title: CatalogTitle) => watchlistIds.has(`${title.mediaType}-${title.id}`), [watchlistIds]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); if (heroTrailerTimer.current) clearTimeout(heroTrailerTimer.current); if (heroUiTimer.current) clearTimeout(heroUiTimer.current); }, []);

  const toggleBookmark = useCallback((title: CatalogTitle) => {
    setWatchlist((current) => {
      const exists = current.some((item) => item.id === title.id && item.mediaType === title.mediaType);
      const next = exists ? current.filter((item) => !(item.id === title.id && item.mediaType === title.mediaType)) : [title, ...current];
      writeWatchlist(next);
      showToast(exists ? `Removed "${title.title}" from your list` : `Saved "${title.title}" to your list`);
      return next;
    });
  }, [showToast]);

  const switchEndpoint = useCallback(() => {
    setEndpoint((current) => {
      const next: TmdbEndpoint = current === 'standard' ? 'alternate' : 'standard';
      saveEndpoint(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hero data + details (logo + trailer) for each slide.
  useEffect(() => {
    const controller = new AbortController();
    setHero({ items: [], busy: true, error: '' });
    searchTitles('', 'all', 1, endpoint, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const items = data.results.filter((item) => item.backdropPath).slice(0, appMode === 'lite' ? 4 : 7);
      setHero({ items, busy: false, error: '' });
      items.slice(0, appMode === 'lite' ? 1 : items.length).forEach((item) => {
        getTitleDetails(item, endpoint, controller.signal).then((details) => {
          if (!controller.signal.aborted) setHeroDetails((current) => ({ ...current, [`${item.mediaType}-${item.id}`]: details }));
        }).catch(() => { /* optional */ });
      });
    }).catch((problem: unknown) => {
      if (!controller.signal.aborted) setHero({ items: [], busy: false, error: problem instanceof Error ? problem.message : 'TMDB is unavailable.' });
    });
    return () => controller.abort();
  }, [endpoint, appMode]);

  const featured = hero.items[heroIndex] ?? null;
  const featuredDetails = featured ? heroDetails[`${featured.mediaType}-${featured.id}`] : undefined;

  // Netflix behaviour: rest on a slide for a while and its trailer starts playing behind the art.
  useEffect(() => {
    setHeroTrailerOn(false);
    if (heroTrailerTimer.current) clearTimeout(heroTrailerTimer.current);
    if (!featuredDetails?.trailerKey || page !== 'home' || appMode === 'lite') return;
    heroTrailerTimer.current = setTimeout(() => setHeroTrailerOn(true), 3200);
    return () => { if (heroTrailerTimer.current) clearTimeout(heroTrailerTimer.current); };
  }, [heroIndex, featuredDetails?.trailerKey, page, appMode]);

  const nextSlide = useCallback(() => { if (hero.items.length > 1) setHeroIndex((index) => (index + 1) % hero.items.length); }, [hero.items.length]);
  const prevSlide = useCallback(() => { if (hero.items.length > 1) setHeroIndex((index) => (index - 1 + hero.items.length) % hero.items.length); }, [hero.items.length]);

  useEffect(() => {
    if (hero.items.length < 2 || hoveringHero || heroTrailerOn) return;
    const timer = window.setInterval(nextSlide, 7000);
    return () => clearInterval(timer);
  }, [hero.items.length, hoveringHero, heroTrailerOn, nextSlide]);

  // A trailer plays for a while, then the carousel glides on.
  useEffect(() => {
    if (!heroTrailerOn) return;
    const timer = window.setTimeout(nextSlide, 26000);
    return () => clearTimeout(timer);
  }, [heroTrailerOn, nextSlide]);

  // While the hero trailer plays, the action buttons step away so the trailer
  // reads cleanly. Touching the screen brings them back for a few seconds.
  const revealHeroUI = useCallback(() => {
    setHeroUI(true);
    if (heroUiTimer.current) clearTimeout(heroUiTimer.current);
    heroUiTimer.current = setTimeout(() => setHeroUI(false), 4000);
  }, []);
  useEffect(() => {
    if (!heroTrailerOn) { setHeroUI(true); return; }
    setHeroUI(false);
  }, [heroTrailerOn]);

  const onTouchStart = (event: React.TouchEvent) => { touchStartX.current = event.touches[0].clientX; touchDeltaX.current = 0; };
  const onTouchMove = (event: React.TouchEvent) => { if (touchStartX.current !== null) touchDeltaX.current = event.touches[0].clientX - touchStartX.current; };
  const onTouchEnd = () => {
    if (touchStartX.current === null) return;
    if (touchDeltaX.current < -45) nextSlide(); else if (touchDeltaX.current > 45) prevSlide();
    touchStartX.current = null; touchDeltaX.current = 0;
  };

  // Infinite genre rows: reveal more as you scroll.
  const homeRails = useMemo(() => {
    if (homeGenre === 'all') return HOME_RAILS;
    if (homeGenre === 'movies') return HOME_RAILS.filter((rail) => rail.key.startsWith('movie-') || rail.key === 'trend-movie');
    if (homeGenre === 'series') return HOME_RAILS.filter((rail) => rail.key.startsWith('tv-') || rail.key === 'trend-tv');
    if (homeGenre === 'anime') return HOME_RAILS.filter((rail) => rail.key.startsWith('anime-') || rail.key === 'trend-anime');
    return HOME_RAILS.filter((rail) => rail.title.toLowerCase().includes(homeGenre));
  }, [homeGenre]);

  useEffect(() => { setVisibleRailCount(appMode === 'lite' ? LITE_RAIL_BATCH : RAIL_BATCH); }, [homeGenre, appMode]);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const batch = appMode === 'lite' ? LITE_RAIL_BATCH : RAIL_BATCH;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleRailCount((count) => Math.min(homeRails.length, count + batch));
    }, { rootMargin: appMode === 'lite' ? '400px 0px' : '900px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [homeRails.length, page, appMode]);

  // Category pages with a full genre bar.
  const categoryGenres = page === 'movie' ? MOVIE_GENRES : page === 'tv' ? TV_GENRES : [];
  useEffect(() => { setCategoryGenre('trending'); }, [page]);
  useEffect(() => {
    if (page === 'home' || page === 'search') return;
    const controller = new AbortController();
    setCategory({ items: [], busy: true, error: '' });
    const request = categoryGenre === 'trending'
      ? searchTitles('', page, 1, endpoint, controller.signal).then((data) => data.results)
      : page === 'anime'
        ? getAnimeByGenre(categoryGenre, endpoint, controller.signal)
        : Promise.all([1, 2].map((p) => getTitlesByGenre(categoryGenre, page, endpoint, controller.signal, p))).then((pages) => pages.flat());
    request.then((items) => { if (!controller.signal.aborted) setCategory({ items, busy: false, error: '' }); })
      .catch((problem: unknown) => { if (!controller.signal.aborted) setCategory({ items: [], busy: false, error: problem instanceof Error ? problem.message : 'Unavailable' }); });
    return () => controller.abort();
  }, [page, endpoint, categoryGenre]);

  useEffect(() => {
    if (page !== 'search' || !query.trim()) { setResults([]); setSearched(false); setSearchError(''); return; }
    const controller = new AbortController();
    setSearchBusy(true); setSearchError('');
    const timer = window.setTimeout(() => {
      searchTitles(query, searchKind, 1, endpoint, controller.signal).then((data) => {
        if (!controller.signal.aborted) { setResults(data.results); setSearched(true); }
      }).catch((problem: unknown) => {
        if (!controller.signal.aborted) { setResults([]); setSearched(true); setSearchError(problem instanceof Error ? problem.message : 'Search failed.'); }
      }).finally(() => { if (!controller.signal.aborted) setSearchBusy(false); });
    }, 380);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchKind, endpoint, page]);

  // Detail sheet: logo + trailer that starts on its own after a beat.
  useEffect(() => {
    if (!modal) { setModalDetails(null); setTrailerActive(false); return; }
    const controller = new AbortController();
    setTrailerActive(false);
    setModalDetails(null);
    let timer: ReturnType<typeof setTimeout> | null = null;
    getTitleDetails(modal, endpoint, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setModalDetails(value);
      if (value.trailerKey && appMode !== 'lite') timer = setTimeout(() => setTrailerActive(true), 1400);
    }).catch(() => { /* optional */ });
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [modal, endpoint, appMode]);

  const play = useCallback((title: CatalogTitle, season = 1, episode = 1) => {
    setModal(null); setChooser(null);
    setPlaying({ title, season, episode });
    window.scrollTo({ top: 0 });
    setRecent((current) => {
      const next = [{ ...title, season, episode, savedAt: Date.now() }, ...current.filter((item) => !(item.id === title.id && item.mediaType === title.mediaType))];
      writeRecent(next);
      return next;
    });
  }, []);

  const removeRecent = (item: Recent) => {
    setRecent((current) => { const next = current.filter((entry) => !(entry.id === item.id && entry.mediaType === item.mediaType)); writeRecent(next); return next; });
  };
  const openSearch = () => { setPage('search'); window.setTimeout(() => searchInput.current?.focus(), 60); };
  const openChooser = (title: CatalogTitle) => { setModal(null); setChooser(title); };
  const download = (title: CatalogTitle) => {
    setChooser(null);
    if (title.anime) { play(title); showToast('Opening the player — use Download there once the anime is matched.'); return; }
    window.open(title.mediaType === 'movie' ? `https://nxsha.space/dl/movie/${title.id}` : `https://nxsha.space/dl/tv/${title.id}/1/1`, '_blank', 'noopener,noreferrer');
    showToast('Opening the Nxsha download hub.');
  };

  if (playing) {
    return (
      <div className="site-app">
        <PlayerView title={playing.title} endpoint={endpoint} season={playing.season} episode={playing.episode}
          onSeasonEpisode={(season, episode) => setPlaying({ ...playing, season, episode })}
          onBack={() => {
            setPlaying(null);
            document.title = 'AethoFlix — Movies, Web Series, TV Shows & Anime Discovery';
            if (playing.fromBot) window.history.replaceState(null, '', window.location.pathname);
          }}
          onOpen3D={() => onEnterTheatre(playing.title, 'play')}
          onToast={showToast}
          initialServerIndex={playing.serverIndex}
        />
        {toast && <div className="toast-hud show">{toast}</div>}
      </div>
    );
  }

  if (deepLinkBusy) return <div className="site-app bot-link-loader"><LoaderCircle className="spin" size={32} /><strong>Opening your AethoFlix link…</strong><span>Loading the requested title, episode and server.</span></div>;
  if (deepLinkError) return <div className="site-app bot-link-loader"><Film size={32} /><strong>This shared link could not be opened.</strong><span>{deepLinkError}</span><button className="btn-primary" onClick={() => window.location.assign(window.location.pathname)}>Open AethoFlix home</button></div>;

  const navItems: { key: Page; label: string; icon: typeof Home }[] = [
    { key: 'home', label: 'Home', icon: Home }, { key: 'movie', label: 'Movies', icon: Film }, { key: 'tv', label: 'Series', icon: Tv }, { key: 'anime', label: 'Anime', icon: Sparkles },
  ];
  const homeGenrePills = [
    { id: 'all', label: 'All' }, { id: 'movies', label: 'Movies' }, { id: 'series', label: 'Series' }, { id: 'anime', label: 'Anime' },
    ...MOVIE_GENRES.map((genre) => ({ id: genre.name.toLowerCase(), label: genre.name })),
  ];
  const featuredLogo = logoUrl(featuredDetails?.logoPath);
  const modalLogo = logoUrl(modalDetails?.logoPath);

  return (
    <div className="site-app">
      {intro && (
        <div className="intro-overlay" onClick={() => { setIntro(false); try { sessionStorage.setItem('aethoflix-intro-seen', '1'); } catch { /* optional */ } }}>
          <div className="intro-glow" />
          <div className="intro-mark">
            <svg viewBox="0 0 36 40" className="intro-logo"><path d="M18.1 3 2 34.5h7.8L22 10.5 18.1 3Z" /><path d="m24.5 15.7-4.1 8 5.6 10.8H34l-9.5-18.8Z" /><path d="m17.1 27.2 6.1 3.5-6.1 3.5v-7Z" /></svg>
          </div>
          <div className="intro-word">AETHOFLIX</div>
          <div className="intro-tag">SEARCH LESS · DISCOVER MORE</div>
        </div>
      )}
      <div className="ambient-canvas" aria-hidden="true"><div className="ambient-glow-top" /><div className="grid-mesh" /></div>
      {broadcast && <div className="site-broadcast" role="status"><span>{broadcast}</span><button aria-label="Dismiss announcement" onClick={() => setBroadcast('')}><X size={14} /></button></div>}

      <header className={`nav-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <button className="brand" onClick={() => setPage('home')} aria-label="AethoFlix home">
            <span className="brand-logo-wrap"><svg className="brand-svg" viewBox="0 0 36 40"><path d="M18.1 3 2 34.5h7.8L22 10.5 18.1 3Z" /><path d="m24.5 15.7-4.1 8 5.6 10.8H34l-9.5-18.8Z" /><path d="m17.1 27.2 6.1 3.5-6.1 3.5v-7Z" /></svg></span>
            <span className="brand-title">AethoFlix<span className="brand-badge">BETA</span></span>
          </button>
          <nav className="nav-links-capsule">
            {navItems.map((item) => <button key={item.key} className={`nav-link ${page === item.key ? 'active' : ''}`} onClick={() => setPage(item.key)}>{item.label}</button>)}
          </nav>
          <div className="nav-actions">
            <button
              className={`mode-pill-btn ${appMode === 'lite' ? 'is-lite' : 'is-performance'}`}
              onClick={() => setAppMode((mode) => mode === 'lite' ? 'performance' : 'lite')}
              title={appMode === 'lite' ? 'Switch to Performance mode' : 'Switch to Lite mode for low-end devices'}
            >
              {appMode === 'lite' ? 'Lite' : 'Performance'}
            </button>
            <button className="search-pill-btn" onClick={openSearch}><Search size={16} /><span>Search</span><span className="kbd-hint">/</span></button>
          </div>
        </div>
      </header>

      {page === 'home' && (hero.busy ? (
        <section className="hero-showcase"><div className="hero-content"><div className="search-status"><LoaderCircle className="spin" size={24} /><span>Opening the collection…</span></div></div></section>
      ) : hero.error ? (
        <section className="hero-showcase"><div className="hero-content"><h1 className="hero-title">Welcome to AethoFlix</h1><p className="hero-overview">{hero.error}</p><div className="hero-actions-dock"><button className="btn-glass" onClick={switchEndpoint}>Try {endpoint === 'standard' ? 'alternate' : 'standard'} endpoint</button></div></div></section>
      ) : featured ? (
        <section className={`hero-showcase ${heroTrailerOn ? 'trailer-on' : ''} ${heroTrailerOn && !heroUI ? 'trailer-clean' : ''}`}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          onPointerDown={() => { if (heroTrailerOn) revealHeroUI(); }}
          onMouseEnter={() => setHoveringHero(true)} onMouseLeave={() => setHoveringHero(false)}>
          <button className="hero-arrow-btn hero-arrow-left" onClick={prevSlide} aria-label="Previous"><ChevronLeft size={22} /></button>
          <button className="hero-arrow-btn hero-arrow-right" onClick={nextSlide} aria-label="Next"><ChevronRight size={22} /></button>
          <div className="hero-backdrop-container">
            <div className="hero-slide-track" style={{ transform: `translateX(-${heroIndex * 100}%)` }}>
              {hero.items.map((item) => (
                <div className="hero-slide-pane" key={`${item.mediaType}-${item.id}`}>
                  <img className="hero-backdrop-img active" src={backdropUrl(item.backdropPath)} alt="" aria-hidden="true" loading="eager" />
                </div>
              ))}
            </div>
            {heroTrailerOn && featuredDetails?.trailerKey && (
              <div className="hero-trailer-layer" key={featuredDetails.trailerKey}>
                <iframe src={trailerSrc(featuredDetails.trailerKey, heroMuted)} title={`${featured.title} trailer`} allow="autoplay; encrypted-media" />
              </div>
            )}
            <div className="hero-vignette" />
          </div>
          <div className="hero-content">
            <div className="hero-badges-row">
              <span className="hero-badge featured">FEATURED</span>
              <span className="hero-badge">{featured.anime ? 'ANIME' : featured.mediaType === 'movie' ? 'MOVIE' : 'SERIES'}</span>
              {featured.rating > 0 && <span className="hero-badge rating"><Star size={11} />{featured.rating.toFixed(1)}</span>}
            </div>
            {featuredLogo ? <img className="hero-logo" src={featuredLogo} alt={featured.title} /> : <h1 className="hero-title">{featured.title}</h1>}
            <p className="hero-meta"><span>{featured.year || 'Coming soon'}</span><span className="hero-meta-dot" /><span>{featuredDetails?.genres.slice(0, 3).join(' · ') || 'TMDB Discovery'}</span></p>
            <p className={`hero-overview ${heroTrailerOn ? 'faded' : ''}`}>{featured.overview || 'A synopsis is not available for this title yet.'}</p>
            <div className="hero-actions-dock">
              <button className="btn-primary" onClick={() => openChooser(featured)}><Play size={16} fill="currentColor" />Watch</button>
              <button className="btn-glass" onClick={() => toggleBookmark(featured)}><Bookmark size={15} fill={isSaved(featured) ? 'currentColor' : 'none'} />{isSaved(featured) ? 'Saved' : 'My List'}</button>
              <button className="btn-icon-glass" aria-label="More info" onClick={() => setModal(featured)}><Info size={18} /></button>
              {heroTrailerOn && <button className="btn-icon-glass" aria-label={heroMuted ? 'Unmute trailer' : 'Mute trailer'} onClick={() => setHeroMuted((m) => !m)}>{heroMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>}
            </div>
          </div>
          <div className="hero-pagination">
            {hero.items.map((item, index) => <button key={`${item.mediaType}-${item.id}`} className={`hero-dot ${index === heroIndex ? 'active' : ''}`} aria-label={`Show ${item.title}`} onClick={() => setHeroIndex(index)} />)}
          </div>
        </section>
      ) : null)}

      {page === 'home' && (
        <div className="genre-filter-bar">
          {homeGenrePills.map((pill) => <button key={pill.id} className={`genre-pill ${homeGenre === pill.id ? 'active' : ''}`} onClick={() => setHomeGenre(pill.id)}>{pill.label}</button>)}
        </div>
      )}

      {(page === 'movie' || page === 'tv' || page === 'anime') && (
        <>
          <div className="category-header-banner">
            <h1 className="category-header-title">{PAGE_META[page].title}</h1>
            <p className="category-header-sub">{PAGE_META[page].sub}</p>
          </div>
          <div className="genre-filter-bar">
            <button className={`genre-pill ${categoryGenre === 'trending' ? 'active' : ''}`} onClick={() => setCategoryGenre('trending')}>Trending</button>
            {(page === 'anime' ? ANIME_SUBGENRES.map((sub) => ({ id: sub.id, name: sub.name.replace(' Anime', '') })) : categoryGenres).map((genre) => (
              <button key={genre.id} className={`genre-pill ${categoryGenre === genre.id ? 'active' : ''}`} onClick={() => setCategoryGenre(genre.id)}>{genre.name}</button>
            ))}
          </div>
        </>
      )}

      {page === 'search' ? (
        <div className="search-studio-container">
          <div className="search-hero-box">
            <div className="search-input-wrap">
              <span className="search-input-icon"><Search size={20} /></span>
              <input ref={searchInput} className="search-main-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, series, or anime…" aria-label="Search" />
              {query && <button className="search-clear-btn show" aria-label="Clear search" onClick={() => setQuery('')}><X size={18} /></button>}
            </div>
            <div className="search-filters-row">
              {([{ key: 'all', label: 'All' }, { key: 'movie', label: 'Movies' }, { key: 'tv', label: 'Series' }, { key: 'anime', label: 'Anime' }] as const).map((item) => (
                <button key={item.key} className={`filter-tab-pill ${searchKind === item.key ? 'active' : ''}`} onClick={() => setSearchKind(item.key)}>{item.label}</button>
              ))}
            </div>
          </div>
          {searchBusy ? <div className="search-status"><LoaderCircle className="spin" size={22} /><span>Finding your stories…</span></div>
            : searchError ? <div className="search-status"><span className="err">{searchError}</span><button className="btn-glass" onClick={switchEndpoint}>Try other endpoint</button></div>
            : searched && !results.length ? <div className="search-status"><span>No titles matched “{query}”.</span></div>
            : results.length ? <div className="search-results-grid">{results.map((item) => <PosterCard key={`${item.mediaType}-${item.id}`} title={item} isSaved={isSaved(item)} onOpen={() => setModal(item)} onPlay={() => openChooser(item)} onToggleSave={() => toggleBookmark(item)} />)}</div>
            : <div className="search-status"><span>Start typing to search the TMDB collection.</span></div>}
        </div>
      ) : (
        <main className="rails-container">
          {page === 'home' && recent.length > 0 && (
            <section className="rail-section">
              <div className="rail-header"><h2 className="rail-title">Continue Watching</h2></div>
              <div className="rail-track">
                {recent.map((item) => (
                  <div className="cw-card" key={`${item.mediaType}-${item.id}`} role="button" tabIndex={0} onClick={() => play(item, item.season, item.episode)} onKeyDown={(event) => { if (event.key === 'Enter') play(item, item.season, item.episode); }}>
                    <div className="cw-media">
                      {backdropUrl(item.backdropPath) ? <img src={backdropUrl(item.backdropPath)} alt="" loading="lazy" /> : <span className="poster-fallback"><Film size={24} /></span>}
                      <button className="cw-delete-btn" aria-label={`Remove ${item.title}`} onClick={(event) => { event.stopPropagation(); removeRecent(item); }}><Trash2 size={13} /></button>
                      <div className="cw-progress-bar"><div className="cw-progress-fill" style={{ width: '45%' }} /></div>
                    </div>
                    <div className="poster-details"><span className="poster-title">{item.title}</span><span className="poster-meta"><span>{item.mediaType === 'tv' ? `S${item.season} · E${item.episode}` : 'Movie'}</span></span></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {page === 'home' && watchlist.length > 0 && (homeGenre === 'all') && (
            <section className="rail-section">
              <div className="rail-header"><h2 className="rail-title">My List ({watchlist.length})</h2></div>
              <div className="rail-track">
                {watchlist.map((item) => <PosterCard key={`saved-${item.mediaType}-${item.id}`} title={item} isSaved onOpen={() => setModal(item)} onPlay={() => openChooser(item)} onToggleSave={() => toggleBookmark(item)} />)}
              </div>
            </section>
          )}

          {page === 'home' ? (
            <>
              {homeRails.slice(0, visibleRailCount).map((spec) => (
                <LazyRail key={spec.key} spec={spec} endpoint={endpoint} watchlistIds={watchlistIds} lite={appMode === 'lite'} onOpen={setModal} onPlay={openChooser} onToggleSave={toggleBookmark} onSwitchEndpoint={switchEndpoint} />
              ))}
              {visibleRailCount < homeRails.length && <div ref={loadMoreRef} className="rail-loadmore"><LoaderCircle className="spin" size={20} /><span>More genres loading…</span></div>}
            </>
          ) : (
            <section className="rail-section">
              {category.busy ? <div className="search-results-grid">{Array.from({ length: 18 }).map((_, index) => <span className="skeleton" key={index} />)}</div>
                : category.error ? <div className="rail-empty">{category.error}<button className="btn-glass" onClick={switchEndpoint}>Switch endpoint</button></div>
                : <div className="search-results-grid">{category.items.map((item) => <PosterCard key={`${item.mediaType}-${item.id}`} title={item} isSaved={isSaved(item)} onOpen={() => setModal(item)} onPlay={() => openChooser(item)} onToggleSave={() => toggleBookmark(item)} />)}</div>}
            </section>
          )}

        </main>
      )}

      <button className="theatre-fab" onClick={() => onEnterTheatre(undefined, 'party')} title="Enter the 3D Theatre & Watch Party" aria-label="Enter the 3D Theatre">
        <Boxes size={20} />
        <span>3D Theatre</span>
      </button>

      <SiteAds />
      <footer className="site-foot">
        <span>AethoFlix — search less, discover more.</span>
        <span className="tmdb-note">This product uses the TMDB API but is not endorsed or certified by TMDB · <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">themoviedb.org</a></span>
      </footer>

      <nav className="mobile-dock">
        {navItems.map((item) => <button key={item.key} className={`dock-item ${page === item.key ? 'active' : ''}`} onClick={() => setPage(item.key)}><item.icon size={19} /><span>{item.label}</span></button>)}
        <button className={`dock-item ${page === 'search' ? 'active' : ''}`} onClick={openSearch}><Search size={19} /><span>Search</span></button>
      </nav>

      {modal && (
        <div className="detail-modal-overlay open" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <div className="detail-modal-sheet" role="dialog" aria-modal="true" aria-label={modal.title}>
            <button className="detail-close-btn" onClick={() => setModal(null)} aria-label="Close details"><X size={18} /></button>
            <div className={`detail-banner-hero ${trailerActive && modalDetails?.trailerKey ? 'playing' : ''}`}>
              {backdropUrl(modal.backdropPath) ? <img className="detail-banner-img" src={backdropUrl(modal.backdropPath)} alt="" /> : null}
              {modalDetails?.trailerKey && trailerActive && (
                <div className="banner-trailer-wrap"><iframe src={trailerSrc(modalDetails.trailerKey, trailerMuted)} title={`${modal.title} trailer`} allow="autoplay; encrypted-media" /></div>
              )}
              <div className="detail-banner-gradient" />
              {modalDetails?.trailerKey && (
                <div className="banner-trailer-controls">
                  <button className="banner-btn" onClick={() => setTrailerActive((on) => !on)} title={trailerActive ? 'Show artwork' : 'Play trailer'}>{trailerActive ? <Film size={14} /> : <Play size={14} fill="currentColor" />}</button>
                  {trailerActive && <button className="banner-btn" onClick={() => setTrailerMuted((m) => !m)} title={trailerMuted ? 'Unmute' : 'Mute'}>{trailerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>}
                </div>
              )}
            </div>
            <div className="detail-body-content">
              <div className="detail-header-flex">
                <div className="detail-poster-floating">{posterUrl(modal.posterPath) ? <img src={posterUrl(modal.posterPath)} alt={`${modal.title} poster`} /> : <span className="poster-fallback"><Film size={24} /></span>}</div>
                <div className="detail-info-col">
                  {modalLogo ? <img className="detail-title-logo" src={modalLogo} alt={modal.title} /> : <h2 className="detail-title-large">{modal.title}</h2>}
                  <div className="detail-meta-row">
                    <span>{modal.year || 'TBA'}</span><span>{modal.anime ? 'Anime' : modal.mediaType === 'movie' ? 'Movie' : 'Series'}</span>
                    {modal.rating > 0 && <span><Star size={13} />{modal.rating.toFixed(1)}</span>}
                    {modalDetails?.runtime ? <span>{modalDetails.runtime} min</span> : null}
                  </div>
                  {modalDetails?.genres.length ? <p className="detail-genres">{modalDetails.genres.join(' · ')}</p> : null}
                </div>
              </div>
              <div className="detail-actions-row">
                <button className="btn-primary" onClick={() => openChooser(modal)}><Play size={16} fill="currentColor" />Watch</button>
                <button className="btn-glass" onClick={() => toggleBookmark(modal)}><Bookmark size={15} fill={isSaved(modal) ? 'currentColor' : 'none'} />{isSaved(modal) ? 'Saved' : 'My List'}</button>
              </div>
              <p className="detail-synopsis">{modalDetails?.overview || modal.overview || 'A synopsis is not available for this title yet.'}</p>
            </div>
          </div>
        </div>
      )}

      {chooser && (
        <WatchChooser title={chooser} onClose={() => setChooser(null)}
          onPlayHere={() => play(chooser)}
          onPlay3D={() => { setChooser(null); onEnterTheatre(chooser, 'play'); }}
          onDownload={() => { download(chooser); }}
          onOwnVideo={() => { setChooser(null); onEnterTheatre(undefined, 'ownVideo'); }}
          onOwnLink={() => { setChooser(null); onEnterTheatre(undefined, 'ownLink'); }} />
      )}

      {toast && <div className="toast-hud show">{toast}</div>}
    </div>
  );
}
