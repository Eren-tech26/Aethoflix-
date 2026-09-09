export type CatalogKind = 'all' | 'movie' | 'tv' | 'anime';
export type CatalogTitle = {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string;
  rating: number;
  anime: boolean;
};
export type CatalogPage = { results: CatalogTitle[]; page: number; totalPages: number };
export type TitleDetails = CatalogTitle & {
  genres: string[];
  runtime: number | null;
  seasons: { number: number; name: string; episodeCount: number }[];
};
export type Episode = { number: number; name: string; airDate: string | null };
export type AnimeEdition = { id: number; title: string; year: number | null; format: string; episodes: number | null; poster: string | null };
export type ServerKey = 'megaplay' | 'recloud' | 'zokoanime' | 'zxc' | 'bingr' | 'nxsha' | 'vidlink' | 'vidnest';
export type AudioTrack = 'sub' | 'dub';
export type RecloudSource = 'hd-1' | 'hd-2';
export type ServerPreferences = { audio: AudioTrack; source: RecloudSource; zokoTemplate: string; sandbox: boolean };
export type EmbedSelection = {
  server: ServerKey;
  anime: boolean;
  season: number;
  episode: number;
  animeId: number | null;
  animeEpisode: number;
  animeEdition: string;
  preferences: ServerPreferences;
};
export type EmbedMedia = {
  id: string;
  kind: 'embed';
  title: string;
  url: string;
  catalog: CatalogTitle;
  selection: EmbedSelection;
};