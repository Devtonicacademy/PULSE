'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { applyTheme } from '../src/theme/applyTheme';

// The whole app is browser-only (maps, geolocation, WebGL, Firebase), so it never renders on the server
const App = dynamic(() => import('../src/App'), { ssr: false });

if (typeof document !== 'undefined') applyTheme();

export default function ClientRoot() {
  useEffect(() => {
    // PWA service worker, production only
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      const register = () =>
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => console.log('[PULSE PWA] ServiceWorker registered with scope:', reg.scope))
          .catch((err) => console.error('[PULSE PWA] ServiceWorker registration failed:', err));
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }, []);

  return <App />;
}
