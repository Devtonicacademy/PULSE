import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { ReputationBadge, Moment } from '../../types/pulse';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Award,
  Shield,
  Flame,
  Utensils,
  AlertTriangle,
  Crown,
  Compass,
  Briefcase,
  Archive,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Download,
  Smartphone,
  LogIn,
  LogOut
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const BADGE_CONFIG: Record<
  ReputationBadge,
  { label: string; icon: any; color: string; desc: string; unlocked: boolean }
> = {
  'Local Scout': {
    label: 'Local Scout',
    icon: Compass,
    color: 'from-blue-500 to-cyan-500',
    desc: 'Created over 5 accurate hyper-local moments.',
    unlocked: true
  },
  Trailblazer: {
    label: 'Trailblazer',
    icon: Flame,
    color: 'from-amber-500 to-rose-500',
    desc: 'Authored moments that reached top trending hotspot status.',
    unlocked: true
  },
  'Food Hunter': {
    label: 'Food Hunter',
    icon: Utensils,
    color: 'from-emerald-500 to-teal-500',
    desc: 'Shared verified food pop-ups and artisan spots.',
    unlocked: true
  },
  'Community Hero': {
    label: 'Community Hero',
    icon: Shield,
    color: 'from-purple-500 to-indigo-500',
    desc: 'Maintained over 90% helpful reaction confirmation rate.',
    unlocked: true
  },
  'Safety Reporter': {
    label: 'Safety Reporter',
    icon: AlertTriangle,
    color: 'from-rose-500 to-red-600',
    desc: 'Reported timely emergency and traffic alerts that helped the community.',
    unlocked: false
  },
  'Local Legend': {
    label: 'Local Legend',
    icon: Crown,
    color: 'from-yellow-400 to-amber-600',
    desc: 'Ranked in the top 1% community activity across the city.',
    unlocked: false
  }
};

export const GamificationProfile: React.FC = () => {
  const {
    userProfile,
    moments,
    setIsBusinessMode,
    setSelectedMoment,
    isFirebaseConfigured,
    currentUser,
    isAuthenticated,
    setIsAuthModalOpen,
    logout
  } = usePulse();
  const { isInstalled, promptToInstall, isIOS } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'badges' | 'active' | 'archived'>('badges');

  const myMoments = moments.filter((m) => m.userId === userProfile.id);
  const myActiveMoments = myMoments.filter((m) => !m.isArchived);
  const myArchivedMoments = myMoments.filter((m) => m.isArchived);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100 p-4 sm:p-6 space-y-5 max-w-5xl mx-auto w-full">
      {/* Profile Card */}
      <div className="rounded-3xl glass-panel p-5 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3.5">
            <img
              src={userProfile.avatar}
              alt={userProfile.username}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-rose-500/40 shadow-xl"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">@{userProfile.username}</h2>
                {isAuthenticated ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{userProfile.providerId === 'google.com' ? 'Google Scout' : 'Verified'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Guest Scout
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Tier 3 Scout
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 max-w-xs">{userProfile.bio}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{userProfile.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-500/20 transition-all active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In / Join</span>
              </button>
            ) : (
              <button
                onClick={() => logout()}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
                title="Sign out of Pulse"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}

            <button
              onClick={() => setIsBusinessMode(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 text-xs flex items-center gap-1.5 transition-colors"
              title="Switch to Business Mode"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Business</span>
            </button>
          </div>
        </div>

        {/* Reputation Score & Level Progress */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <div>
                <div className="text-xs font-bold text-white">Reputation Score</div>
                <div className="text-[10px] text-slate-400">Trusted Community Contributor</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-rose-400">
                {userProfile.reputation}
              </span>
              <span className="text-xs text-slate-500 font-bold">/100</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-rose-500 via-amber-500 to-cyan-400 h-2 rounded-full transition-all duration-700"
              style={{ width: `${userProfile.reputation}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Points: {userProfile.points} pts</span>
            <span>+15 pts per verified moment created</span>
          </div>
        </div>

        {/* Consolidated System, Cloud Sync & Install Dock */}
        <div className="mt-4 p-3 rounded-2xl glass-card border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Cloud Sync Status */}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-300">
                {isFirebaseConfigured ? 'Firebase Live Sync' : 'Project Linked'}
              </span>
            </div>

            <span className="text-slate-600 hidden sm:inline">•</span>

            {/* PWA / App Status */}
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-slate-400">
                {isInstalled ? 'Installed App' : 'Mobile Web'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isInstalled && (
              <button
                onClick={() => promptToInstall()}
                className="flex-1 sm:flex-none px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-semibold text-[11px] flex items-center justify-center gap-1 transition-colors border border-white/10"
              >
                <Download className="w-3 h-3 text-rose-400" />
                <span>Install App</span>
              </button>
            )}

            {!isAuthenticated && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-md shadow-rose-500/20 active:scale-95 transition-all"
              >
                <Sparkles className="w-3 h-3" />
                <span>Save Rank</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('badges')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'badges'
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Award className="w-3.5 h-3.5 text-amber-400" />
          <span>Badges & Honors ({userProfile.badges.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'active'
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-rose-400" />
          <span>My Live Moments ({myActiveMoments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'archived'
              ? 'bg-white/10 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Archive className="w-3.5 h-3.5 text-cyan-400" />
          <span>Archived ({myArchivedMoments.length})</span>
        </button>
      </div>

      {/* Badges Shelf View */}
      {activeTab === 'badges' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {(Object.keys(BADGE_CONFIG) as ReputationBadge[]).map((badgeKey) => {
            const b = BADGE_CONFIG[badgeKey];
            const isUnlocked = userProfile.badges.includes(badgeKey);
            const Icon = b.icon;

            return (
              <div
                key={badgeKey}
                className={`p-4 rounded-2xl border transition-all ${
                  isUnlocked
                    ? 'glass-panel border-white/10'
                    : 'bg-slate-900/30 border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`p-2.5 rounded-xl text-white shadow-lg bg-gradient-to-br ${
                      isUnlocked ? b.color : 'from-slate-800 to-slate-900 text-slate-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{b.label}</span>
                      {isUnlocked && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {isUnlocked ? 'Earned & Active' : 'Locked'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{b.desc}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Active Moments Tab */}
      {activeTab === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {myActiveMoments.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-slate-400 glass-panel rounded-2xl">
              No active moments right now. Hit the + button to broadcast!
            </div>
          ) : (
            myActiveMoments.map((m) => (
              <div
                key={m.id}
                onClick={() => setSelectedMoment(m)}
                className="p-3.5 rounded-2xl glass-panel hover:border-white/20 cursor-pointer transition-all flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{m.title}</h4>
                  <p className="text-[10px] text-slate-400">{m.approxAddress}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            ))
          )}
        </div>
      )}

      {/* Archived Moments Tab (Feature 4) */}
      {activeTab === 'archived' && (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] text-slate-400">
            ℹ️ Moments automatically move to your archive 24 hours after broadcast to ensure the city radar stays fresh.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {myArchivedMoments.length === 0 ? (
              <div className="col-span-full p-8 text-center text-xs text-slate-400 glass-panel rounded-2xl">
                No archived moments yet.
              </div>
            ) : (
              myArchivedMoments.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-2xl glass-panel opacity-70 flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-300">{m.title}</h4>
                    <span className="text-[10px] text-slate-500">
                      Expired {formatDistanceToNow(new Date(m.expiresAt), { addSuffix: true })}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                    Archived
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
