import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import {
  BadgeCheck,
  TrendingUp,
  Eye,
  MousePointer,
  Flame,
  Plus,
  Clock,
  Sparkles,
  DollarSign,
  Radio,
  CheckCircle2
} from 'lucide-react';

export const BusinessDashboard: React.FC = () => {
  const {
    businesses,
    businessPosts,
    addBusinessPost,
    currentLocation,
    setIsBusinessMode
  } = usePulse();

  const biz = businesses[0]; // Sky Lounge & Bistro by default
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [pinType, setPinType] = useState<
    'Happy Hour' | 'Food Truck' | 'Flash Sale' | 'Limited Offer'
  >('Flash Sale');
  const [title, setTitle] = useState('');
  const [offer, setOffer] = useState('');
  const [durationHours, setDurationHours] = useState(6);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleCreatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !offer.trim()) return;

    addBusinessPost({
      title: title.trim(),
      offer: offer.trim(),
      livePinType: pinType,
      durationHours
    });

    setTitle('');
    setOffer('');
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      setIsCreatingPin(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100 p-4 sm:p-6 space-y-5 max-w-6xl mx-auto w-full">
      {/* Top Profile Header */}
      <div className="rounded-3xl glass-panel p-5 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <img
                src={biz.avatar}
                alt={biz.name}
                className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500/40 shadow-xl"
              />
              <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-slate-900">
                <BadgeCheck className="w-5 h-5 text-amber-400 fill-amber-400/20" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">{biz.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Verified Business
                </span>
              </div>
              <p className="text-xs text-slate-400">{biz.category} • {biz.location}</p>
            </div>
          </div>

          <button
            onClick={() => setIsBusinessMode(false)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white border border-white/10 transition-colors"
          >
            Switch to Resident View
          </button>
        </div>

        {/* Business Metrics Grid (Feature 10: Views, Reach, Clicks, Engagement) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Views</span>
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg font-black text-white">{biz.stats.views.toLocaleString()}</div>
            <div className="text-[10px] text-emerald-400 font-medium">↑ +18% this week</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Reach</span>
              <Radio className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-lg font-black text-white">{biz.stats.reach.toLocaleString()}</div>
            <div className="text-[10px] text-slate-400">Within 10km radius</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Pin Clicks</span>
              <MousePointer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-black text-white">{biz.stats.clicks}</div>
            <div className="text-[10px] text-amber-400 font-medium">Hotspot referrals</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider">Engagement</span>
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-lg font-black text-white">{biz.stats.engagementRate}%</div>
            <div className="text-[10px] text-purple-400 font-medium">Industry Top 5%</div>
          </div>
        </div>
      </div>

      {/* Live Pins Management Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" /> Active Live Pins on Map
          </h3>
          <p className="text-[11px] text-slate-400">
            Promoted real-time beacons visible to users within your selected radius
          </p>
        </div>
        <button
          onClick={() => setIsCreatingPin(true)}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" /> Drop Live Pin
        </button>
      </div>

      {/* Live Pin Creator Drawer/Modal */}
      {isCreatingPin && (
        <div className="rounded-3xl glass-panel p-5 border border-amber-500/30 bg-slate-950/80 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>⚡</span> Configure Live Pin Beacon
            </h4>
            <button
              onClick={() => setIsCreatingPin(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreatePin} className="space-y-3">
            {isSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Live Pin deployed successfully to nearby map radars!</span>
              </div>
            )}

            {/* Pin Type */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Select Pin Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Flash Sale', 'Happy Hour', 'Food Truck', 'Limited Offer'] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setPinType(t)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      pinType === t
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-white/5'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Beacon Headline
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 2-for-1 Cocktails & Tapas Platter"
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Offer Details & Call to Action
              </label>
              <textarea
                rows={2}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="e.g. Valid until 8:00 PM today! Show this Live Pin to your server to claim discount."
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Live Pin Duration:
              </span>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none"
              >
                <option value={3}>3 Hours (Flash)</option>
                <option value={6}>6 Hours (Evening)</option>
                <option value={12}>12 Hours (Full Day)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
            >
              Deploy Live Pin to Map
            </button>
          </form>
        </div>
      )}

      {/* List of active business posts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {businessPosts.map((post) => (
          <div
            key={post.id}
            className="p-4 rounded-2xl glass-panel border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span>⚡</span> {post.livePinType}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" /> Active until midnight
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white">{post.title}</h4>
              <p className="text-xs text-slate-300 mt-0.5">{post.offer}</p>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
              <div className="text-center">
                <div className="font-bold text-white">{post.views}</div>
                <div className="text-[9px] uppercase">Views</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-amber-400">{post.clicks}</div>
                <div className="text-[9px] uppercase">Clicks</div>
              </div>
              <div className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                ● Broadcasting
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
