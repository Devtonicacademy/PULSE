import React, { Suspense, lazy, useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { PulseMap } from '../map/PulseMap';
import { HotspotBottomSheet } from '../map/HotspotBottomSheet';
import { AreaSheet } from '../map/AreaSheet';
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
import { AuthModal } from '../auth/AuthModal';
import {
  Map as MapIcon,
  Compass,
  Plus,
  Bell,
  User,
  MapPin,
  ChevronDown,
  Smartphone,
  Maximize2,
  X,
  Sparkles,
  Briefcase,
  Download,
  Layers,
  Crosshair,
  LogIn,
  SlidersHorizontal
} from 'lucide-react';

// Three.js only downloads when someone opens the Pulse 3D explore mode
const Pulse3DMap = lazy(() => import('../map/Pulse3DMap'));

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
    isAuthenticated
  } = usePulse();

  const { isInstalled, isInstallable, promptToInstall } = usePWAInstall();

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeCommentMomentId, setActiveCommentMomentId] = useState<string | null>(null);
  const [activeReportMomentId, setActiveReportMomentId] = useState<string | null>(null);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [isMobileFrameMode, setIsMobileFrameMode] = useState(false);
  const [forceShowInstallPrompt, setForceShowInstallPrompt] = useState(false);
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [mapEngine, setMapEngine] = useState<MapEngine>('pulse3d');
  const [navigationDestination, setNavigationDestination] = useState<{
    latitude: number;
    longitude: number;
    title: string;
    category?: string;
  } | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
    { name: 'University of Lagos (Akoka)', latitude: 6.5168, longitude: 3.3976 }
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
            showNavigationControl: true,
            showGeolocateControl: true,
            show3dControls: true,
            moments: filteredMoments,
            onSelectMoment: setSelectedMoment,
            navigationDestination,
            onClearNavigation: () => setNavigationDestination(null),
            className: 'h-full'
          };
          const sheet = (
            <>
              <AreaSheet />
              <HotspotBottomSheet
                onOpenComments={(id) => setActiveCommentMomentId(id)}
                onOpenReport={(id) => setActiveReportMomentId(id)}
                onStartNavigation={startNavigation}
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
                  <Pulse3DMap {...mapProps} enableDynamicLighting>
                    {sheet}
                    {!(selectedMoment || selectedZone) && (
                      <button
                        onClick={() => setMapEngine('map')}
                        className="absolute bottom-[calc(var(--area-sheet-h,0px)+6rem)] transition-[bottom] duration-300 right-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl glass-hud border border-white/20 text-[11px] font-bold text-white shadow-2xl hover:bg-white/10"
                        title="Back to the map"
                      >
                        <MapIcon className="w-3.5 h-3.5 text-signal-400" />
                        <span>Back to map</span>
                      </button>
                    )}
                  </Pulse3DMap>
                </div>
              </Suspense>
            );
          }
          return (
            <PulseMap {...mapProps} onWalkIn3D={() => setMapEngine('pulse3d')}>
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
        return isBusinessMode ? <BusinessDashboard /> : <GamificationProfile />;
      default:
        return null;
    }
  };

  // Helper renderer for mobile/compact bottom navigation bar
  const renderBottomNav = () => (
    <nav className="shrink-0 h-16 glass-bottom-bar px-3 flex items-center justify-around z-30 pb-[env(safe-area-inset-bottom)]">
      {/* 1. MAP (Default) */}
      <button
        onClick={() => setActiveTab('map')}
        className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all ${
          activeTab === 'map'
            ? 'text-accent-400 bg-accent-500/15 scale-105 shadow-[0_0_12px] shadow-accent-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <MapIcon className={`w-5 h-5 ${activeTab === 'map' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] font-bold mt-0.5">MAP</span>
      </button>

      {/* 2. DISCOVER */}
      <button
        onClick={() => setActiveTab('discover')}
        className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all ${
          activeTab === 'discover'
            ? 'text-accent-400 bg-accent-500/15 scale-105 shadow-[0_0_12px] shadow-accent-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Compass className={`w-5 h-5 ${activeTab === 'discover' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] font-bold mt-0.5">DISCOVER</span>
      </button>

      {/* 3. CREATE (Center Raised Action) */}
      <div className="flex flex-col items-center justify-center px-1">
        <button
          onClick={() => setIsCreateOpen(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-accent-500 to-accent2-500 text-white flex items-center justify-center shadow-lg shadow-accent-500/40 -mt-6 hover:scale-110 active:scale-95 transition-all border-2 border-[#0A0E17]"
          title="Create Live Moment"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
        <span className="text-[10px] font-bold text-slate-400 mt-1">CREATE</span>
      </div>

      {/* 4. NOTIFICATIONS */}
      <button
        onClick={() => setActiveTab('notifications')}
        className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all ${
          activeTab === 'notifications'
            ? 'text-accent-400 bg-accent-500/15 scale-105 shadow-[0_0_12px] shadow-accent-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Bell className={`w-5 h-5 ${activeTab === 'notifications' ? 'stroke-[2.5]' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-6 w-4 h-4 rounded-full bg-accent-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
            {unreadCount}
          </span>
        )}
        <span className="text-[10px] font-bold mt-0.5">ALERTS</span>
      </button>

      {/* 5. PROFILE / BIZ */}
      <button
        onClick={() => setActiveTab('profile')}
        className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all ${
          activeTab === 'profile'
            ? 'text-accent-400 bg-accent-500/15 scale-105 shadow-[0_0_12px] shadow-accent-500/20'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {isBusinessMode ? (
          <Briefcase className={`w-5 h-5 text-amber-400 ${activeTab === 'profile' ? 'stroke-[2.5]' : ''}`} />
        ) : (
          <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-[2.5]' : ''}`} />
        )}
        <span className="text-[10px] font-bold mt-0.5">
          {isBusinessMode ? 'BUSINESS' : 'PROFILE'}
        </span>
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen w-full bg-[#070A11] text-slate-100 flex flex-col">
      {/* =========================================================================
          MODE A: PHONE SIMULATOR (Developer / Testing Preview Container)
         ========================================================================= */}
      {isMobileFrameMode ? (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-2 sm:p-4 bg-[#05070D]">
          {/* Top Simulator Control Bar */}
          <div className="w-full max-w-[430px] mb-2 flex items-center justify-between text-xs text-slate-400 px-2">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-accent-500 animate-ping" />
              <span>PULSE Phone Simulator</span>
            </div>
            <button
              onClick={() => setIsMobileFrameMode(false)}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 border border-white/10 hover:border-signal-400 text-signal-300 text-[11px] font-bold transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen View</span>
            </button>
          </div>

          {/* Simulated Mobile Phone Hardware Frame */}
          <div className="w-full max-w-[420px] h-[100dvh] sm:h-[860px] sm:rounded-[44px] sm:border-[8px] sm:border-slate-800 shadow-2xl relative flex flex-col overflow-hidden bg-[#0A0E17]">
            {/* Dynamic Island Notch */}
            <div className="hidden sm:flex items-center justify-center pt-2 pb-1 shrink-0 z-40 bg-[#0A0E17]">
              <div className="w-28 h-4 rounded-full bg-slate-900/90 border border-white/10 flex items-center justify-between px-3">
                <span className="w-2 h-2 rounded-full bg-accent-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-black"></span>
              </div>
            </div>

            {/* Simulated Mobile Header */}
            <header className="px-4 py-3 shrink-0 glass-panel border-b border-white/10 flex items-center justify-between z-30">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-accent-500 to-accent2-500 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-accent-500/30">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-extrabold text-sm tracking-tight text-white">PULSE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse"></span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-accent-400 font-bold">
                    Live Radar
                  </span>
                </div>
              </div>

              {/* Location Switcher */}
              <div className="relative">
                <button
                  onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-900/90 border border-white/10 text-xs text-white"
                >
                  <MapPin className="w-3 h-3 text-accent-400 shrink-0" />
                  <span className="font-semibold truncate max-w-[100px]">
                    {currentLocation.name.split(',')[0]}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {showLocationDropdown && (
                  <div className="absolute top-10 right-0 z-50 w-60 rounded-2xl glass-dropdown border border-white/15 p-2 shadow-2xl text-xs">
                    {PRESET_LOCATIONS.map((loc) => (
                      <button
                        key={loc.name}
                        onClick={() => {
                          setCurrentLocation(loc);
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-xl transition-colors ${
                          currentLocation.name === loc.name
                            ? 'bg-accent-500/20 text-accent-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Auth / Score Badges */}
              <div className="flex items-center gap-1.5">
                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-accent-500/30 text-[10px] font-bold"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Join</span>
                  </button>
                )}
                <div
                  onClick={() => setActiveTab('discover')}
                  className="cursor-pointer px-2 py-1 rounded-full bg-gradient-to-r from-accent-500/20 to-accent2-500/20 border border-accent-500/30 flex items-center gap-1"
                >
                  <span className="text-xs">⚡</span>
                  <span className="text-xs font-black text-accent-300">{currentPulseScore}</span>
                </div>
              </div>
            </header>

            {/* Main Screen */}
            <main className="flex-1 relative overflow-hidden">{renderActiveScreen()}</main>

            {/* Bottom Nav */}
            {renderBottomNav()}
          </div>
        </div>
      ) : (
        /* =========================================================================
            MODE B: FULLY RESPONSIVE APPLICATION (Mobile, Tablet, Desktop)
           ========================================================================= */
        <div className="h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-[#0A0E17]">
          {/* 1. DESKTOP SIDEBAR NAVIGATION (Visible on screens >= 1024px) */}
          <aside className="hidden lg:flex w-64 xl:w-72 h-full flex-col shrink-0 glass-sidebar z-30 select-none p-4 justify-between relative overflow-y-auto">
            {/* Top Brand & Location */}
            <div className="space-y-4">
              {/* Brand Logo */}
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-accent-500 to-accent2-500 flex items-center justify-center font-black text-white shadow-lg shadow-accent-500/30">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-extrabold text-base tracking-tight text-white">PULSE</span>
                    <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse"></span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-accent-400 font-bold">
                    Live Social Radar
                  </span>
                </div>
              </div>

              {/* Active Zone / Location Card */}
              <div className="relative">
                <div className="p-3 rounded-2xl glass-card-interactive border border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-semibold">
                      <MapPin className="w-3 h-3 text-accent-400" /> Active Hub
                    </span>
                    <span className="text-accent-400 font-bold">Score ⚡{currentPulseScore}</span>
                  </div>
                  <button
                    onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                    className="w-full text-left font-bold text-xs text-white truncate flex items-center justify-between hover:text-accent-300 transition-colors"
                  >
                    <span className="truncate">{currentLocation.name.split(',')[0]}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                  </button>
                </div>

                {/* Hub Selection Dropdown */}
                {showLocationDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl glass-dropdown border border-white/15 p-2 shadow-2xl text-xs space-y-1 animate-fade-in">
                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                      Explore City Hubs
                    </div>
                    {PRESET_LOCATIONS.map((loc) => (
                      <button
                        key={loc.name}
                        onClick={() => {
                          setCurrentLocation(loc);
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between ${
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
                        useBrowserLocation();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 text-signal-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Use My Exact GPS'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Primary Call to Action Button */}
              <button
                onClick={() => setIsCreateOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent2-500 hover:from-accent-600 hover:to-accent2-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-accent-500/25 active:scale-98 transition-all"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Broadcast Moment</span>
              </button>

              {/* Desktop Navigation Links */}
              <nav className="pt-2 space-y-1">
                <button
                  onClick={() => setActiveTab('map')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'map'
                      ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <MapIcon className="w-4 h-4" />
                  <span>Live Map Radar</span>
                </button>

                <button
                  onClick={() => setActiveTab('discover')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'discover'
                      ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Discover Feed</span>
                </button>

                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'notifications'
                      ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4" />
                    <span>Proximity Alerts</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent-500 text-white text-[10px] font-black">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'profile'
                      ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {isBusinessMode ? (
                    <Briefcase className="w-4 h-4 text-amber-400" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                  <span>{isBusinessMode ? 'Business Portal' : 'Resident Profile'}</span>
                </button>
              </nav>
            </div>

            {/* Bottom Consolidated Control Dock & User Profile */}
            <div className="space-y-2.5 pt-3 border-t border-white/10">
              {/* Consolidated Preferences Capsule */}
              <div className="p-2.5 rounded-2xl glass-card space-y-2 text-xs">
                {/* Segmented Mode & Engine Controls in Compact Dual Grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setIsBusinessMode(!isBusinessMode)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[10px] font-bold transition-all ${
                      isBusinessMode
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                    }`}
                    title="Toggle Merchant or Resident View"
                  >
                    <Briefcase className="w-3 h-3 text-amber-400" />
                    <span>{isBusinessMode ? 'Merchant' : 'Resident'}</span>
                  </button>

                  <button
                    onClick={() => setMapEngine(mapEngine === 'map' ? 'pulse3d' : 'map')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[10px] font-bold transition-all ${
                      mapEngine === 'pulse3d'
                        ? 'bg-signal-500/20 text-signal-300 border border-signal-500/40 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                    }`}
                    title="Switch between the map and Pulse 3D"
                  >
                    <Layers className="w-3 h-3 text-signal-400" />
                    <span>{mapEngine === 'map' ? 'Walk in 3D' : 'Back to map'}</span>
                  </button>
                </div>

                {/* Auxiliary Utilities Row (Simulator, Install, Auth) */}
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    onClick={() => setIsMobileFrameMode(true)}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[10px] font-semibold transition-colors"
                    title="Open Phone Simulator Preview"
                  >
                    <Smartphone className="w-3 h-3 text-accent-400" />
                    <span>Simulator</span>
                  </button>

                  {!isInstalled && (
                    <button
                      onClick={() => promptToInstall()}
                      className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-accent-500/15 hover:bg-accent-500/25 text-accent-300 text-[10px] font-bold transition-colors"
                      title="Install Progressive Web App"
                    >
                      <Download className="w-3 h-3" />
                      <span>Install</span>
                    </button>
                  )}

                  {!isAuthenticated && (
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-gradient-to-r from-accent-500/20 to-accent2-500/20 hover:from-accent-500/30 hover:to-accent2-500/30 text-accent-300 text-[10px] font-bold transition-all"
                      title="Sign In or Create Account"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Sign In</span>
                    </button>
                  )}
                </div>
              </div>

              {/* User Profile Footer Card */}
              <div
                onClick={() => setActiveTab('profile')}
                className="p-2 rounded-2xl glass-card-interactive flex items-center gap-2.5 cursor-pointer"
              >
                <img
                  src={userProfile.avatar}
                  alt={userProfile.username}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-700/60 shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">@{userProfile.username}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="text-amber-400 font-semibold">Rep {userProfile.reputation}</span>
                    <span>• Tier 3 Scout</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* 2. MAIN APP CONTENT CONTAINER */}
          <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
            {/* Mobile / Tablet Compact Top Header (Hidden on lg: desktop) */}
            <header className="lg:hidden px-3.5 py-2.5 shrink-0 glass-header flex items-center justify-between z-30 relative">
              {/* Logo & Brand */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-accent-500 to-accent2-500 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-accent-500/30">
                  P
                </div>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-extrabold text-sm tracking-tight text-white">PULSE</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-pulse"></span>
                </div>
              </div>

              {/* Location Switcher */}
              <div className="relative">
                <button
                  onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card hover:border-white/20 text-xs text-white shadow-sm transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                  <span className="font-semibold truncate max-w-[100px] sm:max-w-[130px]">
                    {currentLocation.name.split(',')[0]}
                  </span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {showLocationDropdown && (
                  <div className="absolute top-10 right-0 sm:left-0 z-50 w-64 rounded-2xl glass-dropdown border border-white/15 p-2 shadow-2xl animate-fade-in text-xs">
                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                      Select Exploration Hub
                    </div>
                    {PRESET_LOCATIONS.map((loc) => (
                      <button
                        key={loc.name}
                        onClick={() => {
                          setCurrentLocation(loc);
                          setShowLocationDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between ${
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
                        useBrowserLocation();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 text-signal-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Use My Exact GPS'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Consolidated Right Controls: Score + Preferences + Auth */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div
                  onClick={() => setActiveTab('discover')}
                  className="cursor-pointer px-2.5 py-1 rounded-full bg-gradient-to-r from-accent-500/20 to-accent2-500/20 border border-accent-500/30 flex items-center gap-1"
                  title="Current Zone Pulse Score"
                >
                  <span className="text-xs">⚡</span>
                  <span className="text-xs font-black text-accent-300">{currentPulseScore}</span>
                </div>

                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-accent-500/30 text-[10px] font-bold shadow-sm transition-all"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Join</span>
                  </button>
                )}

                <button
                  onClick={() => setShowQuickSettings(true)}
                  className="p-1.5 rounded-xl glass-hud border border-white/15 text-slate-300 hover:text-white hover:border-signal-400/40 transition-all shadow-sm"
                  title="App Preferences & Settings"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-signal-400" />
                </button>
              </div>
            </header>

            {/* Main Dynamic Viewport */}
            <main className="flex-1 relative overflow-hidden">{renderActiveScreen()}</main>

            {/* Mobile / Tablet Bottom Navigation (Hidden on lg: desktop) */}
            <div className="lg:hidden">{renderBottomNav()}</div>
          </div>
        </div>
      )}

      {/* Global Modals & Notifications (Present in both modes) */}
      <PWAInstallBanner
        forceShow={forceShowInstallPrompt}
        onClose={() => setForceShowInstallPrompt(false)}
      />

      {/* Real-time Notification In-App Toast Banner */}
      {activeToast && (
        <div className="fixed top-4 right-4 max-w-sm z-50 animate-slide-up">
          <div className="p-3.5 rounded-2xl glass-panel border border-accent-500/40 shadow-2xl flex items-start gap-3 bg-slate-900/95">
            <span className="text-xl shrink-0">🚨</span>
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
              <div className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">{activeToast.message}</div>
            </div>
            <button
              onClick={dismissToast}
              className="p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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

      {activeCommunityId && (
        <TemporaryCommunitiesList
          selectedCommunityId={activeCommunityId}
          onClose={() => setActiveCommunityId(null)}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Consolidated Quick Settings & Preferences Modal (Mobile & Tablet) */}
      {showQuickSettings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl glass-panel border border-white/15 shadow-2xl p-5 text-white space-y-4 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-signal-400" />
                <h3 className="text-sm font-bold text-white">App Preferences</h3>
              </div>
              <button
                onClick={() => setShowQuickSettings(false)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Setting 1: Map Engine */}
            <div className="flex items-center justify-between p-3 rounded-2xl glass-card">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-signal-400" /> Map View
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {MAP_ENGINE_LABELS[mapEngine].long}
                </div>
              </div>
              <button
                onClick={() => setMapEngine(mapEngine === 'map' ? 'pulse3d' : 'map')}
                className="px-3 py-1.5 rounded-xl bg-signal-500/20 text-signal-300 border border-signal-500/30 text-xs font-bold"
              >
                {mapEngine === 'map' ? 'Walk in 3D' : 'Back to map'}
              </button>
            </div>

            {/* Setting 2: Portal Role */}
            <div className="flex items-center justify-between p-3 rounded-2xl glass-card">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-400" /> Portal Role
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {isBusinessMode ? 'Merchant / Business Admin' : 'Resident & Explorer'}
                </div>
              </div>
              <button
                onClick={() => setIsBusinessMode(!isBusinessMode)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold"
              >
                {isBusinessMode ? 'Merchant' : 'Resident'}
              </button>
            </div>

            {/* Setting 3: Phone Simulator */}
            <div className="flex items-center justify-between p-3 rounded-2xl glass-card">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-accent-400" /> Phone Simulator
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Test simulated device viewport</div>
              </div>
              <button
                onClick={() => {
                  setIsMobileFrameMode(true);
                  setShowQuickSettings(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold"
              >
                Launch
              </button>
            </div>

            {/* Setting 4: PWA Install (if applicable) */}
            {!isInstalled && (
              <button
                onClick={() => {
                  setShowQuickSettings(false);
                  promptToInstall();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent-500/20 hover:bg-accent-500/30 text-accent-300 border border-accent-500/40 text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Install Pulse App (PWA)</span>
              </button>
            )}

            {/* Setting 5: Authentication */}
            {!isAuthenticated ? (
              <button
                onClick={() => {
                  setShowQuickSettings(false);
                  setIsAuthModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent2-500 text-white font-bold text-xs shadow-lg shadow-accent-500/25"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
            ) : (
              <div className="pt-1 text-center text-xs text-slate-400">
                Signed in as <span className="font-bold text-white">@{userProfile.username}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
