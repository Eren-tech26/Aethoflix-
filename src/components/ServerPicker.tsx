import { useEffect, useState } from 'react';
import { ArrowRight, Check, Info, LoaderCircle, Play, Search } from 'lucide-react';
import { DEFAULT_PREFERENCES, makeEmbed, readServerPreferences, RC_SOURCES, saveServerPreferences, serversFor } from '../catalog/servers';
import { resolveAnimeIds } from '../catalog/tmdb';
import type { AnimeEdition, CatalogTitle, EmbedMedia, EmbedSelection, ServerKey, ServerPreferences } from '../catalog/types';
import AnimeEditionPicker from './AnimeEditionPicker';

type Props = { title: CatalogTitle; season: number; episode: number; active: EmbedMedia | null; suggestedEdition?: AnimeEdition | null; disabled?: boolean; onLoad: (media: EmbedMedia) => Promise<void> };

function readEdition(key: string): AnimeEdition | null {
  try {
    const edition: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (edition && typeof edition === 'object' && 'id' in edition && 'title' in edition && typeof edition.id === 'number' && Number.isInteger(edition.id) && edition.id > 0 && typeof edition.title === 'string') {
      const value = edition as Partial<AnimeEdition>;
      return { id: edition.id, malId: typeof value.malId === 'number' && Number.isInteger(value.malId) ? value.malId : null, title: edition.title.slice(0, 250), episodes: typeof value.episodes === 'number' && Number.isInteger(value.episodes) ? value.episodes : null, format: typeof value.format === 'string' ? value.format : '', year: typeof value.year === 'number' ? value.year : null, poster: null };
    }
  } catch { /* Manual matching is available without storage. */ }
  return null;
}

export default function ServerPicker({ title, season, episode, active, suggestedEdition, disabled, onLoad }: Props) {
  const initial = active?.catalog.id === title.id && active.catalog.mediaType === title.mediaType ? active.selection : null;
  const [anime, setAnime] = useState(initial?.anime ?? title.anime);
  const [selected, setSelected] = useState<ServerKey | null>(initial?.server ?? 'nxsha');
  const [resolveType, setResolveType] = useState<'anilist' | 'mal'>('anilist');
  const [resolveId, setResolveId] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [allPreferences, setAllPreferences] = useState(() => {
    const preferences = Object.fromEntries(serversFor(true).map((server) => [server.key, readServerPreferences(server.key)])) as Record<ServerKey, ServerPreferences>;
    if (initial) preferences[initial.server] = { ...initial.preferences };
    return preferences;
  });
  const [edition, setEdition] = useState<AnimeEdition | null>(() => {
    if (initial?.animeId) return { id: initial.animeId, malId: null, title: initial.animeEdition, year: null, episodes: null, format: '', poster: null };
    return suggestedEdition ?? null;
  });
  const [animeEpisode, setAnimeEpisode] = useState(String(initial?.animeEpisode ?? episode));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const editionKey = `aethoflix-anime-edition-${title.mediaType}-${title.id}-${season}`;
  const servers = serversFor(anime);
  const server = servers.find((item) => item.key === selected);
  const preferences = selected ? allPreferences[selected] : DEFAULT_PREFERENCES;
  const animeProvider = selected === 'megaplay' || selected === 'recloud' || selected === 'zokoanime';

  useEffect(() => {
    if (active?.catalog.id !== title.id || active.catalog.mediaType !== title.mediaType) return;
    setSelected(active.selection.server);
    setAnime(active.selection.anime);
    setAllPreferences((current) => ({ ...current, [active.selection.server]: { ...active.selection.preferences } }));
  }, [active?.id, title.id, title.mediaType]);

  useEffect(() => {
    if (edition) return;
    const saved = readEdition(editionKey);
    if (saved) setEdition(saved);
    setAnimeEpisode(String(initial?.season === season && initial.episode === episode ? initial.animeEpisode : episode));
    setError('');
  }, [editionKey, season, episode]);

  const changePreferences = (next: Partial<ServerPreferences>) => {
    if (!selected) return;
    const value = { ...preferences, ...next };
    setAllPreferences((current) => ({ ...current, [selected]: value }));
    saveServerPreferences(selected, value);
    setError('');
  };

  const chooseEdition = (value: AnimeEdition | null) => {
    setEdition(value);
    try { if (value) localStorage.setItem(editionKey, JSON.stringify(value)); else localStorage.removeItem(editionKey); } catch { /* Matching can remain session-only. */ }
    setError('');
  };

  const doResolve = async () => {
    if (resolving || disabled || !resolveId.trim()) return;
    setResolving(true); setResolveError('');
    const controller = new AbortController();
    try {
      const value = Number(resolveId);
      const resolved = await resolveAnimeIds(resolveType === 'anilist' ? { anilistId: value } : { malId: value }, controller.signal);
      chooseEdition(resolved);
      setAnime(true);
      setResolveId('');
    } catch (problem) { setResolveError(problem instanceof Error ? problem.message : 'The ID could not be resolved.'); }
    finally { setResolving(false); }
  };

  const load = async () => {
    if (!selected || loading || disabled) return;
    setError('');
    if (animeProvider && edition?.episodes && Number(animeEpisode) > edition.episodes) { setError('This episode is outside the selected anime edition. Choose the correct season or episode.'); return; }
    const selection: EmbedSelection = { server: selected, anime, season, episode, animeId: edition?.id ?? null, animeMalId: edition?.malId ?? null, animeEpisode: Number(animeEpisode), animeEdition: edition?.title ?? '', preferences: { ...preferences } };
    setLoading(true);
    try { await onLoad(makeEmbed(title, selection)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'The selected server could not be opened.'); }
    finally { setLoading(false); }
  };

  return <div className="server-picker">
    <div className="catalog-section-label"><span>CHOOSE A SERVER</span><span>{anime ? '8 anime servers' : '5 movie / series servers'}</span></div>
    <div className="server-pills" role="radiogroup" aria-label="Playback server">{servers.map((item) => <button key={item.key} type="button" role="radio" aria-checked={selected === item.key} className={`server-pill ${selected === item.key ? 'is-selected' : ''}`} onClick={() => { setSelected(item.key); setError(''); }} disabled={disabled || loading}><span>Server {item.number}{selected === item.key && <Check size={12} />}</span><strong>{item.name}</strong><small>{item.tag}{item.key === 'nxsha' && <span className="default-badge">DEFAULT</span>}</small></button>)}</div>
    <p className="server-fallback-notice"><Info size={15} /><span>If a server fails, choose another one. <strong>No automatic fallback.</strong> Only your selected server is requested. Quality labels are provider labels, not guarantees.</span></p>
    {!title.anime && <label className="anime-mode-toggle"><input type="checkbox" checked={anime} disabled={disabled || loading} onChange={(event) => { setAnime(event.target.checked); setError(''); }} /><span>This is anime: show all 8 servers</span></label>}
    {anime && selected && <div className="server-language"><div><span className="field-label">SERVER {server?.number} AUDIO</span><div className="language-switch" role="group" aria-label={`Audio preference for Server ${server?.number}`}>{(['sub', 'dub'] as const).map((audio) => <button key={audio} aria-pressed={preferences.audio === audio} disabled={disabled || loading} onClick={() => changePreferences({ audio })}>{audio === 'sub' ? 'Sub' : 'Dub'}</button>)}</div></div>{selected === 'recloud' && <label><span className="field-label">RECLOUD SOURCE</span><select className="catalog-select" value={preferences.source} disabled={disabled || loading} onChange={(event) => changePreferences({ source: event.target.value as ServerPreferences['source'] })}>{RC_SOURCES.map((source) => <option key={source} value={source}>{source.toUpperCase()}</option>)}</select></label>}</div>}
    {anime && selected && <p className="catalog-helper preference-note">{animeProvider ? `Saved only for Server ${server?.number}. Other servers keep their own Sub/Dub settings.` : `Your Server ${server?.number} preference is saved. These TMDB embed URLs do not accept an audio parameter; choose the available track inside the provider player.`}</p>}
    {animeProvider && <>
      <div className="id-resolve-block"><span className="field-label">ADVANCED: RESOLVE BY ANILIST / MAL ID</span><p className="catalog-helper">Only for people who already know an ID. Everyone else can simply pick a suggested match by title above — no IDs required.</p><div className="id-resolve-form"><select className="catalog-select" aria-label="ID type" value={resolveType} disabled={disabled || loading || resolving} onChange={(event) => setResolveType(event.target.value as 'anilist' | 'mal')}><option value="anilist">AniList ID</option><option value="mal">MAL ID</option></select><input className="cinema-input" type="number" min="1" max="999999999" inputMode="numeric" aria-label="Anime ID to resolve" placeholder={resolveType === 'anilist' ? 'AniList ID' : 'MAL ID'} value={resolveId} onChange={(event) => setResolveId(event.target.value)} disabled={disabled || loading || resolving} /><button className="secondary-button" onClick={() => void doResolve()} disabled={disabled || loading || resolving || !resolveId.trim()}>{resolving ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}Resolve</button></div><p className="catalog-helper">Resolves the anime and fills in both AniList and MAL IDs. A title match is never assumed.</p>{resolveError && <p className="form-error" role="alert">{resolveError}</p>}</div>
      <AnimeEditionPicker key={editionKey} title={title.title} edition={edition} onChoose={chooseEdition} disabled={disabled || loading} />
      <label className="anime-episode-input"><span className="field-label">EPISODE WITHIN THIS ANIME EDITION</span><input type="number" min="1" max={edition?.episodes ?? 99999} step="1" value={animeEpisode} onChange={(event) => setAnimeEpisode(event.target.value)} className="cinema-input" disabled={disabled || loading} /><small>AniList seasons may use different episode numbering from TMDB.</small></label>
    </>}
    {selected === 'zokoanime' && <p className="catalog-helper">Zoko plays from <code>zokoanime.video/stream/mal|anilist/&#123;id&#125;/&#123;episode&#125;/sub|dub</code>. Sub and Dub reload that exact stream.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button full-width load-server-button" onClick={() => void load()} disabled={!selected || disabled || loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}{loading ? 'Opening selected server...' : selected ? `Load Server ${server?.number}` : 'Choose a server above'}<ArrowRight size={17} /></button>
    <p className="catalog-helper provider-privacy">External providers control availability and playback. Loading a server connects your browser to that provider. Popups and top-level redirects are blocked.</p>
  </div>;
}