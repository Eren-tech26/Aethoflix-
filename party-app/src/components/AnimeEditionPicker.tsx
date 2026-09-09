import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ExternalLink, LoaderCircle, Search, X } from 'lucide-react';
import { searchAnimeEditions } from '../catalog/tmdb';
import type { AnimeEdition } from '../catalog/types';

type Props = { title: string; edition: AnimeEdition | null; onChoose: (edition: AnimeEdition | null) => void; disabled?: boolean };

export default function AnimeEditionPicker({ title, edition, onChoose, disabled }: Props) {
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<AnimeEdition[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualId, setManualId] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError('');
    try { setResults(await searchAnimeEditions(query, controller.signal)); setSearched(true); }
    catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Anime search is unavailable.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <div className="anime-edition-picker">
    <div className="catalog-section-label"><span>ANIME EDITION</span><a href="https://anilist.co/search/anime" target="_blank" rel="noopener noreferrer">AniList<ExternalLink size={12} /></a></div>
    {edition ? <div className="matched-edition"><Check size={17} /><div><strong>{edition.title}</strong><span>AniList #{edition.id}{edition.year ? ` / ${edition.year}` : ''}{edition.episodes ? ` / ${edition.episodes} episodes` : ''}</span></div><button className="icon-button" aria-label="Change anime edition" disabled={disabled} onClick={() => onChoose(null)}><X size={16} /></button></div> : <>
      <p className="catalog-helper">Choose the matching anime season. TMDB and AniList use different IDs; a title match is never assumed.</p>
      <form className="anime-match-form" onSubmit={(event) => void search(event)}><input className="cinema-input" aria-label="Search for the matching anime edition" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anime title or season" maxLength={150} disabled={disabled || busy} /><button className="secondary-button" disabled={disabled || busy || !query.trim()} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}Find</button></form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!!results.length && <div className="anime-match-results">{results.map((result) => <button key={result.id} disabled={disabled} onClick={() => onChoose(result)}><span><strong>{result.title}</strong><small>{result.year ?? 'Year unknown'} / {result.format?.replace('_', ' ')} / {result.episodes ? `${result.episodes} episodes` : 'Ongoing'}</small></span><span className="match-id">#{result.id}</span></button>)}</div>}
      {searched && !results.length && !busy && <p className="catalog-helper">No matching editions. Try the original title, or enter its ID below.</p>}
      <details className="manual-anime-id"><summary>Enter an AniList ID instead</summary><form onSubmit={(event) => { event.preventDefault(); const id = Number(manualId); if (Number.isInteger(id) && id > 0 && id < 1000000000) onChoose({ id, title: `${title} (manual match)`, year: null, format: '', episodes: null, poster: null }); }}><input className="cinema-input" type="number" min="1" max="999999999" aria-label="AniList anime ID" required value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="AniList ID, not TMDB ID" disabled={disabled} /><button className="secondary-button" type="submit" disabled={disabled}>Use ID<Check size={14} /></button></form></details>
    </>}
  </div>;
}