import { useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, Check, Footprints, PersonStanding } from 'lucide-react';
import type { CinemaSnapshot, PlayerProfile } from '../cinema/types';
import { cleanProfile, initials, OUTFITS } from '../watch-party/profile';

export function PlayerAvatar({ profile, className = '' }: { profile: PlayerProfile; className?: string }) {
  return <span className={`player-avatar ${className}`} style={{ '--player-color': profile.color } as CSSProperties} aria-hidden="true">{initials(profile.name)}</span>;
}

function AvatarPortrait({ color }: { color: string }) {
  return <svg viewBox="0 0 200 210" className="avatar-portrait" aria-label="Preview of your cinema player" role="img">
    <defs><linearGradient id="avatar-jacket-light" x1="0" y1="0" x2="1" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0.6" /></linearGradient></defs>
    <ellipse cx="100" cy="192" rx="56" ry="10" fill="#050a0b" opacity="0.7" />
    <ellipse cx="100" cy="194" rx="67" ry="13" stroke="#ae9161" strokeOpacity="0.28" fill="none" />
    <rect x="75" y="125" width="23" height="56" rx="5" fill="#394747" /><rect x="104" y="125" width="23" height="56" rx="5" fill="#303c3c" />
    <rect x="73" y="175" width="27" height="14" rx="4" fill="#c7bda7" /><rect x="103" y="175" width="28" height="14" rx="4" fill="#b3aa94" />
    <rect x="73" y="176" width="27" height="8" rx="3" fill="#353832" /><rect x="103" y="176" width="28" height="8" rx="3" fill="#30352f" />
    <rect x="68" y="66" width="64" height="68" rx="12" fill="url(#avatar-jacket-light)" />
    <path d="M101 77v51" stroke="#151e1e" strokeOpacity="0.25" strokeWidth="2" /><path d="M81 106h12m18 0h12" stroke="#101d1d" strokeOpacity="0.24" />
    <rect x="47" y="72" width="19" height="62" rx="8" fill={color} transform="rotate(5 56 90)" /><rect x="134" y="72" width="19" height="62" rx="8" fill={color} transform="rotate(-5 143 90)" />
    <rect x="46" y="129" width="17" height="15" rx="5" fill="#b88c6c" /><rect x="137" y="129" width="17" height="15" rx="5" fill="#a97b5e" />
    <rect x="92" y="58" width="18" height="19" rx="5" fill="#b18868" />
    <rect x="76" y="24" width="49" height="43" rx="12" fill="#c49b78" />
    <path d="M74 38V26c0-10 10-14 25-14 18 0 28 7 28 20v10l-8-7-4-7c-10 4-24 4-33 2l-3 12-5-4Z" fill="#332b26" />
    <path d="M87 45h4m18 0h4" stroke="#352c24" strokeWidth="3" strokeLinecap="round" /><path d="M96 56c3 2 7 2 10 0" stroke="#946747" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>;
}

type Props = { profile: PlayerProfile; snapshot: CinemaSnapshot; canFollow: boolean; onSave: (profile: PlayerProfile) => void; onFollow: () => void; onClose: () => void };

export default function PlayerProfilePanel({ profile, snapshot, canFollow, onSave, onFollow, onClose }: Props) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const [error, setError] = useState('');
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Give your player a name before saving.'); return; }
    onSave(cleanProfile({ name, color }));
    onClose();
  };
  return <>
    <div className="panel-heading"><span className="eyebrow">YOUR PLAYER</span><h2 id="panel-heading">A little more you.</h2><p>Your presence in the cinema. No account required.</p></div>
    <div className="player-profile-preview"><AvatarPortrait color={color} /><div><span className="detail-eyebrow">IN THE CINEMA</span><h3>{name.trim() || 'Your player'}</h3><p><PersonStanding size={13} />{snapshot.mode === 'seated' ? `Settled into ${snapshot.seatId}` : snapshot.mode === 'walking' ? `On the way to ${snapshot.seatId}` : 'Ready to explore'}</p></div></div>
    <form onSubmit={save} className="player-profile-form">
      <label className="field-label" htmlFor="player-name">DISPLAY NAME</label><input className="cinema-input" id="player-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} maxLength={24} autoComplete="nickname" placeholder="What should we call you?" required />
      <fieldset className="outfit-picker"><legend className="field-label">YOUR JACKET</legend><div>{OUTFITS.map((outfit) => <label key={outfit.color} className={`outfit-option ${color === outfit.color ? 'is-selected' : ''}`}><input type="radio" name="player-outfit" value={outfit.color} checked={color === outfit.color} onChange={() => setColor(outfit.color)} /><span style={{ backgroundColor: outfit.color }}>{color === outfit.color && <Check size={16} />}</span><small>{outfit.name}</small></label>)}</div></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button full-width" type="submit">Save my player<Check size={16} /></button>
    </form>
    <button className="text-button profile-follow" disabled={!canFollow} onClick={() => { if (name.trim()) onSave(cleanProfile({ name, color })); onFollow(); }}><Footprints size={16} />Walk with my player<ArrowRight size={15} /></button>
    <p className="panel-footnote">WASD to move. Drag to look. E to sit or stand.<br />On mobile, use the on-screen thumbstick.</p>
  </>;
}