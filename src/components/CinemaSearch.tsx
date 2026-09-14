import { useEffect, useRef, useState } from 'react';
import { Film, LoaderCircle, Play, Search, Star, X } from 'lucide-react';
import { posterUrl, readEndpoint } from '../catalog/config';
import { searchTitles } from '../catalog/tmdb';
import type { CatalogTitle } from '../catalog/types';

// A small magnifying-glass button in the corner of the theatre that expands
// into a TMDB search panel. Pick any result and it plays on the cinema screen.
export default function CinemaSearch({ onPlay }: { onPlay: (title: CatalogTitle) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<CatalogTitle[]>([]);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const endpoint = useRef(readEndpoint()).current;

  useEffect(() => {
    if (!open || !query.trim()) { setItems([]); setSearched(false); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      searchTitles(query, 'all', 1, endpoint, controller.signal).then((data) => {
        if (!controller.signal.aborted) { setItems(data.results.slice(0, 8)); setSearched(true); setActive(0); }
      }).catch(() => { if (!controller.signal.aborted) { setItems([]); setSearched(true); } })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, endpoint]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => { if (open) { const timer = setTimeout(() => input.current?.focus(), 70); return () => clearTimeout(timer); } }, [open]);

  const pick = (title: CatalogTitle) => { setOpen(false); setQuery(''); onPlay(title); };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((a) => Math.min(Math.max(items.length - 1, 0), a + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (event.key === 'Enter' && items[active]) pick(items[active]);
  };

  return (
    <div className="cinema-search-corner" ref={box}>
      <button className={`cs-trigger ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Search movies, series or anime" aria-expanded={open} title="Search the catalogue">
        <Search size={17} />
      </button>
      {open && (
        <div className="cs-panel">
          <div className="cs-panel-head">
            <div className="cs-input-row">
              <Search size={15} />
              <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Search any movie, series or anime…" maxLength={120} aria-label="Search the cinema catalogue" />
              {busy && <LoaderCircle className="spin" size={14} />}
            </div>
            <button className="cs-close" onClick={() => setOpen(false)} aria-label="Close search"><X size={15} /></button>
          </div>
          {query.trim() && (
            <div className="cs-results" role="listbox" aria-label="Search results">
              {busy ? <div className="cs-state"><LoaderCircle className="spin" size={16} /><span>Searching TMDB…</span></div>
                : items.length ? items.map((item, index) => (
                  <button key={`${item.mediaType}-${item.id}`} className={`cs-item ${index === active ? 'is-active' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => pick(item)} role="option" aria-selected={index === active}>
                    <span className="cs-poster">{posterUrl(item.posterPath) ? <img src={posterUrl(item.posterPath)} alt="" loading="lazy" /> : <Film size={14} />}</span>
                    <span className="cs-text"><strong>{item.title}</strong><small>{item.year || 'TBA'} · {item.anime ? 'Anime' : item.mediaType === 'movie' ? 'Movie' : 'Series'}</small></span>
                    {item.rating > 0 && <span className="cs-rating"><Star size={9} />{item.rating.toFixed(1)}</span>}
                    <Play size={12} className="cs-play" />
                  </button>
                )) : searched ? <div className="cs-state"><span>No results for “{query}”. Try another title.</span></div> : null}
            </div>
          )}
          <p className="cs-hint">Press Enter to play it on the cinema screen</p>
        </div>
      )}
    </div>
  );
}
