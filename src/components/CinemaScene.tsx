import { useEffect, useRef } from 'react';
import type { CinemaEngine } from '../cinema/CinemaEngine';
import type { CinemaSnapshot } from '../cinema/types';
import type { LayoutValidation } from '../cinema/world';

type Props = {
  onEngine: (engine: CinemaEngine | null) => void;
  onUpdate: (snapshot: CinemaSnapshot) => void;
  onReady: () => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
  onValidation: (validation: LayoutValidation) => void;
};

export default function CinemaScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    let engine: CinemaEngine | null = null;
    void import('../cinema/CinemaEngine').then(({ CinemaEngine: Engine }) => {
      if (cancelled || !host.current) return;
      engine = new Engine(host.current, {
        onUpdate: (snapshot) => latest.current.onUpdate(snapshot),
        onReady: () => latest.current.onReady(),
        onMessage: (message) => latest.current.onMessage(message),
        onValidation: (validation) => latest.current.onValidation(validation),
      });
      latest.current.onEngine(engine);
    }).catch((error: unknown) => {
      console.error(error);
      if (!cancelled) latest.current.onError('This cinema needs WebGL 2. Please enable hardware acceleration or try a recent version of Chrome, Safari, or Firefox.');
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      latest.current.onEngine(null);
    };
  }, []);

  return <div ref={host} className="cinema-canvas" />;
}