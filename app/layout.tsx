import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../src/index.css';
import ClientRoot from './ClientRoot';

export const metadata: Metadata = {
  title: "PULSE — Never miss what's happening nearby",
  description: 'PULSE — Never miss what\'s happening nearby. Real-time location-based social discovery.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  },
  appleWebApp: { capable: true, title: 'PULSE', statusBarStyle: 'black-translucent' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0A0E17'
};

// Apply the saved or browser theme before first paint, so light mode never flashes dark
const THEME_SCRIPT = `(function () {
  try {
    var saved = localStorage.getItem('pulse-theme');
    var pref = saved === 'light' || saved === 'dark' ? saved : 'system';
    var dark = pref === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : pref === 'dark';
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0A0E17' : '#F4F6FA');
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script edits <html> class and color-scheme before React hydrates
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-[#0A0E17] text-slate-100 antialiased selection:bg-accent-500/30 selection:text-white overflow-hidden">
        {/* The app lives in the layout so it stays mounted (map, state) while the URL changes between pages */}
        <ClientRoot />
        {children}
      </body>
    </html>
  );
}
