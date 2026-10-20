import React from 'react';
import { motion } from 'framer-motion';
import { EASE } from '../ui/ResponsiveSheet';
import { usePulse } from '../../context/PulseContext';
import { ReactionType, MomentCategory, Moment } from '../../types/pulse';
import {
  X,
  Clock,
  MapPin,
  MessageCircle,
  Share2,
  ShieldAlert,
  Flame,
  ThumbsUp,
  CheckCircle2,
  Heart,
  PartyPopper,
  Eye,
  Map as MapIcon,
  Navigation
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HotspotBottomSheetProps {
  onOpenComments: (momentId: string) => void;
  onOpenReport: (momentId: string) => void;
  onStartNavigation?: (moment: Moment) => void;
  /** In Pulse 3D: a way back to the flat map from inside the sheet (phones, where the floating button would sit on it) */
  onBackToMap?: () => void;
}

export const CATEGORY_META: Record<
  MomentCategory,
  { label: string; icon: string; badgeClass: string }
> = {
  events: { label: 'Event', icon: '🎉', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  alerts: { label: 'Alert', icon: '🚨', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  food_drinks: { label: 'Food & Drink', icon: '🍔', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  lost_found: { label: 'Lost & Found', icon: '🔍', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  recommendations: { label: 'Recommendation', icon: '💡', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  activities: { label: 'Activity', icon: '🏃', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  deals: { label: 'Deal', icon: '🛍️', badgeClass: 'bg-white/10 text-slate-200 border-white/10' },
  community: { label: 'Community', icon: '💬', badgeClass: 'bg-white/10 text-slate-200 border-white/10' }
};

export const HotspotBottomSheet: React.FC<HotspotBottomSheetProps> = ({
  onOpenComments,
  onOpenReport,
  onStartNavigation,
  onBackToMap
}) => {
  const {
    selectedMoment,
    setSelectedMoment,
    selectedZone,
    setSelectedZone,
    toggleReaction
  } = usePulse();

  if (!selectedMoment && !selectedZone) return null;

  // Render Zone Details when a zone hotspot polygon is clicked
  if (selectedZone && !selectedMoment) {
    return (
      <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="absolute inset-x-2 bottom-2 sm:left-6 sm:right-auto sm:bottom-6 sm:max-w-md z-30 flex flex-col max-h-[calc(100%-1rem)] sm:max-h-[calc(100%-3rem)]">
        <div className="glass-panel rounded-lg p-4 sm:p-5 shadow-2xl text-white overflow-y-auto overscroll-contain min-h-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-slate-200 border border-white/10 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-accent-400" /> Hotspot
                </span>
                <span className="text-xs text-slate-400">2.5 km radius</span>
              </div>
              <h2 className="text-xl font-bold text-white">{selectedZone.zoneName}</h2>
            </div>
            <button
              onClick={() => setSelectedZone(null)}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/10 my-3">
            <div className="text-center p-2 rounded-md bg-white/5">
              <div className="text-2xl font-semibold text-white">{selectedZone.activityScore}</div>
              <div className="text-xs text-slate-400">Pulse score</div>
            </div>
            <div className="text-center p-2 rounded-md bg-white/5">
              <div className="text-2xl font-semibold text-white">{selectedZone.momentCount}</div>
              <div className="text-xs text-slate-400">Moments</div>
            </div>
            <div className="text-center p-2 rounded-md bg-white/5">
              <div className="text-2xl font-semibold text-white">{selectedZone.activeUsers}</div>
              <div className="text-xs text-slate-400">People nearby</div>
            </div>
          </div>

          <p className="text-xs text-slate-300 mb-3">{selectedZone.summary}</p>

          <button
            onClick={() => setSelectedZone(null)}
            className="w-full py-2.5 rounded-md bg-accent-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
          >
            <Navigation className="w-3.5 h-3.5" /> Explore this area
          </button>
        </div>
      </motion.div>
    );
  }

  if (!selectedMoment) return null;

  const catMeta = CATEGORY_META[selectedMoment.category];
  const expiresDate = new Date(selectedMoment.expiresAt);
  const now = new Date();
  const hoursLeft = Math.max(0, Math.round((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60)));

  return (
    // The sheet is sized to the map area (not the whole screen), so on a short phone its top is never hidden
    // under the header; the close button stays put while the content scrolls inside.
    <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="absolute inset-x-2 bottom-2 sm:left-6 sm:right-auto sm:bottom-6 sm:max-w-md z-30 flex flex-col max-h-[calc(100%-1rem)] sm:max-h-[calc(100%-3rem)]">
      <div className="relative glass-panel rounded-lg overflow-hidden shadow-2xl text-white flex flex-col min-h-0">
        <button
          onClick={() => setSelectedMoment(null)}
          aria-label="Close"
          className="absolute top-2.5 right-2.5 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-xl text-white hover:bg-black/80 active:scale-95 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        {onBackToMap && (
          <button
            onClick={onBackToMap}
            className="sm:hidden absolute top-2.5 left-2.5 z-20 h-9 px-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-xl text-white text-xs font-bold active:scale-95 transition-colors"
          >
            <MapIcon className="w-3.5 h-3.5 text-slate-200" />
            <span>Back to map</span>
          </button>
        )}
        <div className="overflow-y-auto overscroll-contain min-h-0">
        {/* Header Photo (if available) */}
        {selectedMoment.photoUrl && (
          <div className="relative h-44 sm:h-52 w-full overflow-hidden bg-slate-900">
            <img
              src={selectedMoment.photoUrl}
              alt={selectedMoment.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E17] via-transparent to-black/40" />

            {/* Badges on photo */}
            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-md flex items-center gap-1.5 ${catMeta.badgeClass}`}
              >
                {catMeta.label}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-black/40 backdrop-blur-xl text-slate-200 border border-white/10 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {hoursLeft > 0 ? `Expires in ${hoursLeft}h` : 'Expiring soon'}
              </span>
              {selectedMoment.isBlurred && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/40 text-slate-200 border border-white/10">
                  Approximate location (±180 m)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-5">
          {!selectedMoment.photoUrl && (
            <div className={`flex items-center justify-between mb-3 pr-10 ${onBackToMap ? 'max-sm:mt-9' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${catMeta.badgeClass} flex items-center gap-1`}
                >
                  {catMeta.label}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-200 border border-white/10 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {hoursLeft}h left
                </span>
              </div>
            </div>
          )}

          {/* User info & Timestamp */}
          <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <img
                src={selectedMoment.userAvatar}
                alt={selectedMoment.userName}
                className="w-5 h-5 rounded-full object-cover border border-white/10"
              />
              <span className="font-semibold text-slate-200">@{selectedMoment.userName}</span>
              <span className="px-1.5 py-0.2 rounded text-[11px] bg-white/10 text-slate-300">
                Rep {selectedMoment.userReputation}
              </span>
            </div>
            <span>
              {formatDistanceToNow(new Date(selectedMoment.createdAt), { addSuffix: true })}
            </span>
          </div>

          {/* Title & Description */}
          <h2 className="text-base sm:text-lg font-bold text-white mb-2 leading-snug">
            {selectedMoment.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mb-4 whitespace-pre-line leading-relaxed">
            {selectedMoment.description}
          </p>

          {/* Location details */}
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 bg-white/5 p-2.5 rounded-md border border-white/10">
            <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="truncate">{selectedMoment.approxAddress}</span>
            {selectedMoment.distanceKm !== undefined && (
              <span className="ml-auto font-medium text-slate-200 shrink-0">
                {selectedMoment.distanceKm < 1
                  ? `${Math.round(selectedMoment.distanceKm * 1000)}m away`
                  : `${selectedMoment.distanceKm.toFixed(1)}km away`}
              </span>
            )}
          </div>

          {/* Real-time Reactions Bar */}
          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2 flex items-center justify-between">
              <span>Reactions</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {selectedMoment.viewsCount} views
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { type: 'helpful', label: 'Helpful', Icon: ThumbsUp, count: selectedMoment.reactions.helpful },
                  { type: 'trending', label: 'Trending', Icon: Flame, count: selectedMoment.reactions.trending },
                  { type: 'confirmed', label: 'Verified', Icon: CheckCircle2, count: selectedMoment.reactions.confirmed },
                  { type: 'interested', label: 'Interested', Icon: Heart, count: selectedMoment.reactions.interested },
                  { type: 'going', label: 'Going', Icon: PartyPopper, count: selectedMoment.reactions.going }
                ] as const
              ).map((r) => {
                const isActive = selectedMoment.userReaction === r.type;
                return (
                  <button
                    key={r.type}
                    onClick={() => toggleReaction(selectedMoment.id, r.type)}
                    className={`flex flex-col items-center justify-center p-2 rounded-md transition-all ease-apple ${
                      isActive
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                    } border active:scale-95`}
                  >
                    <r.Icon className="w-4 h-4 mb-1" />
                    <span className="text-xs font-bold leading-none">{r.count}</span>
                    <span className="text-[11px] text-slate-400 tracking-tighter truncate w-full text-center mt-1">
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedMoment.category === 'alerts' && selectedMoment.confirmedNearby !== undefined && (
            <div
              className="mb-4 flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-xs text-slate-200"
              data-testid="confirmed-nearby"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0" />
              <span>
                {selectedMoment.confirmedNearby > 0
                  ? `Confirmed by ${selectedMoment.confirmedNearby} ${selectedMoment.confirmedNearby === 1 ? 'person' : 'people'} nearby`
                  : 'Not confirmed yet. Near it? Tap Verified to confirm.'}
              </span>
            </div>
          )}

          {/* 3D First-Person Wayfinding Navigation Trigger */}
          {onStartNavigation && (
            <button
              onClick={() => {
                onStartNavigation(selectedMoment);
                setSelectedMoment(null);
              }}
              className="w-full py-2.5 px-3 rounded-md bg-signal-500 hover:bg-signal-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all ease-apple shadow-lg active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" />
              <span>Walk there in 3D</span>
            </button>
          )}

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              onClick={() => onOpenComments(selectedMoment.id)}
              className="flex-1 py-2.5 px-3 rounded-md bg-white/5 hover:bg-white/10 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors border border-white/10"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Discussion ({selectedMoment.commentCount})</span>
            </button>

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: selectedMoment.title,
                    text: selectedMoment.description,
                    url: window.location.href
                  }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(
                    `PULSE: "${selectedMoment.title}" at ${selectedMoment.approxAddress}`
                  );
                  alert('Moment summary copied to clipboard!');
                }
              }}
              className="p-2.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 transition-colors border border-white/10"
              title="Share Moment"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onOpenReport(selectedMoment.id)}
              className="p-2.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
              title="Report content"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
          </div>
        </div>
        </div>
      </div>
    </motion.div>
  );
};
