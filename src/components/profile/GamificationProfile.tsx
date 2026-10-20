import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { ReputationBadge } from '../../types/pulse';
import { AdminModerationPanel } from '../moderation/AdminModerationPanel';
import {
  Shield,
  Flame,
  Utensils,
  TriangleAlert,
  Crown,
  Compass,
  Briefcase,
  CircleCheck,
  ChevronRight,
  Settings,
  LogIn,
  LogOut,
  UserRound,
  Lock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const BADGES: Record<ReputationBadge, { Icon: typeof Shield; desc: string }> = {
  'Local Scout': { Icon: Compass, desc: 'Posted more than 5 accurate local moments.' },
  Trailblazer: { Icon: Flame, desc: 'Had a moment reach the trending hotspots.' },
  'Food Hunter': { Icon: Utensils, desc: 'Shared verified food spots and pop-ups.' },
  'Community Hero': { Icon: Shield, desc: 'Kept a helpful-reaction rate above 90%.' },
  'Safety Reporter': { Icon: TriangleAlert, desc: 'Reported timely emergency and traffic alerts.' },
  'Local Legend': { Icon: Crown, desc: 'Reached the top 1% of activity in the city.' }
};

type ProfileTab = 'badges' | 'active' | 'archived';

interface GamificationProfileProps {
  onOpenSettings?: () => void;
}

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="p-4">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-semibold text-white">{value}</div>
  </div>
);

const outlineButton =
  'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap';

export const GamificationProfile: React.FC<GamificationProfileProps> = ({ onOpenSettings }) => {
  const {
    userProfile,
    moments,
    setSelectedMoment,
    setActiveTab: goTo,
    isAuthenticated,
    isAdmin,
    setIsAuthModalOpen,
    logout,
    avatarConfig
  } = usePulse();
  const [tab, setTab] = useState<ProfileTab>('badges');

  const myMoments = moments.filter((m) => m.userId === userProfile.id);
  const myActive = myMoments.filter((m) => !m.isArchived);
  const myArchived = myMoments.filter((m) => m.isArchived);

  const tabs: { id: ProfileTab; label: string; count: number }[] = [
    { id: 'badges', label: 'Badges', count: userProfile.badges.length },
    { id: 'active', label: 'Live', count: myActive.length },
    { id: 'archived', label: 'Archived', count: myArchived.length }
  ];

  return (
    <div className="h-full overflow-y-auto pb-24 text-slate-100">
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <img src={userProfile.avatar} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-white/10 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white truncate">@{userProfile.username}</h1>
              <p className="text-sm text-slate-400 flex items-center gap-1.5">
                {isAuthenticated ? (
                  <>
                    <CircleCheck className="w-3.5 h-3.5" /> {userProfile.providerId === 'google.com' ? 'Google account' : 'Verified'}
                  </>
                ) : (
                  'Guest'
                )}
                <span aria-hidden>·</span> Tier 3 Scout
              </p>
              {userProfile.bio && <p className="mt-1.5 text-sm text-slate-300 line-clamp-2">{userProfile.bio}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => goTo('setup')} className={outlineButton}>
              <UserRound className="w-4 h-4" />
              {avatarConfig ? 'Edit avatar' : 'Set up avatar'}
            </button>
            {onOpenSettings && (
              <button type="button" onClick={onOpenSettings} className={outlineButton}>
                <Settings className="w-4 h-4" />
                Settings
              </button>
            )}
            {isAuthenticated ? (
              <button type="button" onClick={() => logout()} className={outlineButton}>
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-md text-sm font-medium bg-accent-500 hover:bg-accent-600 text-white transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </button>
            )}
          </div>
        </header>

        <section aria-label="Reputation" className="rounded-lg border border-white/10 bg-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-white/10 sm:[&>*:nth-child(n+3)]:border-t-0">
            <Stat label="Reputation" value={<>{userProfile.reputation}<span className="text-sm font-normal text-slate-400"> / 100</span></>} />
            <Stat label="Points" value={userProfile.points} />
            <Stat label="Badges" value={userProfile.badges.length} />
            <Stat label="Live moments" value={myActive.length} />
          </div>
          <div className="px-4 pb-4">
            <div
              className="h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuenow={userProfile.reputation}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Reputation score"
            >
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${userProfile.reputation}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">Each verified moment earns 15 points.</p>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-1 border-b border-white/10 overflow-x-auto no-scrollbar" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-accent-500 text-white font-medium' : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {t.label} <span className="text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === 'badges' && (
              <ul className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10">
                {(Object.keys(BADGES) as ReputationBadge[]).map((key) => {
                  const { Icon, desc } = BADGES[key];
                  const unlocked = userProfile.badges.includes(key);
                  return (
                    <li key={key} className={`flex items-center gap-4 px-4 py-3.5 `}>
                      <Icon className="w-5 h-5 text-slate-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium ${unlocked ? 'text-white' : 'text-slate-300'}`}>{key}</div>
                        <div className="text-sm text-slate-400">{desc}</div>
                      </div>
                      {unlocked ? (
                        <CircleCheck className="w-4 h-4 text-slate-300 shrink-0" aria-label="Earned" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-400 shrink-0" aria-label="Locked" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {tab === 'active' &&
              (myActive.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400 rounded-lg border border-white/10 bg-white/5">
                  No live moments. Tap + to post one.
                </p>
              ) : (
                <ul className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10">
                  {myActive.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => setSelectedMoment(m)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white truncate">{m.title}</span>
                          <span className="block text-xs text-slate-400 truncate">{m.approxAddress}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {tab === 'archived' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">Moments move here 24 hours after you post them.</p>
                {myArchived.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400 rounded-lg border border-white/10 bg-white/5">Nothing archived yet.</p>
                ) : (
                  <ul className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10">
                    {myArchived.map((m) => (
                      <li key={m.id} className="px-4 py-3.5">
                        <div className="text-sm text-slate-300 truncate">{m.title}</div>
                        <div className="text-xs text-slate-400">Expired {formatDistanceToNow(new Date(m.expiresAt), { addSuffix: true })}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        <button type="button" onClick={() => goTo('business')} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <Briefcase className="w-4 h-4" />
          Open business portal
        </button>

        {isAdmin && <AdminModerationPanel />}
      </div>
    </div>
  );
};
