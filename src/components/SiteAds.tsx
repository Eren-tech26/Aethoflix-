import { useEffect, useRef } from 'react';

// Bottom-only Adsterra placements for the movie site. Never mount inside the 3D theatre.
export default function SiteAds() {
  const banner = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as Window & { atOptions?: Record<string, unknown> };
    w.atOptions = {
      key: '23ba717e41a1b5c6a1a275f8038c8b73',
      format: 'iframe',
      height: 300,
      width: 160,
      params: {},
    };
    const s1 = document.createElement('script');
    s1.src = 'https://www.highrevenueformat.com/23ba717e41a1b5c6a1a275f8038c8b73/invoke.js';
    s1.async = true;
    banner.current?.appendChild(s1);

    const host = document.createElement('div');
    host.id = 'container-abcf89be3e7a63647edf6c667994c536';
    native.current?.appendChild(host);
    const s2 = document.createElement('script');
    s2.src = 'https://pl30567173.profitableratecpmnetwork.com/abcf89be3e7a63647edf6c667994c536/invoke.js';
    s2.async = true;
    s2.dataset.cfasync = 'false';
    native.current?.appendChild(s2);

    return () => {
      if (banner.current) banner.current.innerHTML = '';
      if (native.current) native.current.innerHTML = '';
    };
  }, []);

  return (
    <aside className="site-ads" aria-label="Sponsored">
      <div className="site-ads-label">Sponsored</div>
      <div className="site-ads-row">
        <div className="site-ad-slot banner" ref={banner} />
        <div className="site-ad-slot native" ref={native} />
      </div>
    </aside>
  );
}
