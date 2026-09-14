import { Boxes, ChevronRight, Download, Link2, Play, Upload, X } from 'lucide-react';
import { posterUrl } from '../catalog/config';
import type { CatalogTitle } from '../catalog/types';

type Props = {
  title: CatalogTitle;
  onClose: () => void;
  onPlayHere: () => void;
  onPlay3D: () => void;
  onDownload: () => void;
  onOwnVideo: () => void;
  onOwnLink: () => void;
};

// A single professional menu: every way to watch a title, grouped clearly.
export default function WatchChooser({ title, onClose, onPlayHere, onPlay3D, onDownload, onOwnVideo, onOwnLink }: Props) {
  const poster = posterUrl(title.posterPath);
  const rows = [
    { key: 'play', icon: <Play size={19} fill="currentColor" />, title: 'Play now', desc: 'Instant streaming with a server picker', action: onPlayHere, primary: true },
    { key: '3d', icon: <Boxes size={19} />, title: 'Watch in 3D Theatre', desc: 'Recliners, shared screen, snacks & watch party', action: onPlay3D },
    { key: 'download', icon: <Download size={19} />, title: 'Download', desc: title.anime ? 'Zokoanime download hub' : 'Nxsha download hub', action: onDownload },
    { key: 'ownVideo', icon: <Upload size={19} />, title: 'Play my own video', desc: 'A local file up to 3 GB, on the big screen', action: onOwnVideo },
    { key: 'ownLink', icon: <Link2 size={19} />, title: 'Play my own link', desc: 'A direct MP4 / WebM URL', action: onOwnLink },
  ];

  return (
    <div className="watch-chooser-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="watch-chooser-sheet" role="dialog" aria-modal="true" aria-label={`How do you want to watch ${title.title}?`}>
        <button className="detail-close-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="watch-chooser-head">
          <span className="watch-chooser-poster">{poster ? <img src={poster} alt="" /> : null}</span>
          <div className="watch-chooser-headtext">
            <span className="watch-chooser-eyebrow">HOW DO YOU WANT TO WATCH?</span>
            <h3 className="watch-chooser-title">{title.title}</h3>
            <span className="watch-chooser-sub">{title.year || 'TBA'} · {title.anime ? 'Anime' : title.mediaType === 'movie' ? 'Movie' : 'Series'}</span>
          </div>
        </div>
        <div className="watch-chooser-list">
          {rows.map((row) => (
            <button key={row.key} className={`watch-row ${row.primary ? 'primary' : ''}`} onClick={row.action}>
              <span className="watch-row-icon">{row.icon}</span>
              <span className="watch-row-text"><strong>{row.title}</strong><small>{row.desc}</small></span>
              <ChevronRight size={17} className="watch-row-arrow" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
