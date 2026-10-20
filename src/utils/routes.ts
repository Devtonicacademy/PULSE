// The app's pages and their URLs, so a refresh, a shared link and the back button all land on the same page
export type AppTab = 'map' | 'discover' | 'create' | 'notifications' | 'profile' | 'business' | 'settings' | 'setup';

/** A page that has a URL ("create" is a dialog over the current page and has none) */
export type PageTab = Exclude<AppTab, 'create'>;

const TAB_PATHS: Record<PageTab, string> = {
  map: '/',
  discover: '/discover',
  notifications: '/alerts',
  profile: '/profile',
  business: '/business',
  settings: '/settings',
  setup: '/setup'
};

/** The URL of a page. "create" is a dialog over the current page, so it has no URL of its own */
export function pathForTab(tab: AppTab): string | null {
  return tab === 'create' ? null : TAB_PATHS[tab];
}

/** The page a URL shows; anything unknown (including /map) shows the map */
export function tabForPath(pathname: string | null | undefined): PageTab {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  const found = (Object.keys(TAB_PATHS) as PageTab[]).find((tab) => TAB_PATHS[tab] === clean);
  return found ?? 'map';
}

/** The browser tab title for a page */
export const PAGE_TITLES: Record<PageTab, string> = {
  map: 'Map',
  discover: 'Discover',
  notifications: 'Alerts',
  profile: 'Profile',
  business: 'Business',
  settings: 'Settings',
  setup: 'Set up'
};
