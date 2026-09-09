import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Info, LoaderCircle, Maximize, RotateCcw } from 'lucide-react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot } from '../cinema/types';
import { serverName, serversFor } from '../catalog/servers';

export default function ProviderPlayer({ engine, snapshot }: { engine: CinemaEngine | null; snapshot: CinemaSnapshot }) {
  const dock = useRef<HTMLDivElement>(null);
  const fullscreen = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    engine?.setProviderDock(dock.current);
    return () => engine?.setProviderDock(null);
  }, [engine]);
  const embed = snapshot.embed;
  if (!embed) return null;
  const server = serversFor(embed.selection.anime).find((item) => item.key === embed.selection.server);
  const openFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (fullscreen.current?.requestFullscreen) await fullscreen.current.requestFullscreen();
      else setError('Fullscreen is not available in this browser. Use the provider controls instead.');
    } catch { setError('This browser could not enter fullscreen.'); }
  };
  return <div className="external-provider-player">
    <div className="provider-player-title"><span><span className="connection-dot" />Server {server?.number} / {serverName(embed.selection.server)}</span><span>EXTERNAL PLAYER / {embed.selection.preferences.sandbox ? 'SANDBOXED' : 'UNSANDBOXED'}</span></div>
    <div ref={fullscreen} className="provider-player-frame"><div ref={dock} className="provider-player-dock" />{snapshot.providerStatus === 'opening' && <div className="provider-loading"><LoaderCircle className="spin" size={21} /><span>Opening this server...</span></div>}</div>
    <div className="provider-player-actions"><button className="text-button" onClick={() => engine?.reloadProvider()}><RotateCcw size={14} />Reload this server</button><a href={embed.url} target="_blank" rel="noopener noreferrer">Open provider<ExternalLink size={13} /></a><button className="icon-button" onClick={() => void openFullscreen()} title="Fullscreen provider player" aria-label="Fullscreen provider player"><Maximize size={17} /></button></div>
    {(snapshot.providerStatus === 'slow' || snapshot.providerStatus === 'error') && <p className="form-error" role="alert">{snapshot.providerStatus === 'error' ? 'This provider reported an error.' : 'This provider is taking longer than expected.'} Reload it or pick another server. No other server has been requested.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="external-player-notice"><Info size={15} /><span>Use the controls inside this player. A loaded frame does not guarantee a playable video. Watch Party shares the title, episode, and server, <strong>not this provider's play/pause or position.</strong> Screen glow is an approximation for external embeds.</span></p>
  </div>;
}