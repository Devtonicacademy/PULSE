import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { MomentCategory } from '../../types/pulse';
import {
  X,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  EyeOff,
  Image as ImageIcon,
  AlertCircle,
  Check
} from 'lucide-react';

interface CreateMomentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: {
  id: MomentCategory;
  label: string;
  icon: string;
  desc: string;
  color: string;
}[] = [
  { id: 'events', label: 'Events', icon: '🎉', desc: 'Concerts, parties, gatherings', color: 'from-purple-500/20 to-purple-600/30' },
  { id: 'alerts', label: 'Alerts', icon: '🚨', desc: 'Traffic, road block, safety', color: 'from-rose-500/20 to-rose-600/30' },
  { id: 'food_drinks', label: 'Food & Drinks', icon: '🍔', desc: 'Pop-ups, food trucks, tastings', color: 'from-amber-500/20 to-amber-600/30' },
  { id: 'deals', label: 'Deals', icon: '🛍️', desc: 'Flash sales, limited offers', color: 'from-pink-500/20 to-pink-600/30' },
  { id: 'activities', label: 'Activities', icon: '🏃', desc: 'Run clubs, games, workouts', color: 'from-emerald-500/20 to-emerald-600/30' },
  { id: 'recommendations', label: 'Recommendations', icon: '💡', desc: 'Hidden spots, cafes, views', color: 'from-cyan-500/20 to-cyan-600/30' },
  { id: 'lost_found', label: 'Lost & Found', icon: '🔍', desc: 'Lost pets, keys, items', color: 'from-blue-500/20 to-blue-600/30' },
  { id: 'community', label: 'Community', icon: '💬', desc: 'Local talk, book clubs, news', color: 'from-indigo-500/20 to-indigo-600/30' }
];

const SAMPLE_PHOTOS = [
  { label: 'Food Fest', url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80' },
  { label: 'Live Music', url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80' },
  { label: 'Coffee Pop-up', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80' },
  { label: 'Night Market', url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80' },
  { label: 'Traffic Alert', url: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=800&q=80' }
];

export const CreateMomentModal: React.FC<CreateMomentModalProps> = ({
  isOpen,
  onClose
}) => {
  const { currentLocation, addMoment, userProfile } = usePulse();

  const [category, setCategory] = useState<MomentCategory>('events');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [lifespanHours, setLifespanHours] = useState<number>(24); // 24h default, 48h optional
  const [blurPrivacy, setBlurPrivacy] = useState<boolean>(true); // Feature 13: Privacy default ON
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim() || title.length < 5) {
      setError('Please provide a descriptive title (at least 5 characters).');
      return;
    }
    if (!description.trim() || description.length < 10) {
      setError('Please provide enough context (at least 10 characters).');
      return;
    }

    setIsSubmitting(true);

    try {
      addMoment({
        title: title.trim(),
        description: description.trim(),
        category,
        photoUrl: photoUrl.trim() || undefined,
        lifespanHours,
        blurPrivacy
      });

      // Reset & close
      setTitle('');
      setDescription('');
      setPhotoUrl('');
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create Moment.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl glass-panel border border-white/10 shadow-2xl p-5 text-white animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Broadcast Live Moment</h2>
              <p className="text-[11px] text-slate-400">
                Share what is happening around you right now
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gamification Reward Banner */}
        <div className="my-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
          <span className="text-amber-300 font-medium flex items-center gap-1.5">
            <span>🏆</span> Earn <strong>+15 Reputation Points</strong> upon broadcast
          </span>
          <span className="text-[10px] text-slate-400">Current Rep: {userProfile.reputation}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Category Selection Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Select Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const isSelected = category === c.id;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-rose-500/20 border-rose-500 text-white shadow-lg shadow-rose-500/15'
                        : 'bg-slate-900/60 border-white/5 text-slate-300 hover:border-white/10'
                    }`}
                  >
                    <div className="text-xl mb-1">{c.icon}</div>
                    <div className="text-xs font-bold leading-tight truncate">{c.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Moment Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Secret Taco Pop-up at Freedom Park"
              maxLength={100}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40"
            />
          </div>

          {/* 3. Description Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              What's happening right now?
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give details: crowd size, vibes, entry conditions, parking or traffic status..."
              maxLength={400}
              required
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40"
            />
            <div className="text-right text-[10px] text-slate-500 mt-0.5">
              {description.length}/400 characters
            </div>
          </div>

          {/* 4. Photo Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Photo Attachment (Optional)
            </label>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {SAMPLE_PHOTOS.map((p, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setPhotoUrl(photoUrl === p.url ? '' : p.url)}
                  className={`relative w-16 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                    photoUrl === p.url ? 'border-rose-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                  {photoUrl === p.url && (
                    <div className="absolute inset-0 bg-rose-500/40 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Or paste any custom image URL..."
              className="w-full mt-2 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-white/5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none"
            />
          </div>

          {/* 5. Expiration & GPS Verification Settings */}
          <div className="p-3 rounded-xl bg-slate-900/70 border border-white/10 space-y-3">
            {/* Lifespan */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Moment Lifespan:</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setLifespanHours(24)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                    lifespanHours === 24 ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  24 Hours (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setLifespanHours(48)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                    lifespanHours === 48 ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  48 Hours
                </button>
              </div>
            </div>

            {/* GPS Proximity Check */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                GPS Verification:
              </span>
              <span className="text-[11px] font-medium text-emerald-400">
                Verified at {currentLocation.name}
              </span>
            </div>

            {/* Feature 13: Privacy Blurring */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <div>
                <div className="text-slate-200 font-medium flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
                  Privacy Location Blurring
                </div>
                <div className="text-[10px] text-slate-400">
                  Adds safe ±180m jitter; hides exact private home address
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlurPrivacy(!blurPrivacy)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  blurPrivacy ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                    blurPrivacy ? 'right-1' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 active:scale-98 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Broadcast to Pulse Radar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
