import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { PulseMap } from '../map/PulseMap';
import { HotspotBottomSheet } from '../map/HotspotBottomSheet';
import { AreaSheet } from '../map/AreaSheet';
import type { MapResume } from '../map/mapResume';
import { DiscoverFeed } from '../feed/DiscoverFeed';
import { CreateMomentModal } from '../create/CreateMomentModal';
import { MomentCommentsDrawer } from '../comments/MomentCommentsDrawer';
import { TemporaryCommunitiesList } from '../communities/TemporaryCommunitiesList';
import { BusinessDashboard } from '../business/BusinessDashboard';
import { GamificationProfile } from '../profile/GamificationProfile';
import { NotificationsDrawer } from '../notifications/NotificationsDrawer';
import { ReportModal } from '../modals/ReportModal';
import { PWAInstallBanner } from '../pwa/PWAInstallBanner';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE } from '../ui/ResponsiveSheet';
import { AppTour } from '../onboarding/AppTour';
import { SettingsPage } from '../settings/SettingsPage';
import { PAGE_TITLES } from '../../utils/routes';
import { AuthModal } from '../auth/AuthModal';
import { LocationNotice } from './LocationNotice';
import { LocationStatusLine } from './LocationStatusLine';
import { getApproximateAreaName } from '../../utils/geoUtils';
import { planHubMove } from '../../utils/hubFollow';
import { hubNameFor, shortHubName } from '../../services/locationService';
import type { LocationReason, UserCoordinates } from '../map/PulseMap';
import { MAP_ORIGIN_ID, setMapOrigin } from '../../utils/mapProjection';
import { originFor } from '../../utils/mapOrigin';
import { CoverageStatus, startMapCoverage } from '../../services/mapCoverageService';
import {
  Map as MapIcon,
  Compass,
  Plus,
  Bell,
  User,
  MapPin,
  ChevronDown,
  X,
  Briefcase,
  Download,
  Layers,
  Crosshair,
  LogIn,
  SlidersHorizontal,
  Settings,
  Palette,
  Monitor,
  Sun,
  Moon
} from 'lucide-react';

// Three.js only downloads when someone opens the Pulse 3D explore mode
const Pulse3DMap = lazy(() => import('../map/Pulse3DMap'));
const SetupWizard = lazy(() => import('../onboarding/SetupWizard'));

// 'map' is the MapLibre map; 'pulse3d' is the walkable Three.js city
type MapEngine = 'map' | 'pulse3d';

const MAP_ENGINE_LABELS: Record<MapEngine, { short: string; long: string }> = {
  map: { short: 'Map', long: 'Pulse Map (OpenStreetMap)' },
  pulse3d: { short: 'Walk in 3D', long: 'Pulse 3D (explore and walk)' }
};

export const AppShell: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentLocation,
    setCurrentLocation,
    currentPulseScore,
    currentZoneName,
    notifications,
    isBusinessMode,
    setIsBusinessMode,
    selectedMoment,
    selectedZone,
    setSelectedMoment,
    moments,
    activeToast,
    dismissToast,
    userProfile,
    useBrowserLocation,
    isLocating,
    filteredMoments,
    isAuthModalOpen,
    setIsAuthModalOpen,
    isAuthenticated,
    isSurveyOpen,
    avatarConfig
  } = usePulse();

  const { isInstalled } = usePWAInstall();

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeCommentMomentId, setActiveCommentMomentId] = useState<string | null>(null);
  const [activeReportMomentId, setActiveReportMomentId] = useState<string | null>(null);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [forceShowInstallPrompt, setForceShowInstallPrompt] = useState(false);
  const [mapEngine, setMapEngine] = useState<MapEngine>('pulse3d');
  // Where the user stands on the open map, so switching maps keeps the spot instead of resetting it
  const mapPosition = useRef<MapResume | null>(null);
  const resumeOnNextMap = useRef(false);
  const switchEngine = (next: MapEngine) => {
    resumeOnNextMap.current = mapPosition.current !== null;
    setMapEngine(next);
  };
  useEffect(() => {
    resumeOnNextMap.current = false;
  }, [mapEngine]);
  const [navigationDestination, setNavigationDestination] = useState<{
    latitude: number;
    longitude: number;
    title: string;
    category?: string;
  } | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Business mode follows the page: /business is the merchant portal, /profile the resident profile
  useEffect(() => {
    if (activeTab === 'business' && !isBusinessMode) setIsBusinessMode(true);
    if (activeTab === 'profile' && isBusinessMode) setIsBusinessMode(false);
  }, [activeTab, isBusinessMode, setIsBusinessMode]);

  // A new sign-in opens the setup wizard, which is its own page
  useEffect(() => {
    if (isSurveyOpen && activeTab !== 'setup') setActiveTab('setup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSurveyOpen]);

  useEffect(() => {
    document.title = `${PAGE_TITLES[activeTab as keyof typeof PAGE_TITLES] ?? 'Map'} · PULSE`;
  }, [activeTab]);

  // The 3D map measures everything from an origin: Victoria Island near Lagos, a grid point
  // elsewhere. It is set while rendering, before the map builds, and a different origin
  // (the user is somewhere else) rebuilds the map through its key.
  const mapOrigin = originFor(currentLocation.latitude, currentLocation.longitude);
  if (mapOrigin.id !== MAP_ORIGIN_ID) setMapOrigin(mapOrigin, mapOrigin.id);

  // Download the 40 km around the user's exact coordinates once their location is known
  const [coverage, setCoverage] = useState<CoverageStatus | null>(null);
  const coverageStop = useRef<(() => void) | null>(null);
  const coverageFor = useRef('');
  const locationRef = useRef(currentLocation);
  locationRef.current = currentLocation;
  const beginCoverage = useCallback((latitude: number, longitude: number) => {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    if (coverageFor.current === key) return;
    coverageFor.current = key;
    coverageStop.current?.();
    coverageStop.current = startMapCoverage(latitude, longitude, setCoverage);
  }, []);
  useEffect(() => () => coverageStop.current?.(), []);
  // True once the user picked a hub by hand: the automatic look at startup then leaves it alone
  const hubPinned = useRef(false);
  // A real GPS position has been seen this session (an approximate one must not replace it later)
  const haveGps = useRef(false);
  const handleLocationFound = useCallback(
    (coords: UserCoordinates, reason: LocationReason = 'auto') => {
      // The active hub follows the real position (also inside the Lagos area, where the map origin
      // does not change), unless the user chose a hub on purpose. "Find me" always wins.
      const decision = planHubMove(locationRef.current, coords, hubPinned.current, reason, haveGps.current);
      if (coords.source === 'gps') haveGps.current = true;
      if (decision.unpin) hubPinned.current = false;
      if (decision.move) {
        const fix = { source: coords.source ?? 'gps', place: coords.place };
        setCurrentLocation({
          name: hubNameFor(fix, getApproximateAreaName(coords.latitude, coords.longitude)),
          latitude: coords.latitude,
          longitude: coords.longitude
        });
      }
      beginCoverage(coords.latitude, coords.longitude);
    },
    [beginCoverage, setCurrentLocation]
  );
  const chooseHub = (loc: { name: string; latitude: number; longitude: number }) => {
    hubPinned.current = true;
    setCurrentLocation(loc);
  };
  // "Use my location": always the real position, even if a hub was picked before
  const findMe = () => {
    hubPinned.current = false;
    useBrowserLocation();
  };
  // No GPS: cover the active hub instead
  const handleLocationError = useCallback(
    () => beginCoverage(locationRef.current.latitude, locationRef.current.longitude),
    [beginCoverage]
  );

  // The moment detail sheet lives on the map tab, so opening a moment always lands there
  const openMomentOnMap = (momentId: string) => {
    const moment =
      filteredMoments.find((m) => m.id === momentId) ?? moments.find((m) => m.id === momentId);
    if (moment) setSelectedMoment(moment);
    setActiveTab('map');
  };

  const PRESET_LOCATIONS = [
    { name: 'Victoria Island, Lagos', latitude: 6.4281, longitude: 3.4219 },
    { name: 'Lekki Phase 1, Lagos', latitude: 6.4474, longitude: 3.4730 },
    { name: 'Yaba Tech Hub, Lagos', latitude: 6.5095, longitude: 3.3711 },
    { name: 'Freedom Park, Lagos Island', latitude: 6.4530, longitude: 3.3980 },
    { name: 'University of Lagos (Akoka)', latitude: 6.5168, longitude: 3.3976 },
    { name: 'Alaba Market, Ojo', latitude: 6.4572, longitude: 3.1915 },
    { name: 'Agbara Industrial Estate', latitude: 6.5148, longitude: 2.8855 }
  ];

  // Navigation runs on whichever map is open; it opens on the map tab
  const startNavigation = (destination: NonNullable<typeof navigationDestination>) => {
    setNavigationDestination(destination);
    setActiveTab('map');
  };

  // Helper renderer for active tab content
  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'map':
        {
          const mapProps = {
            defaultCenter: [currentLocation.longitude, currentLocation.latitude] as [number, number],
            defaultZoom: 18.2,
            pitch: 72,
            bearing: 0,
            initialCameraMode: 'fpv' as const,
            enable3dBuildings: true,
            autoGeolocate: true,
            showUserMarker: true,
            avatarConfig,
            onLocationFound: handleLocationFound,
            onLocationError: handleLocationError,
            showNavigationControl: true,
            showGeolocateControl: true,
            show3dControls: true,
            moments: filteredMoments,
            onSelectMoment: setSelectedMoment,
            navigationDestination,
            onClearNavigation: () => setNavigationDestination(null),
            resumeFrom: resumeOnNextMap.current ? mapPosition.current : null,
            onPositionChange: (position: MapResume) => {
              mapPosition.current = position;
            },
            className: 'h-full'
          };
          const sheet = (
            <>
              <AreaSheet />
              {coverage && coverage.state !== 'done' && (
                <div
                  className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full glass-hud border border-white/10 text-xs font-bold text-slate-200 pointer-events-none"
                  title={`Downloading map data for ${coverage.radiusKm} km around you`}
                  role="status"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-400" />
                  {coverage.state === 'paused' ? 'Map data paused' : `Map data ${coverage.percent}%`}
                </div>
              )}
              <HotspotBottomSheet
                onOpenComments={(id) => setActiveCommentMomentId(id)}
                onOpenReport={(id) => setActiveReportMomentId(id)}
                onStartNavigation={startNavigation}
                onBackToMap={mapEngine === 'pulse3d' ? () => switchEngine('map') : undefined}
              />
            </>
          );
          if (mapEngine === 'pulse3d') {
            return (
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center text-xs text-signal-300 bg-[#05070d]">
                    Loading Pulse 3D…
                  </div>
                }
              >
                <div className="relative h-full">
                  <Pulse3DMap key={mapOrigin.id} {...mapProps} enableDynamicLighting>
                    {sheet}
                    {/* Always reachable: with a moment or zone open it moves to the top so the sheet never hides it */}
                    <button
                      onClick={() => switchEngine('map')}
                      className={`absolute right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-lg glass-hud border border-white/10 text-xs font-bold text-white shadow-2xl hover:bg-white/10 ${
                        selectedMoment || selectedZone
                          ? `top-16 ${selectedMoment ? 'max-sm:hidden' : ''}`
                          : 'bottom-[calc(var(--area-sheet-h,0px)+6rem)] transition-[bottom] duration-300'
                      }`}
                      title="Back to the map"
                    >
                      <MapIcon className="w-3.5 h-3.5 text-signal-400" />
                      <span>Back to map</span>
                    </button>
                  </Pulse3DMap>
                </div>
              </Suspense>
            );
          }
          return (
            <PulseMap {...mapProps} onWalkIn3D={() => switchEngine('pulse3d')}>
              {sheet}
            </PulseMap>
          );
        }
      case 'discover':
        return (
          <DiscoverFeed
            onOpenComments={(id) => setActiveCommentMomentId(id)}
            onOpenReport={(id) => setActiveReportMomentId(id)}
            onSelectCommunity={(id) => setActiveCommunityId(id)}
            onOpenMoment={openMomentOnMap}
            onNavigateMoment={startNavigation}
          />
        );
      case 'notifications':
        return (
          <NotificationsDrawer onSelectMoment={openMomentOnMap} />
        );
      case 'profile':
        return <GamificationProfile onOpenSettings={() => setActiveTab('settings')} />;
      case 'business':
        return <BusinessDashboard />;
      case 'settings':
        return (
          <SettingsPage mapEngine={mapEngine} onToggleMapEngine={() => switchEngine(mapEngine === 'map' ? 'pulse3d' : 'map')} />
        );
      default:
        return null;
    }
  };

  // Helper renderer for mobile/compact bottom navigation bar
  const renderBottomNav = () => (
    <nav className="relative z-40 shrink-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] [@media(max-height:500px)]:h-[calc(2.75rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] glass-bottom-bar px-2 sm:px-3 flex items-center justify-around">
      {/* 1. MAP (Default) */}
      <button
        onClick={() => setActiveTab('map')} data-tour="nav-map"
        className={`flex flex-col items-center justify-center flex-1 min-w-0 py-1 px-0.5 rounded-lg transition-all ease-apple ${
          activeTab === 'map'
            ? 'text-accent-400 bg-accent-500/10'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <MapIcon className={`w-5 h-5 ${activeTab === 'map' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[11px] font-medium mt-0.5 [@media(max-height:500px)]:hidden">Map</span>
      </button>

      {/* 2. DISCOVER */}
      <button
        onClick={() => setActiveTab('discover')} data-tour="nav-discover"
        className={`flex flex-col items-center justify-center flex-1 min-w-0 py-1 px-0.5 rounded-lg transition-all ease-apple ${
          activeTab === 'discover'
            ? 'text-accent-400 bg-accent-500/10'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Compass className={`w-5 h-5 ${activeTab === 'discover' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[11px] font-medium mt-0.5 [@media(max-height:500px)]:hidden">Discover</span>
      </button>

      {/* 3. CREATE (Center Raised Action) */}
      <div className="flex flex-col items-center justify-center px-1 shrink-0">
        <button
          onClick={() => setIsCreateOpen(true)} data-tour="nav-create"
          aria-label="Create live moment"
          className="w-12 h-12 [@media(max-height:500px)]:w-10 [@media(max-height:500px)]:h-10 shrink-0 rounded-full bg-accent-500 text-white flex items-center justify-center shadow-lg -mt-6 [@media(max-height:500px)]:-mt-2 hover:scale-105 active:scale-95 transition-all ease-apple ring-4 ring-[#0A0E17]/80"
          title="Create Live Moment"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
        <span className="text-[11px] font-medium text-slate-300 mt-0.5 [@media(max-height:500px)]:hidden">Create</span>
      </div>

      {/* 4. NOTIFICATIONS */}
      <button
        onClick={() => setActiveTab('notifications')} data-tour="nav-alerts"
        className={`relative flex flex-col items-center justify-center flex-1 min-w-0 py-1 px-0.5 rounded-lg transition-all ease-apple ${
          activeTab === 'notifications'
            ? 'text-accent-400 bg-accent-500/10'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Bell className={`w-5 h-5 ${activeTab === 'notifications' ? 'stroke-[2.5]' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-6 w-4 h-4 rounded-full bg-accent-500 text-white text-[11px] font-semibold flex items-center justify-center shadow-sm">
            {unreadCount}
          </span>
        )}
        <span className="text-[11px] font-medium mt-0.5 [@media(max-height:500px)]:hidden">Alerts</span>
      </button>

      {/* 5. PROFILE / BIZ */}
      <button
        onClick={() => setActiveTab(isBusinessMode ? 'business' : 'profile')} data-tour="nav-profile"
        className={`flex flex-col items-center justify-center flex-1 min-w-0 py-1 px-0.5 rounded-lg transition-all ease-apple ${
          (activeTab === 'profile' || activeTab === 'business')
            ? 'text-accent-400 bg-accent-500/10'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {isBusinessMode ? (
          <Briefcase className={`w-5 h-5 text-amber-400 ${activeTab === 'profile' || activeTab === 'business' ? 'stroke-[2.5]' : ''}`} />
        ) : (
          <User className={`w-5 h-5 ${activeTab === 'profile' || activeTab === 'business' ? 'stroke-[2.5]' : ''}`} />
        )}
        <span className="text-[11px] font-medium mt-0.5 [@media(max-height:500px)]:hidden">
          {isBusinessMode ? 'Business' : 'Profile'}
        </span>
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen w-full bg-[#070A11] text-slate-100 flex flex-col">
      {/* Responsive application shell (mobile, tablet, desktop) */}
      <div className="h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-[#0A0E17] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
          {/* 1. DESKTOP SIDEBAR NAVIGATION (Visible on screens >= 1024px) */}
          <aside className="hidden lg:flex w-64 xl:w-72 h-full flex-col shrink-0 glass-sidebar z-30 select-none px-5 py-6 [@media(max-height:760px)]:py-3 justify-between gap-6 [@media(max-height:760px)]:gap-3 relative overflow-y-auto">
            {/* Top Brand & Location */}
            <div className="space-y-5 [@media(max-height:760px)]:space-y-3">
              {/* Brand Logo */}
              <div className="flex items-center gap-3 pb-5 [@media(max-height:760px)]:pb-3 border-b border-white/10">
                <div className="w-8 h-8 rounded-md bg-accent-500 flex items-center justify-center font-semibold text-white shadow-lg">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-semibold text-base tracking-tight text-white">PULSE</span>
                    <span className="w-2 h-2 rounded-full bg-accent-500"></span>
                  </div>
                  <span className="text-[11px] tracking-wide text-slate-400 font-medium">
                    Live nearby
                  </span>
                </div>
              </div>

              {/* Active Zone / Location Card */}
              <div className="relative">
                <div className="p-3.5 rounded-lg glass-card-interactive border border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1 font-semibold">
                      <MapPin className="w-3 h-3 text-accent-400" /> Active Hub
                    </span>
                    <span className="text-slate-200 font-medium">Score {currentPulseScore}</span>
                  </div>
                  <button
                    onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                    className="w-full text-left font-bold text-xs text-white truncate flex items-center justify-between hover:text-accent-300 transition-colors"
                  >
                    <span className="truncate">{shortHubName(currentLocation.name)}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                  </button>
                  <LocationStatusLine className="mt-1.5" />
                </div>

                {/* Hub Selection Dropdown */}
                <AnimatePresence>
                {showLocationDropdown && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18, ease: EASE }} className="absolute top-full left-0 right-0 mt-2 z-50 origin-top rounded-lg glass-dropdown border border-white/10 p-2 shadow-2xl text-xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wide">
                      City hubs
                    </div>
                    {PRESET_LOCATIONS.map((loc) => (
                      <button
                        key={loc.name}
                        onClick={() => {
                          chooseHub(loc);
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                          currentLocation.name === loc.name
                            ? 'bg-accent-500/20 text-accent-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{loc.name}</span>
                        {currentLocation.name === loc.name && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-400"></span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        findMe();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 text-signal-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Use my location'}</span>
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              {/* Primary Call to Action Button */}
              <button
                onClick={() => setIsCreateOpen(true)} data-tour="nav-create"
                className="w-full py-2.5 px-4 rounded-md bg-accent-500 hover:bg-accent-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all ease-apple"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>New moment</span>
              </button>

              {/* Desktop Navigation Links */}
              <nav className="pt-3 space-y-1.5" aria-label="Primary">
                <button
                  onClick={() => setActiveTab('map')} data-tour="nav-map"
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ease-apple ${
                    activeTab === 'map'
                      ? 'bg-accent-500/15 text-accent-300'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <MapIcon className="w-4 h-4" />
                  <span>Map</span>
                </button>

                <button
                  onClick={() => setActiveTab('discover')} data-tour="nav-discover"
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ease-apple ${
                    activeTab === 'discover'
                      ? 'bg-accent-500/15 text-accent-300'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Discover</span>
                </button>

                <button
                  onClick={() => setActiveTab('notifications')} data-tour="nav-alerts"
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ease-apple ${
                    activeTab === 'notifications'
                      ? 'bg-accent-500/15 text-accent-300'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4" />
                    <span>Alerts</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent-500 text-white text-[11px] font-semibold">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab(isBusinessMode ? 'business' : 'profile')} data-tour="nav-profile"
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-[13px] font-semibold transition-all ease-apple ${
                    (activeTab === 'profile' || activeTab === 'business')
                      ? 'bg-accent-500/15 text-accent-300'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {isBusinessMode ? (
                    <Briefcase className="w-4 h-4 text-amber-400" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  <span>{isBusinessMode ? 'Business' : 'Profile'}</span>
                </button>
              </nav>
            </div>

            {/* Bottom Consolidated Control Dock & User Profile */}
            <div className="space-y-3 [@media(max-height:760px)]:space-y-2 pt-5 [@media(max-height:760px)]:pt-3 border-t border-white/10">
              {/* Consolidated Preferences Capsule */}
              <div className="p-3 rounded-lg glass-card space-y-2.5 text-xs">
                {/* Segmented Mode & Engine Controls in Compact Dual Grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setActiveTab(isBusinessMode ? 'profile' : 'business')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold transition-all ease-apple ${
                      isBusinessMode
                        ? 'bg-amber-500/20 text-amber-300 border border-white/10 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                    }`}
                    title="Toggle Merchant or Resident View"
                  >
                    <Briefcase className="w-3 h-3 text-amber-400" />
                    <span>{isBusinessMode ? 'Merchant' : 'Resident'}</span>
                  </button>

                  <button
                    onClick={() => switchEngine(mapEngine === 'map' ? 'pulse3d' : 'map')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold transition-all ease-apple ${
                      mapEngine === 'pulse3d'
                        ? 'bg-signal-500/20 text-signal-300 border border-white/10 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                    }`}
                    title="Switch between the map and Pulse 3D"
                  >
                    <Layers className="w-3 h-3 text-signal-400" />
                    <span>{mapEngine === 'map' ? 'Walk in 3D' : 'Back to map'}</span>
                  </button>
                </div>

                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1 py-1 px-1.5 rounded-md bg-accent-500/15 hover:bg-accent-500/25 text-accent-300 text-[11px] font-bold transition-all ease-apple"
                    title="Sign In or Create Account"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Sign In</span>
                  </button>
                )}
              </div>

              {/* User Profile Footer Card */}
              <div
                onClick={() => setActiveTab(isBusinessMode ? 'business' : 'profile')}
                className="p-2 rounded-lg glass-card-interactive flex items-center gap-2.5 cursor-pointer"
              >
                <img
                  src={userProfile.avatar}
                  alt={userProfile.username}
                  className="w-9 h-9 rounded-md object-cover border border-white/10 shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">@{userProfile.username}</div>
                  <div className="text-[11px] text-slate-300 flex items-center gap-1">
                    <span className="text-amber-400 font-semibold">Rep {userProfile.reputation}</span>
                    <span>· Tier 3</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('settings');
                  }}
                  aria-label="Open settings"
                  title="Settings"
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* 2. MAIN APP CONTENT CONTAINER */}
          <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
            {/* Mobile / Tablet Compact Top Header (Hidden on lg: desktop) */}
            <header className="lg:hidden px-3.5 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] [@media(max-height:500px)]:pb-1 [@media(max-height:500px)]:pt-[max(0.25rem,env(safe-area-inset-top))] shrink-0 glass-header flex items-center justify-between gap-2 z-30 relative">
              {/* Logo & Brand */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-md bg-accent-500 flex items-center justify-center font-semibold text-sm text-white shadow-lg">
                  P
                </div>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="hidden min-[420px]:inline font-semibold text-sm tracking-tight text-white">PULSE</span>
                  <span className="hidden min-[420px]:block w-1.5 h-1.5 rounded-full bg-accent-500"></span>
                </div>
              </div>

              {/* Location Switcher */}
              <div className="relative min-w-0">
                <button
                  onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 max-w-full rounded-full glass-card hover:border-white/10 text-xs text-white shadow-sm transition-all ease-apple"
                >
                  <MapPin className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                  <span className="font-semibold truncate max-w-[88px] min-[420px]:max-w-[110px] sm:max-w-[130px]">
                    {shortHubName(currentLocation.name)}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                <AnimatePresence>
                {showLocationDropdown && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18, ease: EASE }} className="absolute top-10 right-0 sm:left-0 z-50 w-64 origin-top rounded-lg glass-dropdown border border-white/10 p-2 shadow-2xl text-xs">
                    <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wide">
                      City hubs
                    </div>
                    <LocationStatusLine className="px-2 pb-1.5" />
                    {PRESET_LOCATIONS.map((loc) => (
                      <button
                        key={loc.name}
                        onClick={() => {
                          chooseHub(loc);
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between ${
                          currentLocation.name === loc.name
                            ? 'bg-accent-500/20 text-accent-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{loc.name}</span>
                        {currentLocation.name === loc.name && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-400"></span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        findMe();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-1.5 text-signal-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Use my location'}</span>
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>

              {/* Consolidated Right Controls: Score + Preferences + Auth */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div
                  onClick={() => setActiveTab('discover')}
                  className="cursor-pointer px-2.5 py-1 rounded-full bg-accent-500/15 border border-white/10 flex items-center gap-1"
                  title="Current Zone Pulse Score"
                >
                                    <span className="text-xs font-semibold text-accent-300">{currentPulseScore}</span>
                </div>

                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    aria-label="Join or sign in"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-white/10 text-[11px] font-bold shadow-sm transition-all ease-apple"
                  >
                    <LogIn className="w-3 h-3" />
                    <span className="hidden min-[360px]:inline">Join</span>
                  </button>
                )}
              </div>
            </header>

            {/* Main Dynamic Viewport */}
            <main className="flex-1 relative overflow-hidden">{renderActiveScreen()}</main>

            {/* Mobile / Tablet Bottom Navigation (Hidden on lg: desktop) */}
            <div className="relative z-40 shrink-0 lg:hidden">{renderBottomNav()}</div>
          </div>
        </div>

      {/* Global Modals & Notifications */}
      <PWAInstallBanner
        forceShow={forceShowInstallPrompt}
        onClose={() => setForceShowInstallPrompt(false)}
      />

      <LocationNotice onRetry={findMe} isLocating={isLocating} />

      <AppTour />

      {/* Real-time Notification In-App Toast Banner */}
      <AnimatePresence>
      {activeToast && (
        <motion.div
          key={activeToast.id}
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 left-4 sm:left-auto max-w-sm ml-auto z-50"
        >
          <div className="p-3.5 rounded-lg glass-panel border border-white/10 shadow-2xl flex items-start gap-3 bg-slate-900/95">
            <Bell className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
            <div
              onClick={() => {
                if (activeToast.momentId) {
                  openMomentOnMap(activeToast.momentId);
                }
                dismissToast();
              }}
              className="flex-1 cursor-pointer"
            >
              <div className="text-xs font-bold text-white leading-tight">{activeToast.title}</div>
              <div className="text-xs text-slate-300 line-clamp-1 mt-0.5">{activeToast.message}</div>
            </div>
            <button
              onClick={dismissToast}
              className="p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <CreateMomentModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <MomentCommentsDrawer
        momentId={activeCommentMomentId}
        onClose={() => setActiveCommentMomentId(null)}
      />

      <ReportModal
        momentId={activeReportMomentId}
        onClose={() => setActiveReportMomentId(null)}
      />

      <TemporaryCommunitiesList
        selectedCommunityId={activeCommunityId}
        onClose={() => setActiveCommunityId(null)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {activeTab === 'setup' && (
        <Suspense fallback={null}>
          <SetupWizard />
        </Suspense>
      )}
    </div>
  );
};
