import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { RadiusKm, MomentCategory, FeedCategoryFilter, Moment } from '../../types/pulse';
import { generateLocalAISummary } from '../../services/aiSummaryService';
import {
  Sparkles,
  MapPin,
  Clock,
  MessageCircle,
  Share2,
  ShieldAlert,
  Search,
  Filter,
  Users,
  Compass,
  ArrowRight,
  BadgeCheck,
  Tag
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DiscoverFeedProps {
  onOpenComments: (momentId: string) => void;
  onOpenReport: (momentId: string) => void;
  onSelectCommunity: (communityId: string) => void;
}

const CATEGORIES: { id: FeedCategoryFilter; label: string; icon: string; isSpecial?: boolean }[] = [
  { id: 'all', label: 'All Live', icon: '⚡' },
  { id: 'business_pins', label: 'Business Pins', icon: '🏷️', isSpecial: true },
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'alerts', label: 'Alerts', icon: '🚨' },
  { id: 'food_drinks', label: 'Food & Drink', icon: '🍔' },
  { id: 'deals', label: 'Deals', icon: '🛍️' },
  { id: 'activities', label: 'Activities', icon: '🏃' },
  { id: 'recommendations', label: 'Recommended', icon: '💡' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'lost_found', label: 'Lost & Found', icon: '🔍' }
];

export const DiscoverFeed: React.FC<DiscoverFeedProps> = ({
  onOpenComments,
  onOpenReport,
  onSelectCommunity
}) => {
  const {
    currentLocation,
    radiusKm,
    setRadiusKm,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredMoments,
    temporaryCommunities,
    setSelectedMoment,
    toggleReaction,
    currentPulseScore,
    currentZoneName
  } = usePulse();

  const [feedSort, setFeedSort] = useState<'trending' | 'newest' | 'expiring'>('trending');

  // AI Local Summary
  const aiSummary = generateLocalAISummary(filteredMoments, radiusKm, currentZoneName);

  // Sorting
  const sortedMoments = [...filteredMoments].sort((a, b) => {
    if (feedSort === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (feedSort === 'expiring') {
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    }
    return b.engagementScore - a.engagementScore;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100">
      {/* Sticky Header with Search & Radius */}
      <div className="sticky top-0 z-20 glass-panel border-b border-white/10 p-3 sm:p-4 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto w-full space-y-3">
          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search moments, events, food in ${currentZoneName}...`}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Dynamic Radius Chips (Feature 2) */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-slate-400">Radius:</span>
              {([1, 2, 5, 10, 25] as RadiusKm[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRadiusKm(r)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    radiusKm === r
                      ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {r}km
                </button>
              ))}
            </div>

            {/* Sort Switcher */}
            <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0 ml-auto">
              <Filter className="w-3 h-3 text-slate-500" />
              <select
                value={feedSort}
                onChange={(e) => setFeedSort(e.target.value as any)}
                className="bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-slate-300 text-[11px] focus:outline-none"
              >
                <option value="trending">🔥 Trending</option>
                <option value="newest">⚡ Newest</option>
                <option value="expiring">⏳ Expiring Soon</option>
              </select>
            </div>
          </div>

          {/* Category Horizontal Filter Carousel */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const isBiz = cat.id === 'business_pins';
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? isBiz
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-md shadow-amber-500/20 font-bold'
                        : 'bg-white/15 text-white border border-white/30 shadow-sm'
                      : isBiz
                        ? 'bg-amber-950/30 text-amber-300/90 hover:bg-amber-900/50 border border-amber-500/30'
                        : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 border border-transparent'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  {isBiz && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-5 space-y-5 max-w-7xl mx-auto w-full">
        {/* Feature 6: AI LOCAL RADAR SUMMARY CARD */}
        <div className="rounded-2xl p-4 bg-gradient-to-br from-rose-950/40 via-slate-900/90 to-purple-950/30 border border-rose-500/20 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                AI Local Radar
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {aiSummary.vibeTag}
              </span>
              <span className="text-[10px] text-slate-400">{aiSummary.timestamp}</span>
            </div>
          </div>

          <h3 className="text-xs sm:text-sm font-semibold text-slate-200 mb-2">
            {aiSummary.headline}
          </h3>

          <ul className="space-y-1.5">
            {aiSummary.bullets.map((bullet, idx) => (
              <li
                key={idx}
                className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed"
              >
                <span className="text-rose-400 font-bold shrink-0">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Feature 9: TEMPORARY COMMUNITIES CAROUSEL */}
        {temporaryCommunities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>Temporary Pop-up Hubs</span>
              </div>
              <span className="text-[10px] text-slate-400">Disappear when activity ends</span>
            </div>

            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
              {temporaryCommunities.map((comm) => (
                <div
                  key={comm.id}
                  onClick={() => onSelectCommunity(comm.id)}
                  className="min-w-[240px] p-3 rounded-2xl glass-panel hover:border-cyan-500/40 cursor-pointer transition-all active:scale-98 group shrink-0"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 capitalize">
                      {comm.triggerType}
                    </span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3 text-cyan-400" /> {comm.memberCount} active
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {comm.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                    {comm.description}
                  </p>
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-cyan-400 font-medium">
                    <span>Join live stream</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature 5: Zone Activity Score Banner */}
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <div>
              <div className="text-xs font-bold text-white">
                {currentZoneName} Activity Zone
              </div>
              <div className="text-[10px] text-slate-400">
                {sortedMoments.length} active Moments within {radiusKm}km
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-black text-rose-400">
              Score: {currentPulseScore}
            </span>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              High Density
            </div>
          </div>
        </div>

        {/* Active Business Live Pins Filter Banner */}
        {selectedCategory === 'business_pins' && (
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-600/10 to-slate-900/70 border border-amber-500/30 text-amber-200 shadow-lg shadow-amber-950/20">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <BadgeCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  Verified Business Live Pins
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/25 text-amber-300 font-bold border border-amber-500/35">
                    Live Beacons
                  </span>
                </div>
                <div className="text-[10px] text-amber-300/80">
                  Showing {sortedMoments.length} active verified merchant beacons & flash promos within {radiusKm}km
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedCategory('all')}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-white/10 shrink-0 ml-2"
            >
              Reset
            </button>
          </div>
        )}

        {/* MOMENTS LIST FEED */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedMoments.length === 0 ? (
            <div className="col-span-full text-center py-16 px-4 rounded-2xl glass-panel">
              <Compass className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-white">No active Moments found</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                Try expanding your search radius (e.g. 10km or 25km) or be the first to broadcast a live Moment!
              </p>
            </div>
          ) : (
            sortedMoments.map((moment) => {
              const expiresDate = new Date(moment.expiresAt);
              const now = new Date();
              const hoursLeft = Math.max(
                0,
                Math.round((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60))
              );

              return (
                <div
                  key={moment.id}
                  className={`rounded-2xl glass-panel overflow-hidden transition-all shadow-xl group ${
                    moment.isBusiness
                      ? 'border border-amber-500/40 bg-gradient-to-b from-amber-950/20 via-slate-900/80 to-slate-900/90 hover:border-amber-400/60 shadow-amber-950/30'
                      : 'border border-white/5 hover:border-white/15'
                  }`}
                >
                  {/* Photo (if present) */}
                  {moment.photoUrl && (
                    <div
                      onClick={() => setSelectedMoment(moment)}
                      className="relative h-44 w-full cursor-pointer overflow-hidden bg-slate-950"
                    >
                      <img
                        src={moment.photoUrl}
                        alt={moment.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-black/30" />
                      
                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                        {moment.isBusiness ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/30 backdrop-blur-md text-amber-200 border border-amber-400/40 flex items-center gap-1">
                            <BadgeCheck className="w-3 h-3 text-amber-400" />
                            Verified Live Pin
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-black/60 backdrop-blur-md text-white border border-white/20 capitalize">
                            {moment.category.replace('_', ' ')}
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          {hoursLeft > 0 ? `${hoursLeft}h left` : 'Expiring soon'}
                        </span>
                      </div>

                      {/* Distance */}
                      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 text-[11px] text-slate-200 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full">
                        <MapPin className={`w-3 h-3 ${moment.isBusiness ? 'text-amber-400' : 'text-rose-400'}`} />
                        <span>{moment.approxAddress}</span>
                        {moment.distanceKm !== undefined && (
                          <span className="font-bold text-white ml-1">
                            • {moment.distanceKm < 1
                              ? `${Math.round(moment.distanceKm * 1000)}m`
                              : `${moment.distanceKm.toFixed(1)}km`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Body Content */}
                  <div className="p-3.5 sm:p-4">
                    {!moment.photoUrl && (
                      <div className="flex items-center justify-between mb-2">
                        {moment.isBusiness ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <BadgeCheck className="w-3 h-3 text-amber-400" />
                            Verified Business Live Pin
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-white/10 capitalize">
                            {moment.category.replace('_', ' ')}
                          </span>
                        )}
                        <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3" /> {hoursLeft}h left
                        </span>
                      </div>
                    )}

                    {/* Creator info */}
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={moment.userAvatar}
                          alt={moment.userName}
                          className={`w-5 h-5 rounded-full object-cover border ${
                            moment.isBusiness ? 'border-amber-400/60 ring-1 ring-amber-400/40' : 'border-slate-700'
                          }`}
                        />
                        <span className={`font-semibold flex items-center gap-1 ${moment.isBusiness ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                          {moment.isBusiness ? moment.businessName || moment.userName : `@${moment.userName}`}
                          {moment.isBusiness && <BadgeCheck className="w-3.5 h-3.5 text-amber-400" />}
                        </span>
                        {moment.isBusiness ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                            Live Partner
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-amber-400">
                            Rep {moment.userReputation}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px]">
                        {formatDistanceToNow(new Date(moment.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <h3
                      onClick={() => setSelectedMoment(moment)}
                      className="text-sm sm:text-base font-bold text-white mb-1.5 cursor-pointer hover:text-rose-400 transition-colors"
                    >
                      {moment.title}
                    </h3>
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                      {moment.description}
                    </p>

                    {/* Privacy badge if blurred */}
                    {moment.isBlurred && (
                      <div className="text-[10px] text-cyan-400 mb-2 flex items-center gap-1">
                        <span>🛡️</span> Approximate location shown for resident privacy
                      </div>
                    )}

                    {/* Reactions Bar (Feature 7) */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {(
                          [
                            { type: 'helpful', emoji: '👍', count: moment.reactions.helpful },
                            { type: 'trending', emoji: '🔥', count: moment.reactions.trending },
                            { type: 'confirmed', emoji: '✅', count: moment.reactions.confirmed },
                            { type: 'interested', emoji: '❤️', count: moment.reactions.interested },
                            { type: 'going', emoji: '🎉', count: moment.reactions.going }
                          ] as const
                        ).map((r) => {
                          const isReacted = moment.userReaction === r.type;
                          return (
                            <button
                              key={r.type}
                              onClick={() => toggleReaction(moment.id, r.type)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                isReacted
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                                  : 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 border border-transparent'
                              }`}
                            >
                              <span>{r.emoji}</span>
                              <span className="text-[11px]">{r.count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Comment & Report buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          onClick={() => onOpenComments(moment.id)}
                          className="flex items-center gap-1 p-1.5 rounded-lg text-xs text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                          title="Comments"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-bold">{moment.commentCount}</span>
                        </button>
                        <button
                          onClick={() => onOpenReport(moment.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                          title="Report"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
