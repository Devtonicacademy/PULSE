import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { BadgeCheck, Plus, Clock, CircleCheck, ArrowUpRight, Minus } from 'lucide-react';

const PIN_TYPES = ['Flash Sale', 'Happy Hour', 'Food Truck', 'Limited Offer'] as const;
type PinType = (typeof PIN_TYPES)[number];

const field =
  'w-full px-3 py-2.5 rounded-md bg-white/5 border border-white/10 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-white/30';

const Metric: React.FC<{ label: string; value: React.ReactNode; note: string; trend?: 'up' | 'flat' }> = ({ label, value, note, trend }) => (
  <div className="p-4">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 flex items-center gap-2">
      <span className="text-xl font-semibold text-white">{value}</span>
      {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-slate-300" aria-label="Trending up" />}
      {trend === 'flat' && <Minus className="w-4 h-4 text-slate-400" aria-label="Holding steady" />}
    </div>
    <div className="mt-0.5 text-xs text-slate-400">{note}</div>
  </div>
);

export const BusinessDashboard: React.FC = () => {
  const { businesses, businessPosts, addBusinessPost, setActiveTab } = usePulse();

  const biz = businesses[0];
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [pinType, setPinType] = useState<PinType>('Flash Sale');
  const [title, setTitle] = useState('');
  const [offer, setOffer] = useState('');
  const [durationHours, setDurationHours] = useState(6);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleCreatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !offer.trim()) return;

    addBusinessPost({ title: title.trim(), offer: offer.trim(), livePinType: pinType, durationHours });

    setTitle('');
    setOffer('');
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      setIsCreatingPin(false);
    }, 1500);
  };

  return (
    <div className="h-full overflow-y-auto pb-24 text-slate-100">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src={biz.avatar} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0" />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold tracking-tight text-white">
                <span className="truncate">{biz.name}</span>
                <BadgeCheck className="w-5 h-5 text-slate-300 shrink-0" aria-label="Verified business" />
              </h1>
              <p className="text-sm text-slate-400 truncate">
                {biz.category} · {biz.location}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="h-9 px-3.5 rounded-md text-sm font-medium border border-white/10 text-slate-200 hover:bg-white/10 whitespace-nowrap self-start sm:self-auto"
          >
            Switch to resident
          </button>
        </header>

        <section aria-label="Performance" className="rounded-lg border border-white/10 bg-white/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-white/10 sm:[&>*:nth-child(n+3)]:border-t-0">
            <Metric label="Views" value={biz.stats.views.toLocaleString()} note="+18% this week" trend="up" />
            <Metric label="Reach" value={biz.stats.reach.toLocaleString()} note="Within 10 km" trend="up" />
            <Metric label="Pin clicks" value={biz.stats.clicks} note="From hotspots" trend="flat" />
            <Metric label="Engagement" value={`${biz.stats.engagementRate}%`} note="Top 5% in your sector" trend="up" />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Live pins</h2>
              <p className="text-sm text-slate-400">Promotions shown on the map to people nearby.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreatingPin(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium shrink-0"
            >
              <Plus className="w-4 h-4" /> New pin
            </button>
          </div>

          {isCreatingPin && (
            <form onSubmit={handleCreatePin} className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">New live pin</h3>
                <button type="button" onClick={() => setIsCreatingPin(false)} className="text-sm text-slate-400 hover:text-white">
                  Cancel
                </button>
              </div>

              {isSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-md border border-white/10 bg-white/5 text-sm text-slate-200" role="status">
                  <CircleCheck className="w-4 h-4" /> Pin is live on the map.
                </div>
              )}

              <div>
                <div className="text-xs text-slate-400 mb-1.5">Type</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PIN_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t}
                      aria-pressed={pinType === t}
                      onClick={() => setPinType(t)}
                      className={`py-2 px-3 rounded-md text-sm border transition-colors ${
                        pinType === t ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-xs text-slate-400 mb-1.5">Headline</span>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="2-for-1 cocktails" required className={field} />
              </label>

              <label className="block">
                <span className="block text-xs text-slate-400 mb-1.5">Details</span>
                <textarea rows={2} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="Valid until 8 PM. Show this pin to claim." required className={field} />
              </label>

              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Duration
                </span>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="bg-slate-900 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  <option value={3}>3 hours</option>
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                </select>
              </label>

              <button type="submit" className="w-full h-10 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium">
                Publish pin
              </button>
            </form>
          )}

          {businessPosts.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400 rounded-lg border border-white/10 bg-white/5">No live pins yet.</p>
          ) : (
            <ul className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10">
              {businessPosts.map((post) => (
                <li key={post.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{post.livePinType}</span>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Until midnight
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-medium text-white">{post.title}</h3>
                    <p className="text-sm text-slate-400 line-clamp-2">{post.offer}</p>
                  </div>
                  <dl className="flex items-center gap-6 text-sm shrink-0">
                    <div>
                      <dt className="text-xs text-slate-400">Views</dt>
                      <dd className="font-medium text-white">{post.views}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Clicks</dt>
                      <dd className="font-medium text-white">{post.clicks}</dd>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
