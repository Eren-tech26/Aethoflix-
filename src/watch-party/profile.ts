import type { PlayerProfile } from '../cinema/types';

export const OUTFITS = [
  { name: 'Sand', color: '#c8bea9' },
  { name: 'Burgundy', color: '#974c5f' },
  { name: 'Sage', color: '#84947a' },
  { name: 'Slate', color: '#7a95b1' },
  { name: 'Lilac', color: '#a595b5' },
] as const;

export function cleanProfile(profile: PlayerProfile): PlayerProfile {
  return {
    name: profile.name.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Guest',
    color: OUTFITS.some((outfit) => outfit.color === profile.color) ? profile.color : OUTFITS[0].color,
  };
}

export function loadProfile(): PlayerProfile {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('aethoflix-player') ?? 'null');
    if (saved && typeof saved === 'object' && 'name' in saved && 'color' in saved && typeof saved.name === 'string' && typeof saved.color === 'string') return cleanProfile({ name: saved.name, color: saved.color });
  } catch { /* A player profile is optional and never requires an account. */ }
  return { name: 'Guest', color: OUTFITS[0].color };
}

export function saveProfile(profile: PlayerProfile) {
  try { localStorage.setItem('aethoflix-player', JSON.stringify(cleanProfile(profile))); } catch { /* Continue without persistent storage. */ }
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? '').join('').toUpperCase() || 'G';
}