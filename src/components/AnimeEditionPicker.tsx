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
  const [autoResults, setAutoResults] = useState<AnimeEdition[] | null>(null);
  const [autoBusy, setAutoBusy] = useState(true);
  const request = useRef<AbortController | null>(null);
  const autoRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); autoRequest.current?.abort(); }, []);

  // No ID knowledge needed: automatically look this title up on AniList and offer matches.
  useEffect(() => {
    if (edition) { setAutoBusy(false); return; }
    autoRequest.current?.abort();
    const controller = new AbortController();
    autoRequest.current = controller;
    setAutoBusy(true);
    setAutoResults(null);
    const timer = window.setTimeout(() => {
      searchAnimeEditions(title, controller.signal).then((matches) => {
        if (!controller.signal.aborted) { setAutoResults(matches); setAutoBusy(false); }
      }).catch(() => {
        if (!controller.signal.aborted) { setAutoResults([]); setAutoBusy(false); }
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [title, edition]);

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
    <div className="catalog-section-label"><span>ANIME EDITION</span><span className="edition-links"><a href="https://anilist.co/search/anime" target="_blank" rel="noopener noreferrer">Find AniList IDs<ExternalLink size={12} /></a><a href="https://myanimelist.net/topanime.php" target="_blank" rel="noopener noreferrer">Find MAL IDs<ExternalLink size={12} /></a></span></div>
    {edition ? <div className="matched-edition"><Check size={17} /><div><strong>{edition.title}</strong><span>AniList #{edition.id}{edition.year ? ` / ${edition.year}` : ''}{edition.episodes ? ` / ${edition.episodes} episodes` : ''}</span><span className="matched-edition-links"><a href={`https://anilist.co/anime/${edition.id}`} target="_blank" rel="noopener noreferrer">AniList<ExternalLink size={11} /></a>{edition.malId ? <a href={`https://myanimelist.net/anime/${edition.malId}`} target="_blank" rel="noopener noreferrer">MAL #{edition.malId}<ExternalLink size={11} /></a> : null}</span></div><button className="icon-button" aria-label="Change anime edition" disabled={disabled} onClick={() => onChoose(null)}><X size={16} /></button></div> : <>
      <div className="auto-edition-block">
        <p className="catalog-helper"><strong>No IDs needed.</strong> We already looked this title up on AniList. Pick the matching season below — that is all.</p>
        {autoBusy ? <p className="catalog-inline-loading"><LoaderCircle className="spin" size={15} />Matching with AniList...</p>
          : autoResults?.length ? <div className="anime-match-results auto-edition-results">{autoResults.map((result) => <button key={result.id} disabled={disabled} onClick={() => onChoose(result)}><span><strong>{result.title}</strong><small>{result.year ?? 'Year unknown'} / {result.format?.replace('_', ' ')} / {result.episodes ? `${result.episodes} episodes` : 'Ongoing'}</small></span><span className="match-id">#{result.id}{result.malId ? <i>MAL #{result.malId}</i> : null}</span></button>)}</div>
            : <p className="catalog-helper">No automatic match was found for this title. Refine the search below, or use the ID tools — links to find IDs are above.</p>}
      </div>
      <form className="anime-match-form" onSubmit={(event) => void search(event)}><input className="cinema-input" aria-label="Search for the matching anime edition" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Anime title or season" maxLength={150} disabled={disabled || busy} /><button className="secondary-button" disabled={disabled || busy || !query.trim()} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}Search again</button></form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!!results.length && <div className="anime-match-results">{results.map((result) => <button key={result.id} disabled={disabled} onClick={() => onChoose(result)}><span><strong>{result.title}</strong><small>{result.year ?? 'Year unknown'} / {result.format?.replace('_', ' ')} / {result.episodes ? `${result.episodes} episodes` : 'Ongoing'}</small></span><span className="match-id">#{result.id}{result.malId ? <i>MAL #{result.malId}</i> : null}</span></button>)}</div>}
      {searched && !results.length && !busy && <p className="catalog-helper">No matching editions for that search. Try the original title.</p>}
      <details className="manual-anime-id"><summary>Advanced: I know the AniList ID</summary><form onSubmit={(event) => { event.preventDefault(); const id = Number(manualId); if (Number.isInteger(id) && id > 0 && id < 1000000000) onChoose({ id, malId: null, title: `${title} (manual match)`, year: null, format: '', episodes: null, poster: null }); }}><input className="cinema-input" type="number" min="1" max="999999999" aria-label="AniList anime ID" required value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="AniList ID, not TMDB ID" disabled={disabled} /><button className="secondary-button" type="submit" disabled={disabled}>Use ID<Check size={14} /></button></form></details>
    </>}
  </div>;
}
