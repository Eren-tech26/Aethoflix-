import { BYPASS_BASE, TMDB_API_KEY, TMDB_BASE, type TmdbEndpoint } from './config';
import type { AnimeEdition, CatalogKind, CatalogPage, CatalogTitle, Episode, TitleDetails } from './types';

type RawTitle = {
  id: number; media_type?: string; title?: string; name?: string; original_title?: string; original_name?: string;
  overview?: string; poster_path?: string | null; backdrop_path?: string | null; release_date?: string; first_air_date?: string;
  vote_average?: number; original_language?: string; origin_country?: string[]; genre_ids?: number[]; adult?: boolean;
  genres?: { id: number; name: string }[]; runtime?: number; episode_run_time?: number[];
  seasons?: { season_number: number; name: string; episode_count: number }[];
};

const cache = new Map<string, { data: unknown; expires: number }>();

async function request<T>(path: string, params: Record<string, string>, endpoint: TmdbEndpoint, signal: AbortSignal): Promise<T> {
  if (!TMDB_API_KEY) throw new Error('TMDB is not configured. Add VITE_TMDB_API_KEY to .env.local and restart the app.');
  const cacheKey = `${endpoint}:${path}:${JSON.stringify(params)}`;
  const cached = cache.get(cacheKey);
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const url = new URL(`${endpoint === 'alternate' ? BYPASS_BASE : TMDB_BASE}${path}`);
  url.search = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'en-US', ...params }).toString();
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (response.status === 401 || response.status === 403) throw new Error('TMDB rejected the API key or access to this endpoint. Check the key and try the other metadata endpoint.');
    if (response.status === 429) throw new Error('TMDB is receiving too many requests. Please wait a moment, then retry.');
    if (!response.ok) throw new Error(response.status === 404 ? 'TMDB could not find this title or season.' : `TMDB is unavailable (HTTP ${response.status}). Try again or choose the other metadata endpoint.`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new Error('TMDB returned an unexpected response. Please retry.');
    if (cache.size >= 60) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { data, expires: Date.now() + 180000 });
    return data as T;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (controller.signal.aborted) throw new Error('This TMDB endpoint timed out. Try the alternate metadata endpoint below. Your playback server will not change.');
    if (error instanceof TypeError) throw new Error('Cannot reach this TMDB endpoint. Your network or ISP may block it. Try the alternate endpoint below; availability is not guaranteed.');
    throw error;
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}

function normalize(raw: RawTitle, fallbackType: 'movie' | 'tv'): CatalogTitle {
  const mediaType = raw.media_type === 'tv' || raw.media_type === 'movie' ? raw.media_type : fallbackType;
  const genres = raw.genre_ids ?? raw.genres?.map((genre) => genre.id) ?? [];
  return {
    id: raw.id, mediaType, title: (raw.title ?? raw.name ?? 'Untitled').slice(0, 250),
    originalTitle: raw.original_title ?? raw.original_name ?? raw.title ?? raw.name ?? '',
    overview: raw.overview ?? '', posterPath: raw.poster_path ?? null, backdropPath: raw.backdrop_path ?? null,
    year: (raw.release_date ?? raw.first_air_date ?? '').slice(0, 4), rating: raw.vote_average ?? 0,
    anime: genres.includes(16) && (raw.original_language === 'ja' || !!raw.origin_country?.includes('JP')),
  };
}

export async function getTitleById(id: number, mediaType: 'movie' | 'tv', endpoint: TmdbEndpoint, signal: AbortSignal): Promise<CatalogTitle> {
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new Error('The shared link contains an invalid TMDB ID.');
  const raw = await request<RawTitle>(`/${mediaType}/${id}`, {}, endpoint, signal);
  if (!Number.isInteger(raw.id)) throw new Error('TMDB did not return a valid title for this link.');
  return normalize(raw, mediaType);
}

export async function searchTitles(query: string, kind: CatalogKind, page: number, endpoint: TmdbEndpoint, signal: AbortSignal): Promise<CatalogPage> {
  const searching = !!query.trim();
  const path = searching ? `/search/${kind === 'all' || kind === 'anime' ? 'multi' : kind}`
    : kind === 'anime' ? '/discover/tv' : `/trending/${kind}/week`;
  const params: Record<string, string> = { page: String(page), include_adult: 'false' };
  if (searching) params.query = query.trim();
  if (!searching && kind === 'anime') Object.assign(params, { with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' });
  const raw = await request<{ results: RawTitle[]; page: number; total_pages: number }>(path, params, endpoint, signal);
  if (!Array.isArray(raw.results)) throw new Error('TMDB returned no readable results. Please retry.');
  return {
    results: raw.results.filter((title) => Number.isInteger(title.id) && !title.adult && title.media_type !== 'person')
      .map((title) => normalize(title, kind === 'tv' || kind === 'anime' ? 'tv' : 'movie'))
      .filter((title) => kind !== 'anime' || title.anime),
    page: raw.page, totalPages: Math.min(raw.total_pages || 1, 500),
  };
}

export async function getTitleDetails(title: CatalogTitle, endpoint: TmdbEndpoint, signal: AbortSignal): Promise<TitleDetails> {
  const raw = await request<RawTitle & {
    videos?: { results: { key: string; site: string; type: string; official?: boolean }[] };
    images?: { logos?: { file_path: string; iso_639_1: string | null; width: number }[] };
  }>(
    `/${title.mediaType}/${title.id}`,
    { append_to_response: 'videos,images' },
    endpoint,
    signal
  );
  const videos = raw.videos?.results || [];
  const yt = videos.filter((v) => v.site === 'YouTube' && v.key);
  const trailer = yt.find((v) => v.type === 'Trailer' && v.official)
    || yt.find((v) => v.type === 'Trailer')
    || yt.find((v) => v.type === 'Teaser')
    || yt[0];
  const logos = raw.images?.logos ?? [];
  const englishLogo = logos.find((logo) => logo.iso_639_1 === 'en') ?? logos[0];

  return {
    ...normalize(raw, title.mediaType),
    anime: title.anime || normalize(raw, title.mediaType).anime,
    genres: raw.genres?.map((genre) => genre.name) ?? [],
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    seasons: (raw.seasons ?? []).filter((season) => season.episode_count > 0).map((season) => ({ number: season.season_number, name: season.name, episodeCount: season.episode_count })),
    trailerKey: trailer?.key ?? null,
    logoPath: englishLogo?.file_path ?? null,
  };
}

export async function getTitlesByGenre(genreId: number, mediaType: 'movie' | 'tv', endpoint: TmdbEndpoint, signal: AbortSignal, page = 1): Promise<CatalogTitle[]> {
  const path = `/discover/${mediaType}`;
  const params = { with_genres: String(genreId), sort_by: 'popularity.desc', include_adult: 'false', page: String(page) };
  const raw = await request<{ results: RawTitle[] }>(path, params, endpoint, signal);
  return (raw.results || [])
    .filter((t) => Number.isInteger(t.id) && !t.adult)
    .map((t) => normalize(t, mediaType));
}

export type GenreDefinition = { id: number; name: string; mediaType: 'movie' | 'tv' };

// Netflix-style breadth: many genre rows across movies and series.
export const MOVIE_GENRES: GenreDefinition[] = [
  { id: 28, name: 'Action', mediaType: 'movie' },
  { id: 12, name: 'Adventure', mediaType: 'movie' },
  { id: 16, name: 'Animation', mediaType: 'movie' },
  { id: 35, name: 'Comedy', mediaType: 'movie' },
  { id: 80, name: 'Crime', mediaType: 'movie' },
  { id: 99, name: 'Documentary', mediaType: 'movie' },
  { id: 18, name: 'Drama', mediaType: 'movie' },
  { id: 10751, name: 'Family', mediaType: 'movie' },
  { id: 14, name: 'Fantasy', mediaType: 'movie' },
  { id: 36, name: 'History', mediaType: 'movie' },
  { id: 27, name: 'Horror', mediaType: 'movie' },
  { id: 10402, name: 'Music', mediaType: 'movie' },
  { id: 9648, name: 'Mystery', mediaType: 'movie' },
  { id: 10749, name: 'Romance', mediaType: 'movie' },
  { id: 878, name: 'Sci-Fi', mediaType: 'movie' },
  { id: 53, name: 'Thriller', mediaType: 'movie' },
  { id: 10752, name: 'War', mediaType: 'movie' },
  { id: 37, name: 'Western', mediaType: 'movie' },
];

export const TV_GENRES: GenreDefinition[] = [
  { id: 10759, name: 'Action & Adventure', mediaType: 'tv' },
  { id: 16, name: 'Animated Series', mediaType: 'tv' },
  { id: 35, name: 'Comedy Series', mediaType: 'tv' },
  { id: 80, name: 'Crime Series', mediaType: 'tv' },
  { id: 99, name: 'Docuseries', mediaType: 'tv' },
  { id: 18, name: 'Drama Series', mediaType: 'tv' },
  { id: 10751, name: 'Family Series', mediaType: 'tv' },
  { id: 9648, name: 'Mystery Series', mediaType: 'tv' },
  { id: 10765, name: 'Sci-Fi & Fantasy', mediaType: 'tv' },
  { id: 10768, name: 'War & Politics', mediaType: 'tv' },
  { id: 37, name: 'Western Series', mediaType: 'tv' },
];

export async function getAnimeByGenre(genreId: number, endpoint: TmdbEndpoint, signal: AbortSignal, page = 1): Promise<CatalogTitle[]> {
  const raw = await request<{ results: RawTitle[] }>('/discover/tv', {
    with_genres: `16,${genreId}`, with_origin_country: 'JP', sort_by: 'popularity.desc', include_adult: 'false', page: String(page),
  }, endpoint, signal);
  return (raw.results || []).filter((t) => Number.isInteger(t.id) && !t.adult).map((t) => normalize(t, 'tv'));
}

export async function getEpisodes(id: number, season: number, endpoint: TmdbEndpoint, signal: AbortSignal): Promise<Episode[]> {
  const data = await request<{ episodes: { episode_number: number; name: string; air_date: string | null }[] }>(`/tv/${id}/season/${season}`, {}, endpoint, signal);
  if (!Array.isArray(data.episodes)) throw new Error('No episode information was returned for this season.');
  return data.episodes.map((episode) => ({ number: episode.episode_number, name: episode.name, airDate: episode.air_date }));
}

async function anilistRequest<T>(query: string, variables: object, signal: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(cancel, 12000);
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST', signal: controller.signal, credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 429) throw new Error('AniList is rate-limiting requests. Wait a moment or enter the AniList ID manually.');
    if (!response.ok) throw new Error('AniList could not be reached. You can enter a verified ID instead.');
    const data = await response.json() as { data?: T; errors?: unknown[] };
    if (!data.data || data.errors) throw new Error('AniList returned no readable results. Try another title or enter an ID.');
    return data.data;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (controller.signal.aborted) throw new Error('AniList timed out. Enter an ID manually or retry.');
    if (error instanceof TypeError) throw new Error('Cannot reach AniList. You can still enter an ID manually.');
    throw error;
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); }
}

type EditionFields = { id: number; idMal: number | null; title: { english: string | null; romaji: string }; startDate: { year: number | null }; format: string; episodes: number | null; coverImage: { medium: string | null } };

function toEdition(anime: EditionFields): AnimeEdition {
  return { id: anime.id, malId: anime.idMal, title: anime.title.english ?? anime.title.romaji, year: anime.startDate.year, format: anime.format, episodes: anime.episodes, poster: anime.coverImage.medium };
}

export async function searchAnimeEditions(query: string, signal: AbortSignal): Promise<AnimeEdition[]> {
  const data = await anilistRequest<{ Page: { media: EditionFields[] } }>('query ($search: String) { Page(page: 1, perPage: 8) { media(search: $search, type: ANIME, isAdult: false) { id idMal title { english romaji } startDate { year } format episodes coverImage { medium } } } }', { search: query.trim() }, signal);
  return data.Page.media.map(toEdition);
}

export async function resolveAnimeIds(options: { anilistId?: number; malId?: number }, signal: AbortSignal): Promise<AnimeEdition> {
  const anilistId = options.anilistId;
  const malId = options.malId;
  if (Number.isInteger(anilistId) && anilistId && anilistId > 0 && anilistId < 1000000000) {
    const data = await anilistRequest<{ Media: EditionFields }>('query ($id: Int) { Media(id: $id, type: ANIME, isAdult: false) { id idMal title { english romaji } startDate { year } format episodes coverImage { medium } } }', { id: anilistId }, signal);
    return toEdition(data.Media);
  }
  if (Number.isInteger(malId) && malId && malId > 0 && malId < 1000000000) {
    const data = await anilistRequest<{ Media: EditionFields }>('query ($idMal: Int) { Media(idMal: $idMal, type: ANIME, isAdult: false) { id idMal title { english romaji } startDate { year } format episodes coverImage { medium } } }', { idMal: malId }, signal);
    return toEdition(data.Media);
  }
  throw new Error('Enter a positive AniList or MAL ID to resolve.');
}