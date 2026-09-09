import { useEffect, useState, type FormEvent } from 'react';
import { Armchair, ArrowRight, Check, CheckCircle2, Copy, Crown, ExternalLink, Film, Globe2, Link, LoaderCircle, LogOut, Monitor, Play, Settings2, Users, X } from 'lucide-react';
import type { CinemaSnapshot, PlayerProfile } from '../cinema/types';
import type { WatchPartyController } from '../watch-party/useWatchParty';
import { inviteUrl } from '../watch-party/LocalParty';
import { cleanProfile } from '../watch-party/profile';
import { PlayerAvatar } from './PlayerProfilePanel';

type Props = {
  party: WatchPartyController;
  profile: PlayerProfile;
  snapshot: CinemaSnapshot;
  ready: boolean;
  onProfile: (profile: PlayerProfile) => void;
  onPlayer: () => void;
  onScreen: () => void;
  onPickFilm: () => void;
  onSeats: () => void;
  onStart: () => void;
  onClose: () => void;
};

function readDraft(): { name: string; title: string; tab: 'create' | 'join' } | null {
  try {
    const value = JSON.parse(localStorage.getItem('aethoflix-party-draft') ?? 'null') as { name?: unknown; title?: unknown; tab?: unknown } | null;
    if (value && typeof value === 'object') {
      return { name: typeof value.name === 'string' ? value.name.slice(0, 24) : '', title: typeof value.title === 'string' ? value.title.slice(0, 48) : '', tab: value.tab === 'join' ? 'join' : 'create' };
    }
  } catch { /* The draft is optional and can be re-entered. */ }
  return null;
}
function writeDraft(draft: { name: string; title: string; tab: 'create' | 'join' }) {
  try { localStorage.setItem('aethoflix-party-draft', JSON.stringify(draft)); } catch { /* The draft is optional. */ }
}
function clearDraft() {
  try { localStorage.removeItem('aethoflix-party-draft'); } catch { /* The draft is optional. */ }
}

export default function WatchPartyPanel(props: Props) {
  const { party, profile, snapshot, ready } = props;
  const { state } = party;
  const initialCode = new URLSearchParams(window.location.search).get('party') ?? '';
  const draft = readDraft();
  const [tab, setTab] = useState<'create' | 'join'>(initialCode ? 'join' : draft?.tab ?? 'create');
  const [name, setName] = useState(draft?.name ?? profile.name);
  const [title, setTitle] = useState(draft?.title ?? 'A little movie night');
  const [code, setCode] = useState(initialCode);
  const connected = state.status === 'connected' && state.room;
  useEffect(() => { if (!connected) writeDraft({ name, title, tab }); }, [name, title, tab, connected]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isHost = state.room?.hostId === state.selfId;
  const self = state.members.find((member) => member.id === state.selfId);
  const readyCount = state.members.filter((member) => member.ready).length;
  const mediaReady = !snapshot.loading && !snapshot.playbackError && !party.mediaError && (!connected || state.source.id === snapshot.sourceId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Enter your display name so the party knows who is joining.'); return; }
    setError(''); setBusy(true);
    const player = cleanProfile({ ...profile, name });
    props.onProfile(player);
    try {
      if (tab === 'create') party.create(title, player);
      else await party.join(code, player);
      clearDraft();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'The party could not be opened. Please try again.'); }
    finally { setBusy(false); }
  };

  const copyInvitation = async () => {
    if (!state.room) return;
    setError('');
    try { await navigator.clipboard.writeText(inviteUrl(state.room.code)); setCopied(true); }
    catch { setError('Copy is unavailable in this browser. Select the invitation link below and copy it manually.'); }
  };

  if (!connected) return <>
    <div className="panel-heading"><span className="eyebrow">AETHOFLIX WATCH PARTY</span><h2 id="panel-heading">Good stories.<br />Better company.</h2><p>One private cinema. Ten places. A shared moment.</p></div>
    <div className="party-tabs" role="tablist" aria-label="Watch party setup"><button type="button" role="tab" aria-selected={tab === 'create'} aria-controls="party-setup-form" onClick={() => { setTab('create'); setError(''); }} disabled={busy}><Users size={15} />Create a party</button><button type="button" role="tab" aria-selected={tab === 'join'} aria-controls="party-setup-form" onClick={() => { setTab('join'); setError(''); }} disabled={busy}><Link size={14} />Join a party</button></div>
    <form className="party-setup-form" id="party-setup-form" onSubmit={submit}>
      <label className="field-label" htmlFor="party-display-name">YOUR NAME</label><div className="party-name-input"><PlayerAvatar profile={{ ...profile, name }} /><input id="party-display-name" className="cinema-input" placeholder="What should we call you?" value={name} onChange={(event) => setName(event.target.value)} maxLength={24} autoComplete="nickname" required disabled={busy} /></div>
      {tab === 'create' ? <><label className="field-label" htmlFor="party-title">GIVE YOUR EVENING A NAME</label><input id="party-title" className="cinema-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={48} placeholder="A little movie night" disabled={busy} /><button type="button" className="party-source-row" onClick={props.onScreen} disabled={!ready}><Film size={20} /><span><small>ON YOUR SCREEN</small><strong>{snapshot.filmTitle}</strong></span><span className="source-change">Change<ArrowRight size={13} /></span></button><button type="button" className="party-tmdb-row" onClick={props.onPickFilm} disabled={!ready || busy}><Globe2 size={18} strokeWidth={1.5} /><span><strong>Pick from the TMDB collection</strong><small>Search movies, series &amp; anime, then choose your server</small></span><ArrowRight size={15} /></button></> : <><label className="field-label" htmlFor="party-code">ROOM CODE OR INVITATION LINK</label><input id="party-code" className="cinema-input room-code-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. K7MN2A" autoComplete="off" spellCheck={false} required disabled={busy} /></>}
      <div className="local-party-note"><span className="local-note-symbol"><MonitorIcon /></span><div><strong>A real local watch party.</strong><p>Join from another tab in this same browser and profile. Players and seats stay in sync. {snapshot.embed ? 'External sources share the title and server only, not playback timing.' : 'Direct-video playback is synchronized.'} Cross-device rooms are not connected yet.</p></div></div>
      {(error || state.error) && <p className="form-error" role="alert">{error || state.error}</p>}
      <button type="submit" className="primary-button full-width" disabled={!ready || busy || snapshot.loading}>{busy ? <LoaderCircle className="spin" size={17} /> : <Users size={16} />}{busy ? 'Finding your cinema...' : tab === 'create' ? 'Create watch party' : 'Join the cinema'}{!busy && <ArrowRight size={16} />}</button>
    </form>
    <p className="panel-footnote">No account. No upload. Keep the host tab open.</p>
  </>;

  const room = state.room!;
  return <>
    <div className="panel-heading party-room-heading"><span className="eyebrow"><span className="connection-dot" />WATCH PARTY / LOCAL PREVIEW</span><h2 id="panel-heading">{room.title}</h2><p>{room.screening ? 'The story has started. Find your favorite seat.' : 'Your little corner of the cinema is open.'}</p></div>
    <div className="room-invitation"><div><span className="field-label">YOUR ROOM CODE</span><strong>{room.code}</strong></div><button className={`secondary-button ${copied ? 'is-copied' : ''}`} onClick={() => void copyInvitation()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Link copied' : 'Copy invite'}</button></div>
    <div className="invitation-link-row"><input aria-label="Invitation link, available for manual copying" value={inviteUrl(room.code)} readOnly onFocus={(event) => event.target.select()} /><a href={inviteUrl(room.code)} target="_blank" rel="noopener noreferrer" title="Open this party in another tab of the same browser">Open guest tab<ExternalLink size={12} /></a></div>
    <p className="local-room-caption">Same browser and profile only. Keep the host tab open.</p>
    <div className="party-members-title"><span className="field-label">IN THE CINEMA</span><span>{state.members.length} / 10 places</span></div>
    <ul className="party-members" aria-label="People in your watch party">{state.members.map((member) => <li key={member.id}><PlayerAvatar profile={member} /><div className="member-details"><strong>{member.name}{member.id === state.selfId && <span> (you)</span>}{member.id === room.hostId && <Crown size={12} />}</strong><small>{member.id === room.hostId ? 'Host' : 'Guest'}<span />{member.seatId ? `Seat ${member.seatId}` : 'Exploring'}</small></div><span className={`member-readiness ${member.ready ? 'is-ready' : ''}`}>{member.ready && <Check size={12} />}{member.ready ? 'Ready' : 'Settling in'}</span></li>)}</ul>
    {state.members.length === 1 && <p className="party-empty-guests"><Users size={16} />Just you, for now. Open a guest tab to try it together.</p>}
    <div className="party-personal-actions"><button onClick={props.onSeats}><Armchair size={16} /><span>{snapshot.seatId ? `Your seat: ${snapshot.seatId}` : 'Choose your seat'}</span><ArrowRight size={13} /></button><button onClick={props.onScreen} aria-label="Open the screen player"><Monitor size={16} /></button><button onClick={props.onPlayer} aria-label="Customize your player"><Settings2 size={16} /></button></div>
    <button className="party-source-row in-room-source" onClick={props.onPickFilm}><Film size={19} /><span><small>{snapshot.embed ? 'EXTERNAL PLAYER / SELECTION SHARED' : isHost ? 'YOU PICK THE SHARED FILM' : 'HOST PICKS THE SHARED FILM'}</small><strong>{state.source.title}</strong></span><span className="source-change">TMDB collection<ArrowRight size={13} /></span></button>
    {(party.mediaError || snapshot.playbackError) && <p className="form-error" role="alert">{party.mediaError || snapshot.playbackError}</p>}
    {!room.screening && <div className="party-ready-setting"><div><strong>{self?.ready ? 'All settled in.' : 'Ready when you are.'}</strong><p>{readyCount} of {state.members.length} {state.members.length === 1 ? 'player' : 'players'} ready to watch.</p></div><button className={`toggle-switch ${self?.ready ? 'is-on' : ''}`} role="switch" aria-checked={!!self?.ready} aria-label="I am ready to watch" disabled={!mediaReady} onClick={() => party.setReady(!self?.ready)}><span /></button></div>}
    {!room.screening && isHost ? <><button className="primary-button full-width" disabled={!mediaReady || readyCount !== state.members.length} onClick={props.onStart}><Play size={16} />{snapshot.embed ? 'Enter the screening' : 'Start watching together'}<ArrowRight size={16} /></button><p className="panel-footnote">{snapshot.embed ? 'Everyone starts playback using their provider controls. External play/pause and position are not synchronized.' : readyCount !== state.members.length ? 'Everyone needs to be ready before the story starts.' : 'Play, pause, and seek are synchronized by the host.'}</p></> : room.screening ? <button className="primary-button full-width" onClick={props.onClose}><Play size={16} />Back to the cinema<ArrowRight size={16} /></button> : <p className="guest-waiting"><CheckCircle2 size={16} />{snapshot.embed ? 'Use the provider controls to start the video in your tab.' : self?.ready ? 'You are ready. Your host will start the screening.' : 'Switch on Ready above when you are comfortable.'}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {confirmLeave ? <div className="leave-confirmation"><p>{isHost ? 'End the party for everyone?' : 'Leave this watch party?'}</p><button onClick={() => { party.leave(); clearDraft(); setConfirmLeave(false); }}>{isHost ? 'End party' : 'Leave party'}<LogOut size={13} /></button><button onClick={() => setConfirmLeave(false)} aria-label="Cancel leaving"><X size={14} /></button></div> : <button className="text-button leave-party" onClick={() => setConfirmLeave(true)}><LogOut size={14} />{isHost ? 'End watch party' : 'Leave watch party'}</button>}
  </>;
}

function MonitorIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 22h8m-4-4v4M7 8h10M7 12h6" /></svg>;
}