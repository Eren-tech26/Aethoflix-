import type { AudioTrack, CatalogTitle, EmbedMedia, EmbedSelection, ServerKey, ServerPreferences } from './types';

export const STD_SERVERS = [
  { key: 'zxc', name: 'ZXC', tag: 'Fast', movie: (id: number) => `https://zxcstream.xyz/player/movie/${id}`, tv: (id: number, s: number, e: number) => `https://zxcstream.xyz/player/tv/${id}?season=${s}&episode=${e}` },
  { key: 'bingr', name: 'Bingr', tag: '4K', movie: (id: number) => `https://bingr.one/watch/movie/${id}`, tv: (id: number, s: number, e: number) => `https://bingr.one/watch/tv/${id}/${s}/${e}` },
  { key: 'nxsha', name: 'Nxsha', tag: 'HD + Subs', movie: (id: number) => `https://nxsha.space/embed/movie/${id}`, tv: (id: number, s: number, e: number) => `https://nxsha.space/embed/tv/${id}/${s}/${e}`, highlight: true },
  { key: 'vidlink', name: 'VidLink', tag: 'Multi', movie: (id: number) => `https://vidlink.pro/movie/${id}?autoplay=true`, tv: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}?autoplay=true` },
  { key: 'vidnest', name: 'VidNest', tag: 'Alt', movie: (id: number) => `https://vidnest.fun/movie/${id}`, tv: (id: number, s: number, e: number) => `https://vidnest.fun/tv/${id}/${s}/${e}` },
] as const;

export const MP_BASE = 'https://megaplay.buzz';
export const RC_BASE = 'https://cdn.4animo.xyz';
export const ZK_BASE = 'https://zokoanime.video';
export const ZK_COLOR = '?color=ffffff';
export const RC_SOURCES = ['hd-1', 'hd-2'] as const;
export const RC_DEFAULT_SOURCE = 'hd-1';
export const ANIME_SERVERS = [
  { key: 'megaplay', name: 'MegaPlay', tag: 'Anime' },
  { key: 'recloud', name: 'ReCloud', tag: 'HD-1 / HD-2' },
  { key: 'zokoanime', name: 'Zokoanime', tag: 'Anime' },
] as const;

export const DEFAULT_PREFERENCES: ServerPreferences = { audio: 'sub', source: RC_DEFAULT_SOURCE, zokoTemplate: '', sandbox: false };
const PREF_KEY = 'aethoflix-server-preferences-v1';

export function serversFor(anime: boolean): { key: ServerKey; name: string; tag: string; number: number }[] {
  return (anime ? [...ANIME_SERVERS, ...STD_SERVERS] : STD_SERVERS).map((server, index) => ({ key: server.key, name: server.name, tag: server.tag, number: index + 1 }));
}

export function readServerPreferences(key: ServerKey): ServerPreferences {
  try {
    const all = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Record<string, Partial<ServerPreferences>>;
    const value = all[key];
    return { audio: value?.audio === 'dub' ? 'dub' : 'sub', source: value?.source === 'hd-2' ? 'hd-2' : RC_DEFAULT_SOURCE,
      zokoTemplate: typeof value?.zokoTemplate === 'string' ? value.zokoTemplate.slice(0, 2000) : '',
      sandbox: key === 'nxsha' };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}

export function saveServerPreferences(key: ServerKey, value: ServerPreferences) {
  try {
    const previous: unknown = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}');
    const all = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...all, [key]: value }));
  } catch { /* Keep using the selected preferences if storage is unavailable. */ }
}

export function serverName(key: ServerKey): string {
  return [...ANIME_SERVERS, ...STD_SERVERS].find((server) => server.key === key)?.name ?? 'Provider';
}

// Download hand-offs. Neither provider publishes a documented public download
// API, so these open the provider's own download hub for the title rather than
// inventing a direct-file route. Nxsha's hub is the `/dl/` path referenced in
// the original AethoFlix site; Zokoanime is used for anime.
export function movieDownloadUrl(id: number, mediaType: 'movie' | 'tv' = 'movie', season = 1, episode = 1): string {
  return mediaType === 'movie'
    ? `https://nxsha.space/dl/movie/${id}`
    : `https://nxsha.space/dl/tv/${id}/${season}/${episode}`;
}

export function animeDownloadUrl(anilistId: number | null, episode: number, audio: AudioTrack, malId?: number | null): string | null {
  const ep = Math.max(1, Math.floor(episode));
  const track = audio === 'dub' ? 'dub' : 'sub';
  // Exact Zokoanime download routes: https://zokoanime.video/download/mal/... and /download/anilist/...
  if (Number.isInteger(malId) && malId && malId > 0) return `https://zokoanime.video/download/mal/${malId}/${ep}/${track}`;
  if (Number.isInteger(anilistId) && anilistId && anilistId > 0) return `https://zokoanime.video/download/anilist/${anilistId}/${ep}/${track}`;
  return null;
}

export function makeEmbed(title: CatalogTitle, selection: EmbedSelection): EmbedMedia {
  if (!Number.isInteger(title.id) || title.id <= 0 || title.id > 2147483647 || !['movie', 'tv'].includes(title.mediaType) || typeof title.title !== 'string' || typeof selection.anime !== 'boolean'
    || !Number.isInteger(selection.season) || selection.season < 0 || selection.season > 10000 || !Number.isInteger(selection.episode) || selection.episode < 1 || selection.episode > 100000) throw new Error('Choose a valid title, season, and episode.');
  if (!serversFor(selection.anime).some((server) => server.key === selection.server)) throw new Error('This server is only available for anime.');
  const standard = STD_SERVERS.find((server) => server.key === selection.server);
  const { preferences } = selection;
  if (!preferences || !['sub', 'dub'].includes(preferences.audio) || !RC_SOURCES.includes(preferences.source) || typeof preferences.zokoTemplate !== 'string' || typeof preferences.sandbox !== 'boolean') throw new Error('Choose valid audio, source, and sandbox settings.');
  let url: string;
  if (standard) url = title.mediaType === 'movie' ? standard.movie(title.id) : standard.tv(title.id, selection.season, selection.episode);
  else if (selection.server === 'zokoanime') {
    if (!Number.isInteger(selection.animeEpisode) || selection.animeEpisode < 1 || selection.animeEpisode > 100000) throw new Error('Choose a valid anime episode number.');
    const track = preferences.audio === 'dub' ? 'dub' : 'sub';
    const malId = selection.animeMalId;
    if (Number.isInteger(malId) && malId && malId > 0) url = `${ZK_BASE}/stream/mal/${malId}/${selection.animeEpisode}/${track}?color=ffffff`;
    else if (selection.animeId && Number.isInteger(selection.animeId) && selection.animeId > 0) url = `${ZK_BASE}/stream/anilist/${selection.animeId}/${selection.animeEpisode}/${track}?color=ffffff`;
    else throw new Error('Match the anime edition so Zoko can use its AniList or MAL ID.');
  } else {
    if (!selection.animeId || !Number.isInteger(selection.animeId) || selection.animeId <= 0) throw new Error('Match the anime edition or enter its AniList ID. TMDB IDs cannot be used as AniList IDs.');
    if (!Number.isInteger(selection.animeEpisode) || selection.animeEpisode < 1 || selection.animeEpisode > 100000) throw new Error('Enter the episode number within the selected anime edition.');
    url = selection.server === 'megaplay'
      ? `https://megaplay.buzz/stream/ani/${selection.animeId}/${selection.animeEpisode}/${preferences.audio}`
      : `https://cdn.4animo.xyz/embed/${preferences.source}/ani/${selection.animeId}/${selection.animeEpisode}/${preferences.audio}?k=1`;
  }
  const suffix = title.mediaType === 'tv' ? ` / S${selection.season} E${selection.episode}` : '';
  return { id: `embed-${title.id}-${selection.server}-${Date.now()}`, kind: 'embed', title: `${title.title}${suffix}`.slice(0, 295), url, catalog: title, selection };
}

export function validateEmbed(media: EmbedMedia): boolean {
  if (!media || media.kind !== 'embed' || !media.catalog || !media.selection || !media.selection.preferences || typeof media.url !== 'string' || media.url.length > 3000) return false;
  try {
    const expected = makeEmbed(media.catalog, media.selection);
    return expected.url === media.url && typeof media.title === 'string' && media.title.length <= 300;
  } catch { return false; }
}