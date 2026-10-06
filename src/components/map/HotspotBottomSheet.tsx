import React from 'react';
import { usePulse } from '../../context/PulseContext';
import { ReactionType, MomentCategory } from '../../types/pulse';
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
  Navigation
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HotspotBottomSheetProps {
  onOpenComments: (momentId: string) => void;
  onOpenReport: (momentId: string) => void;
}

const CATEGORY_META: Record<
  MomentCategory,
  { label: string; icon: string; badgeClass: string }
> = {
  events: { label: 'Event', icon: '🎉', badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  alerts: { label: 'Alert', icon: '🚨', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  food_drinks: { label: 'Food & Drink', icon: '🍔', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  lost_found: { label: 'Lost & Found', icon: '🔍', badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  recommendations: { label: 'Recommendation', icon: '💡', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  activities: { label: 'Activity', icon: '🏃', badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  deals: { label: 'Deal', icon: '🛍️', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  community: { label: 'Community', icon: '💬', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
};

export const HotspotBottomSheet: React.FC<HotspotBottomSheetProps> = ({
  onOpenComments,
  onOpenReport
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
      <div className="absolute bottom-20 left-2 right-2 sm:left-6 sm:bottom-6 sm:max-w-md sm:right-auto z-30 animate-slide-up">
        <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-2xl text-white">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-rose-400" /> Hotspot Zone
                </span>
                <span className="text-xs text-slate-400">Activity Radius 2.5km</span>
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
            <div className="text-center p-2 rounded-xl bg-slate-800/40">
              <div className="text-2xl font-black text-rose-400">{selectedZone.activityScore}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Pulse Score</div>
            </div>
            <div className="text-center p-2 rounded-xl bg-slate-800/40">
              <div className="text-2xl font-black text-amber-400">{selectedZone.momentCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Active Moments</div>
            </div>
            <div className="text-center p-2 rounded-xl bg-slate-800/40">
              <div className="text-2xl font-black text-cyan-400">{selectedZone.activeUsers}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">People Nearby</div>
            </div>
          </div>

          <p className="text-xs text-slate-300 mb-3">{selectedZone.summary}</p>

          <button
            onClick={() => setSelectedZone(null)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-transform"
          >
            <Navigation className="w-3.5 h-3.5" /> Explore Moments in this Zone
          </button>
        </div>
      </div>
    );
  }

  if (!selectedMoment) return null;

  const catMeta = CATEGORY_META[selectedMoment.category];
  const expiresDate = new Date(selectedMoment.expiresAt);
  const now = new Date();
  const hoursLeft = Math.max(0, Math.round((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60)));

  return (
    <div className="absolute bottom-20 left-2 right-2 sm:left-6 sm:bottom-6 sm:max-w-md sm:right-auto z-30 animate-slide-up max-h-[80vh] overflow-y-auto">
      <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl text-white">
        {/* Header Photo (if available) */}
        {selectedMoment.photoUrl && (
          <div className="relative h-44 sm:h-52 w-full overflow-hidden bg-slate-900">
            <img
              src={selectedMoment.photoUrl}
              alt={selectedMoment.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E17] via-transparent to-black/40" />

            {/* Close Button */}
            <button
              onClick={() => setSelectedMoment(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Badges on photo */}
            <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-md flex items-center gap-1.5 ${catMeta.badgeClass}`}
              >
                <span>{catMeta.icon}</span> {catMeta.label}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                {hoursLeft > 0 ? `Expires in ${hoursLeft}h` : 'Expiring soon'}
              </span>
              {selectedMoment.isBlurred && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                  🛡️ Blurred Location (±180m)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-5">
          {!selectedMoment.photoUrl && (
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${catMeta.badgeClass} flex items-center gap-1`}
                >
                  <span>{catMeta.icon}</span> {catMeta.label}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {hoursLeft}h left
                </span>
              </div>
              <button
                onClick={() => setSelectedMoment(null)}
                className="p-1.5 rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* User info & Timestamp */}
          <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <img
                src={selectedMoment.userAvatar}
                alt={selectedMoment.userName}
                className="w-5 h-5 rounded-full object-cover border border-slate-700"
              />
              <span className="font-semibold text-slate-200">@{selectedMoment.userName}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-amber-400">
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
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-4 bg-slate-800/40 p-2.5 rounded-xl border border-white/5">
            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
              <span>Community Pulse</span>
              <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                <Eye className="w-3 h-3" /> {selectedMoment.viewsCount} views
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  { type: 'helpful', label: 'Helpful', emoji: '👍', count: selectedMoment.reactions.helpful },
                  { type: 'trending', label: 'Trending', emoji: '🔥', count: selectedMoment.reactions.trending },
                  { type: 'confirmed', label: 'Verified', emoji: '✅', count: selectedMoment.reactions.confirmed },
                  { type: 'interested', label: 'Interested', emoji: '❤️', count: selectedMoment.reactions.interested },
                  { type: 'going', label: 'Going', emoji: '🎉', count: selectedMoment.reactions.going }
                ] as const
              ).map((r) => {
                const isActive = selectedMoment.userReaction === r.type;
                return (
                  <button
                    key={r.type}
                    onClick={() => toggleReaction(selectedMoment.id, r.type)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all ${
                      isActive
                        ? 'bg-rose-500/25 border-rose-500/50 scale-105 shadow-lg shadow-rose-500/20 text-white'
                        : 'bg-slate-800/60 hover:bg-slate-800 border-white/5 text-slate-300'
                    } border active:scale-95`}
                  >
                    <span className="text-base sm:text-lg mb-0.5">{r.emoji}</span>
                    <span className="text-xs font-bold leading-none">{r.count}</span>
                    <span className="text-[9px] text-slate-400 tracking-tighter truncate w-full text-center mt-1">
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            <button
              onClick={() => onOpenComments(selectedMoment.id)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors border border-white/5"
            >
              <MessageCircle className="w-4 h-4 text-cyan-400" />
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
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-300 transition-colors border border-white/5"
              title="Share Moment"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onOpenReport(selectedMoment.id)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors border border-white/5"
              title="Report content"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
