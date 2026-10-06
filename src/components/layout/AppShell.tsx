import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { LiveActivityMap } from '../map/LiveActivityMap';
import { MapboxMap } from '../map/MapboxMap';
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
  LogIn
} from 'lucide-react';

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
    setSelectedMoment,
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
  const [mapEngine, setMapEngine] = useState<'activity' | 'mapbox'>('activity');

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const PRESET_LOCATIONS = [
    { name: 'Victoria Island, Lagos', latitude: 6.4281, longitude: 3.4219 },
    { name: 'Lekki Phase 1, Lagos', latitude: 6.4474, longitude: 3.4730 },
    { name: 'Yaba Tech Hub, Lagos', latitude: 6.5095, longitude: 3.3711 },
    { name: 'Freedom Park, Lagos Island', latitude: 6.4530, longitude: 3.3980 },
    { name: 'University of Lagos (Akoka)', latitude: 6.5168, longitude: 3.3976 }
  ];

  // Helper renderer for active tab content
  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'map':
        return mapEngine === 'activity' ? (
          <LiveActivityMap
            onOpenComments={(id) => setActiveCommentMomentId(id)}
            onOpenReport={(id) => setActiveReportMomentId(id)}
          />
        ) : (
          <MapboxMap
            defaultCenter={[currentLocation.longitude, currentLocation.latitude]}
            defaultZoom={15.5}
            pitch={58}
            bearing={-18}
            mapStyle="mapbox://styles/mapbox/standard"
            lightPreset="night"
            enable3dBuildings={true}
            enableDynamicLighting={true}
            autoGeolocate={true}
            showUserMarker={true}
            showNavigationControl={true}
            showGeolocateControl={true}
            show3dControls={true}
            moments={filteredMoments}
            onSelectMoment={(moment) => setSelectedMoment(moment)}
            className="h-full"
          />
        );
      case 'discover':
        return (
          <DiscoverFeed
            onOpenComments={(id) => setActiveCommentMomentId(id)}
            onOpenReport={(id) => setActiveReportMomentId(id)}
            onSelectCommunity={(id) => setActiveCommunityId(id)}
          />
        );
      case 'notifications':
        return (
          <NotificationsDrawer
            onSelectMoment={(id) => {
              const found = notifications.find((n) => n.momentId === id);
              if (found?.momentId) {
                setActiveTab('map');
              }
            }}
          />
        );
      case 'profile':
        return isBusinessMode ? <BusinessDashboard /> : <GamificationProfile />;
      default:
        return null;
    }
  };

  // Helper renderer for mobile/compact bottom navigation bar
  const renderBottomNav = () => (
    <nav className="shrink-0 h-16 glass-panel border-t border-white/10 px-3 flex items-center justify-around z-30 pb-[env(safe-area-inset-bottom)]">
      {/* 1. MAP (Default) */}
      <button
        onClick={() => setActiveTab('map')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'map' ? 'text-rose-400 scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <MapIcon className={`w-5 h-5 ${activeTab === 'map' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] font-bold mt-0.5">MAP</span>
      </button>

      {/* 2. DISCOVER */}
      <button
        onClick={() => setActiveTab('discover')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'discover' ? 'text-rose-400 scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Compass className={`w-5 h-5 ${activeTab === 'discover' ? 'stroke-[2.5]' : ''}`} />
        <span className="text-[10px] font-bold mt-0.5">DISCOVER</span>
      </button>

      {/* 3. CREATE (Center Raised Action) */}
      <div className="flex flex-col items-center justify-center px-1">
        <button
          onClick={() => setIsCreateOpen(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/40 -mt-6 hover:scale-110 active:scale-95 transition-all border-2 border-[#0A0E17]"
          title="Create Live Moment"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
        <span className="text-[10px] font-bold text-slate-400 mt-1">CREATE</span>
      </div>

      {/* 4. NOTIFICATIONS */}
      <button
        onClick={() => setActiveTab('notifications')}
        className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'notifications' ? 'text-rose-400 scale-105' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Bell className={`w-5 h-5 ${activeTab === 'notifications' ? 'stroke-[2.5]' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-6 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
            {unreadCount}
          </span>
        )}
        <span className="text-[10px] font-bold mt-0.5">ALERTS</span>
      </button>

      {/* 5. PROFILE / BIZ */}
      <button
        onClick={() => setActiveTab('profile')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'profile' ? 'text-rose-400 scale-105' : 'text-slate-400 hover:text-slate-200'
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
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>PULSE Phone Simulator</span>
            </div>
            <button
              onClick={() => setIsMobileFrameMode(false)}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 border border-white/10 hover:border-cyan-400 text-cyan-300 text-[11px] font-bold transition-colors"
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
                <span className="w-2 h-2 rounded-full bg-rose-500/80"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-black"></span>
              </div>
            </div>

            {/* Simulated Mobile Header */}
            <header className="px-4 py-3 shrink-0 glass-panel border-b border-white/10 flex items-center justify-between z-30">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-rose-500/30">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-extrabold text-sm tracking-tight text-white">PULSE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-rose-400 font-bold">
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
                  <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
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
                            ? 'bg-rose-500/20 text-rose-300 font-bold'
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
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[10px] font-bold"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Join</span>
                  </button>
                )}
                <div
                  onClick={() => setActiveTab('discover')}
                  className="cursor-pointer px-2 py-1 rounded-full bg-gradient-to-r from-rose-500/20 to-amber-500/20 border border-rose-500/30 flex items-center gap-1"
                >
                  <span className="text-xs">⚡</span>
                  <span className="text-xs font-black text-rose-300">{currentPulseScore}</span>
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
          <aside className="hidden lg:flex w-64 xl:w-72 h-full flex-col shrink-0 border-r border-white/10 bg-[#070A11]/95 backdrop-blur-2xl z-30 select-none p-4 justify-between">
            {/* Top Brand & Location */}
            <div className="space-y-4">
              {/* Brand Logo */}
              <div className="flex items-center gap-2.5 pb-4 border-b border-white/10">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center font-black text-white shadow-lg shadow-rose-500/30">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-extrabold text-base tracking-tight text-white">PULSE</span>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-rose-400 font-bold">
                    Live Social Radar
                  </span>
                </div>
              </div>

              {/* Active Zone / Location Card */}
              <div className="relative">
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span className="flex items-center gap-1 font-semibold">
                      <MapPin className="w-3 h-3 text-rose-400" /> Active Hub
                    </span>
                    <span className="text-rose-400 font-bold">Score ⚡{currentPulseScore}</span>
                  </div>
                  <button
                    onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                    className="w-full text-left font-bold text-xs text-white truncate flex items-center justify-between hover:text-rose-300 transition-colors"
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
                            ? 'bg-rose-500/20 text-rose-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{loc.name}</span>
                        {currentLocation.name === loc.name && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        useBrowserLocation();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 text-cyan-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
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
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 active:scale-98 transition-all"
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
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
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
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
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
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4" />
                    <span>Proximity Alerts</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'profile'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
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

            {/* Bottom Utilities & User Profile */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              {/* Map Engine & Portal Switchers */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" /> Map Engine
                  </span>
                  <button
                    onClick={() => setMapEngine(mapEngine === 'activity' ? 'mapbox' : 'activity')}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold border border-cyan-500/30 transition-colors"
                  >
                    {mapEngine === 'activity' ? 'MapLibre' : 'Mapbox 3D'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-white/5">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-amber-400" /> Role
                  </span>
                  <button
                    onClick={() => setIsBusinessMode(!isBusinessMode)}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-amber-500/30 transition-colors"
                  >
                    {isBusinessMode ? 'Merchant' : 'Resident'}
                  </button>
                </div>

                <button
                  onClick={() => setIsMobileFrameMode(true)}
                  className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 text-slate-300 text-[11px] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-rose-400" /> Phone Simulator
                  </span>
                  <span className="text-[10px] text-slate-500">Preview</span>
                </button>

                {!isInstalled && (
                  <button
                    onClick={() => promptToInstall()}
                    className="w-full flex items-center justify-center gap-1.5 p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install PWA</span>
                  </button>
                )}

                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="w-full flex items-center justify-center gap-1.5 p-2 rounded-xl bg-gradient-to-r from-rose-500/20 to-amber-500/20 hover:from-rose-500/30 hover:to-amber-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-all"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In / Join</span>
                  </button>
                )}
              </div>

              {/* User Profile Footer Card */}
              <div
                onClick={() => setActiveTab('profile')}
                className="pt-2 border-t border-white/10 flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <img
                  src={userProfile.avatar}
                  alt={userProfile.username}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-700"
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
            <header className="lg:hidden px-4 py-3 shrink-0 glass-panel border-b border-white/10 flex items-center justify-between z-30">
              {/* Logo & Brand */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-rose-500/30">
                  P
                </div>
                <div>
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-extrabold text-sm tracking-tight text-white">PULSE</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-rose-400 font-bold">
                    Live Radar
                  </span>
                </div>
              </div>

              {/* Location Switcher */}
              <div className="relative">
                <button
                  onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-white/10 hover:border-white/20 text-xs text-white shadow-sm transition-all"
                >
                  <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="font-semibold truncate max-w-[110px] sm:max-w-[140px]">
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
                            ? 'bg-rose-500/20 text-rose-300 font-bold'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">{loc.name}</span>
                        {currentLocation.name === loc.name && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        useBrowserLocation();
                        setShowLocationDropdown(false);
                      }}
                      disabled={isLocating}
                      className="w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5 text-cyan-300 hover:bg-slate-800 font-medium border-t border-white/5 pt-2"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{isLocating ? 'Locating...' : 'Use My Exact GPS'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {activeTab === 'map' && (
                  <button
                    onClick={() => setMapEngine((prev) => (prev === 'activity' ? 'mapbox' : 'activity'))}
                    className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-[10px] font-bold transition-all ${
                      mapEngine === 'mapbox'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-white/10'
                    }`}
                    title={`Current map: ${mapEngine === 'activity' ? 'Live Radar (MapLibre)' : 'Mapbox GL'}. Click to toggle.`}
                  >
                    <Layers className="w-3 h-3 text-cyan-400" />
                    <span>{mapEngine === 'activity' ? 'Radar' : 'Mapbox 3D'}</span>
                  </button>
                )}

                {!isInstalled && (
                  <button
                    onClick={() => setForceShowInstallPrompt(true)}
                    className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-rose-400 transition-colors"
                    title="Install Pulse App"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}

                {!isAuthenticated && (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold transition-all shadow-sm"
                  >
                    <LogIn className="w-3 h-3" />
                    <span className="hidden sm:inline">Sign In</span>
                  </button>
                )}

                <div
                  onClick={() => setActiveTab('discover')}
                  className="cursor-pointer px-2.5 py-1 rounded-full bg-gradient-to-r from-rose-500/20 to-amber-500/20 border border-rose-500/30 flex items-center gap-1"
                  title="Current Zone Pulse Score"
                >
                  <span className="text-xs">⚡</span>
                  <span className="text-xs font-black text-rose-300">{currentPulseScore}</span>
                </div>
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
          <div className="p-3.5 rounded-2xl glass-panel border border-rose-500/40 shadow-2xl flex items-start gap-3 bg-slate-900/95">
            <span className="text-xl shrink-0">🚨</span>
            <div
              onClick={() => {
                if (activeToast.momentId) {
                  setActiveTab('map');
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
    </div>
  );
};
