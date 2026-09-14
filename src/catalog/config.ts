export const TMDB_API_KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim() ?? '';
export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const BYPASS_BASE = 'https://api.tmdb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
export const TMDB_LOGO = 'https://www.themoviedb.org/assets/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg';
export type TmdbEndpoint = 'standard' | 'alternate';

export function readEndpoint(): TmdbEndpoint {
  try {
    const saved = localStorage.getItem('aethoflix-tmdb-endpoint');
    if (saved === 'standard') return 'standard';
    return 'alternate';
  } catch { return 'alternate'; }
}

export function saveEndpoint(endpoint: TmdbEndpoint) {
  try { localStorage.setItem('aethoflix-tmdb-endpoint', endpoint); } catch { /* An endpoint selection can remain session-only. */ }
}

export function posterUrl(path: string | null): string | undefined {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `${TMDB_IMG}${path}` : undefined;
}

export function backdropUrl(path: string | null): string | undefined {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `https://image.tmdb.org/t/p/w1280${path}` : undefined;
}

export function logoUrl(path: string | null | undefined): string | undefined {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `https://image.tmdb.org/t/p/w500${path}` : undefined;
}