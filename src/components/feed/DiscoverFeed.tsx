import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { RadiusKm, MomentCategory, FeedCategoryFilter, Moment } from '../../types/pulse';
import { generateLocalAISummary } from '../../services/aiSummaryService';
import { CATEGORY_HEX } from '../../theme/tokens.js';
import {
  Sparkles,
  Clock,
  MessageCircle,
  ShieldAlert,
  Search,
  Users,
  Compass,
  ArrowRight,
  BadgeCheck,
  Navigation,
  SlidersHorizontal,
  ChevronDown,
  ThumbsUp,
  Flame,
  CircleCheck,
  Heart,
  PartyPopper
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DiscoverFeedProps {
  onOpenComments: (momentId: string) => void;
  onOpenReport: (momentId: string) => void;
  onSelectCommunity: (communityId: string) => void;
  onNavigateMoment?: (moment: Moment) => void;
  onOpenMoment: (momentId: string) => void;
}

const CATEGORY_LABELS: Record<FeedCategoryFilter, string> = {
  all: 'All',
  business_pins: 'Business',
  events: 'Events',
  activities: 'Activities',
  community: 'Community',
  food_drinks: 'Food & drink',
  deals: 'Deals',
  recommendations: 'Tips',
  alerts: 'Alerts',
  lost_found: 'Lost & found'
};

const CATEGORY_ORDER: FeedCategoryFilter[] = [
  'all',
  'events',
  'activities',
  'community',
  'food_drinks',
  'deals',
  'recommendations',
  'alerts',
  'lost_found',
  'business_pins'
];

/** Colour lives only in a small dot; everything else on the page is neutral */
const dotColor = (category: FeedCategoryFilter) =>
  category === 'all' ? '#94a3b8' : category === 'business_pins' ? '#FCD34D' : CATEGORY_HEX[category] ?? '#94a3b8';

const Dot: React.FC<{ category: FeedCategoryFilter }> = ({ category }) => (
  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor(category) }} />
);

const REACTIONS = [
  { type: 'helpful', Icon: ThumbsUp, label: 'Helpful' },
  { type: 'trending', Icon: Flame, label: 'Trending' },
  { type: 'confirmed', Icon: CircleCheck, label: 'Confirmed' },
  { type: 'interested', Icon: Heart, label: 'Interested' },
  { type: 'going', Icon: PartyPopper, label: 'Going' }
] as const;

const SORTS = [
  { id: 'trending', label: 'Trending' },
  { id: 'newest', label: 'Newest' },
  { id: 'expiring', label: 'Expiring soon' }
] as const;

type FeedSort = (typeof SORTS)[number]['id'];

const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export const DiscoverFeed: React.FC<DiscoverFeedProps> = ({
  onOpenComments,
  onOpenReport,
  onSelectCommunity,
  onNavigateMoment,
  onOpenMoment
}) => {
  const {
    radiusKm,
    setRadiusKm,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredMoments,
    temporaryCommunities,
    toggleReaction,
    currentPulseScore,
    currentZoneName
  } = usePulse();

  const [feedSort, setFeedSort] = useState<FeedSort>('trending');
  const [showFilters, setShowFilters] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const aiSummary = generateLocalAISummary(filteredMoments, radiusKm, currentZoneName);

  const sortedMoments = [...filteredMoments].sort((a, b) => {
    if (feedSort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (feedSort === 'expiring') return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    return b.engagementScore - a.engagementScore;
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100">
      <header className="sticky top-0 z-20 glass-header">
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4 pb-3 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white">Discover</h1>
              <p className="text-xs text-slate-400 truncate">
                {sortedMoments.length} {sortedMoments.length === 1 ? 'moment' : 'moments'} within {radiusKm} km of {currentZoneName}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-semibold leading-none text-white">{currentPulseScore}</div>
              <div className="text-xs text-slate-400 mt-1">Pulse score</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search moments"
                aria-label="Search moments"
                className="w-full pl-9 pr-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-white/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border shrink-0 transition-colors ${
                showFilters ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden min-[420px]:inline">Filters</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFilters && (
            <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-lg border border-white/10 bg-white/5 animate-fade-in">
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Range</div>
                <div className="flex flex-wrap gap-1.5">
                  {([1, 2, 5, 10, 25] as RadiusKm[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={radiusKm === r}
                      onClick={() => setRadiusKm(r)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        radiusKm === r ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {r} km
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-400 mb-2">Sort by</div>
                <div className="flex flex-wrap gap-1.5">
                  {SORTS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={feedSort === o.id}
                      onClick={() => setFeedSort(o.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        feedSort === o.id ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Category">
            {CATEGORY_ORDER.map((id) => {
              const on = selectedCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSelectedCategory(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap border transition-colors ${
                    on ? 'bg-white/10 border-white/30 text-white' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {id !== 'all' && <Dot category={id} />}
                  {CATEGORY_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Summary */}
        <section className="rounded-lg border border-white/10 bg-white/5">
          <button
            type="button"
            onClick={() => setIsSummaryOpen((v) => !v)}
            aria-expanded={isSummaryOpen}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <Sparkles className="w-4 h-4 text-slate-300 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-slate-400">AI summary</span>
              <span className="block text-sm font-medium text-white truncate">{aiSummary.headline}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isSummaryOpen ? 'rotate-180' : ''}`} />
          </button>
          {isSummaryOpen && (
            <ul className="px-4 pb-4 pt-1 space-y-2 border-t border-white/10 animate-fade-in">
              {aiSummary.bullets.map((bullet, idx) => (
                <li key={idx} className="text-sm text-slate-300 leading-relaxed pt-2">
                  {bullet}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pop-up hubs */}
        {temporaryCommunities.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-white">Pop-up hubs</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {temporaryCommunities.map((comm) => (
                <button
                  key={comm.id}
                  type="button"
                  onClick={() => onSelectCommunity(comm.id)}
                  className="group min-w-[15rem] max-w-[15rem] p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-colors shrink-0"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="capitalize">{comm.triggerType}</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {comm.memberCount}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-white line-clamp-1">{comm.name}</div>
                  <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{comm.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-slate-300 group-hover:text-white">
                    Join <ArrowRight className="w-3 h-3" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Moments */}
        <section aria-label="Moments">
          {sortedMoments.length === 0 ? (
            <div className="text-center py-20 px-4 rounded-lg border border-white/10 bg-white/5">
              <Compass className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <h2 className="text-sm font-medium text-white">Nothing here yet</h2>
              <p className="text-sm text-slate-400 max-w-xs mx-auto mt-1">Try a wider range, or post the first moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedMoments.map((moment) => {
                const hoursLeft = Math.max(0, Math.round((new Date(moment.expiresAt).getTime() - Date.now()) / 3_600_000));
                const categoryName = moment.isBusiness ? 'Business' : CATEGORY_LABELS[moment.category as MomentCategory];
                return (
                  <article
                    key={moment.id}
                    className="flex flex-col rounded-lg border border-white/10 bg-white/5 hover:border-white/20 overflow-hidden transition-colors"
                  >
                    {moment.photoUrl && (
                      <button type="button" onClick={() => onOpenMoment(moment.id)} className="block h-40 w-full overflow-hidden bg-slate-950" aria-label={`Open ${moment.title}`}>
                        <img src={moment.photoUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    )}

                    <div className="flex flex-col flex-1 p-4">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Dot category={moment.isBusiness ? 'business_pins' : moment.category} />
                          <span className="truncate">{categoryName}</span>
                          {moment.isBusiness && <BadgeCheck className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-label="Verified" />}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {hoursLeft > 0 ? `${hoursLeft}h left` : 'Ending soon'}
                        </span>
                      </div>

                      <h3 className="mt-2 text-base font-semibold text-white leading-snug">
                        <button type="button" onClick={() => onOpenMoment(moment.id)} className="text-left hover:underline underline-offset-2">
                          {moment.title}
                        </button>
                      </h3>
                      <p className="mt-1 text-sm text-slate-400 line-clamp-2 leading-relaxed">{moment.description}</p>

                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 min-w-0">
                        <img src={moment.userAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                        <span className="truncate">
                          {moment.isBusiness ? moment.businessName || moment.userName : `@${moment.userName}`}
                          {' · '}
                          {formatDistanceToNow(new Date(moment.createdAt), { addSuffix: true })}
                          {moment.distanceKm !== undefined && ` · ${formatDistance(moment.distanceKm)}`}
                        </span>
                      </div>

                      <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5 -ml-2 overflow-x-auto no-scrollbar">
                          {REACTIONS.map(({ type, Icon, label }) => {
                            const active = moment.userReaction === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => toggleReaction(moment.id, type)}
                                aria-pressed={active}
                                aria-label={`${label}, ${moment.reactions[type]}`}
                                title={label}
                                className={`flex items-center gap-1 px-2 py-1.5 [@media(pointer:coarse)]:py-2 rounded-md text-xs transition-colors ${
                                  active ? 'text-accent-400 bg-accent-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {moment.reactions[type]}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {onNavigateMoment && (
                            <button
                              type="button"
                              onClick={() => onNavigateMoment(moment)}
                              title="Walk there in 3D"
                              aria-label="Walk there in 3D"
                              className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/5"
                            >
                              <Navigation className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenComments(moment.id)}
                            title="Comments"
                            aria-label={`Comments, ${moment.commentCount}`}
                            className="flex items-center gap-1 p-2 rounded-md text-xs text-slate-400 hover:text-white hover:bg-white/5"
                          >
                            <MessageCircle className="w-4 h-4" />
                            {moment.commentCount}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenReport(moment.id)}
                            title="Report"
                            aria-label="Report"
                            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/5"
                          >
                            <ShieldAlert className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
