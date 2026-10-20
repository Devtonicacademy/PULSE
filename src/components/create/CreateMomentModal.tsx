import { locate } from '../../services/locationService';
import React, { useEffect, useRef, useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { MomentCategory } from '../../types/pulse';
import {
  compressPhoto,
  uploadPhoto,
  canUploadPhotos,
  formatBytes,
  PhotoUploadError
} from '../../services/photoUploadService';
import { getApproximateAreaName } from '../../utils/geoUtils';
import { LocationPicker } from './LocationPicker';
import { ResponsiveSheet } from '../ui/ResponsiveSheet';
import {
  Camera,
  Loader2,
  Crosshair,
  X,
  MapPin,
  Clock,
  ShieldCheck,
  EyeOff,
  Image as ImageIcon,
  AlertCircle,
  Check,
  Radio,
  Send
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
}[] = [
  { id: 'events', label: 'Events', icon: '🎉', desc: 'Concerts, parties, gatherings' },
  { id: 'alerts', label: 'Alerts', icon: '🚨', desc: 'Traffic, road block, safety' },
  { id: 'food_drinks', label: 'Food & Drinks', icon: '🍔', desc: 'Pop-ups, food trucks, tastings' },
  { id: 'deals', label: 'Deals', icon: '🛍️', desc: 'Flash sales, limited offers' },
  { id: 'activities', label: 'Activities', icon: '🏃', desc: 'Run clubs, games, workouts' },
  { id: 'recommendations', label: 'Recommendations', icon: '💡', desc: 'Hidden spots, cafes, views' },
  { id: 'lost_found', label: 'Lost & Found', icon: '🔍', desc: 'Lost pets, keys, items' },
  { id: 'community', label: 'Community', icon: '💬', desc: 'Local talk, book clubs, news' }
];

const SAMPLE_PHOTOS = [
  { label: 'Food Fest', url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80' },
  { label: 'Live Music', url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80' },
  { label: 'Coffee Pop-up', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80' },
  { label: 'Night Market', url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80' },
  { label: 'Traffic Alert', url: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=800&q=80' }
];

const CreateMomentContent: React.FC<CreateMomentModalProps> = ({
  isOpen,
  onClose
}) => {
  const { currentLocation, addMoment, userProfile, currentUser, setIsAuthModalOpen, radiusKm } = usePulse();

  const [category, setCategory] = useState<MomentCategory>('events');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [lifespanHours, setLifespanHours] = useState<number>(24); // 24h default, 48h optional
  const [blurPrivacy, setBlurPrivacy] = useState<boolean>(true); // Feature 13: Privacy default ON
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Photo picked from the camera or gallery: compressed on the device, then uploaded
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{
    status: 'compressing' | 'uploading' | 'done' | 'error';
    preview?: string;
    bytes?: number;
    width?: number;
    height?: number;
    message?: string;
  } | null>(null);
  const photoBusy = photo?.status === 'compressing' || photo?.status === 'uploading';
  const uploadsAvailable = Boolean(currentUser) && canUploadPhotos();

  // GPS fix for this moment (falls back to the active hub when unavailable or denied)
  const [gps, setGps] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  // Where the moment goes: where the user is, or a spot they choose on a map
  const [placeMode, setPlaceMode] = useState<'here' | 'pick'>('here');
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'ready' | 'unavailable'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setGpsStatus('locating');
    // The moment's position must be real: no IP guess here, and it does not change how the rest of
    // the app reports the user's location. A fresh fix, since the user may have moved.
    locate({ ipFallback: false, report: false, fresh: true }).then(({ fix }) => {
      if (cancelled) return;
      if (fix && fix.source === 'gps') {
        setGps({ latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy });
        setGpsStatus('ready');
      } else {
        setGps(null);
        setGpsStatus('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (photo?.preview) URL.revokeObjectURL(photo.preview);
    };
  }, [photo?.preview]);

  if (!isOpen) return null;

  const handlePhotoPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;

    setError(null);
    setPhoto({ status: 'compressing' });
    try {
      const compressed = await compressPhoto(file);
      const preview = URL.createObjectURL(compressed.blob);
      setPhoto({
        status: 'uploading',
        preview,
        bytes: compressed.blob.size,
        width: compressed.width,
        height: compressed.height
      });
      const url = await uploadPhoto(compressed);
      setPhotoUrl(url);
      setPhoto((prev) => (prev ? { ...prev, status: 'done' } : prev));
    } catch (err) {
      setPhoto((prev) => ({
        ...(prev ?? {}),
        status: 'error',
        message: err instanceof PhotoUploadError ? err.message : 'Could not process that photo.'
      }));
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    if (photoUrl.startsWith('/photos/')) setPhotoUrl('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (photoBusy) {
      setError('Your photo is still uploading. One moment...');
      return;
    }

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
        location:
          placeMode === 'pick' && picked
            ? picked
            : gps
              ? { latitude: gps.latitude, longitude: gps.longitude }
              : undefined,
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
      setPhoto(null);
      setPlaceMode('here');
      setPicked(null);
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create Moment.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-accent-500 text-white shadow-lg">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Broadcast Live Moment</h2>
              <p className="text-xs text-slate-400">
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
        <div className="my-2 sm:my-3 px-3 py-1.5 sm:py-2 rounded-md bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-200 flex items-center gap-1.5 min-w-0">
            <span className="truncate">
              <strong className="font-medium">+15 rep</strong>
              <span className="hidden sm:inline"> when you post</span>
            </span>
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">Rep {userProfile.reputation}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-accent-500/20 border border-white/10 text-accent-300 text-xs flex items-center gap-2">
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
                    className={`p-2.5 sm:p-3 rounded-md border text-left transition-colors ${
                      isSelected
                        ? 'bg-white/10 border-white/30 text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-sm font-medium leading-tight">{c.label}</div>
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
              className="w-full px-3.5 py-2.5 rounded-md bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-white/10 focus:ring-1 focus:ring-accent-500/40"
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
              className="w-full px-3.5 py-2 rounded-md bg-slate-900/80 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-white/10 focus:ring-1 focus:ring-accent-500/40"
            />
            <div className="text-right text-[11px] text-slate-400 mt-0.5">
              {description.length}/400 characters
            </div>
          </div>

          {/* 4. Photo Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Photo Attachment (Optional)
            </label>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoPicked} data-testid="photo-camera" />
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPicked} data-testid="photo-gallery" />
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                disabled={!uploadsAvailable || photoBusy}
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-slate-900/80 border border-white/10 text-xs font-bold text-slate-200 hover:border-white/10 disabled:opacity-40 transition-colors"
              >
                <Camera className="w-3.5 h-3.5 text-signal-400" />
                <span>Take photo</span>
              </button>
              <button
                type="button"
                disabled={!uploadsAvailable || photoBusy}
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-slate-900/80 border border-white/10 text-xs font-bold text-slate-200 hover:border-white/10 disabled:opacity-40 transition-colors"
              >
                <ImageIcon className="w-3.5 h-3.5 text-signal-400" />
                <span>From gallery</span>
              </button>
            </div>
            {!uploadsAvailable && (
              <p className="text-[11px] text-slate-400 mb-2">
                Sign in to upload your own photo, or pick a sample / paste an image link below.
              </p>
            )}
            {photo && (
              <div className="flex items-center gap-3 p-2 mb-2 rounded-md bg-slate-900/70 border border-white/10" data-testid="photo-status">
                {photo.preview ? (
                  <img src={photo.preview} alt="Your photo" className="w-14 h-14 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
                    <Loader2 className="w-4 h-4 animate-spin text-signal-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0 text-xs">
                  {photo.status === 'compressing' && <span className="text-slate-300">Shrinking photo...</span>}
                  {photo.status === 'uploading' && <span className="text-slate-300">Uploading...</span>}
                  {photo.status === 'done' && <span className="text-emerald-400 font-semibold">Photo ready</span>}
                  {photo.status === 'error' && <span className="text-accent-300">{photo.message}</span>}
                  {photo.bytes !== undefined && (
                    <div className="text-slate-400 mt-0.5">
                      {formatBytes(photo.bytes)} · {photo.width}×{photo.height}
                    </div>
                  )}
                </div>
                <button type="button" onClick={removePhoto} className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {SAMPLE_PHOTOS.map((p, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setPhotoUrl(photoUrl === p.url ? '' : p.url)}
                  className={`relative w-16 h-12 rounded-md overflow-hidden shrink-0 border-2 transition-all ease-apple ${
                    photoUrl === p.url ? 'border-accent-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                  {photoUrl === p.url && (
                    <div className="absolute inset-0 bg-accent-500/40 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="Or paste any custom image URL..."
              className="w-full mt-2 px-3 py-1.5 rounded-md bg-slate-900/50 border border-white/5 text-xs text-slate-300 placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* 5. Expiration & GPS Verification Settings */}
          <div className="p-3 rounded-md bg-slate-900/70 border border-white/10 space-y-3">
            {/* Lifespan */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-300" />
                <span>Moment Lifespan:</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-md">
                <button
                  type="button"
                  onClick={() => setLifespanHours(24)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    lifespanHours === 24 ? 'bg-white/15 text-white' : 'text-slate-400'
                  }`}
                >
                  24 Hours<span className="hidden sm:inline"> (Default)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLifespanHours(48)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    lifespanHours === 48 ? 'bg-white/15 text-white' : 'text-slate-400'
                  }`}
                >
                  48 Hours
                </button>
              </div>
            </div>

            {/* Where the moment happens */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-signal-400" />
                  Location
                </span>
                <div className="flex bg-slate-900 p-0.5 rounded-md border border-white/5">
                  <button
                    type="button"
                    onClick={() => setPlaceMode('here')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      placeMode === 'here' ? 'bg-signal-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    Where I am
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlaceMode('pick')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      placeMode === 'pick' ? 'bg-signal-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    Choose on map
                  </button>
                </div>
              </div>
              {placeMode === 'pick' && (
                <LocationPicker
                  center={picked ?? gps ?? currentLocation}
                  onChange={setPicked}
                  onUseMyLocation={gps ? () => setPicked({ latitude: gps.latitude, longitude: gps.longitude }) : undefined}
                />
              )}
            </div>

            {/* GPS Proximity Check */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                GPS Verification:
              </span>
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 text-right" data-testid="gps-status">
                {placeMode === 'pick' && <>Spot chosen on the map</>}
                {placeMode === 'here' && gpsStatus === 'locating' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Finding your GPS location...
                  </>
                )}
                {placeMode === 'here' && gpsStatus === 'ready' && gps && (
                  <>
                    <Crosshair className="w-3 h-3" /> GPS: {getApproximateAreaName(gps.latitude, gps.longitude)} (±{Math.round(gps.accuracy)}m)
                  </>
                )}
                {placeMode === 'here' && (gpsStatus === 'unavailable' || gpsStatus === 'idle') && <>Using {currentLocation.name}</>}
              </span>
            </div>

            {/* Feature 13: Privacy Blurring */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <div>
                <div className="text-slate-200 font-medium flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-signal-400" />
                  Privacy Location Blurring
                </div>
                <div className="text-[11px] text-slate-400">
                  Adds safe ±180m jitter; hides exact private home address
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlurPrivacy(!blurPrivacy)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  blurPrivacy ? 'bg-signal-500' : 'bg-slate-700'
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
          <div className="pt-2 space-y-2">
            {currentUser ? (
              <p className="text-xs text-slate-400 text-center">
                Visible to everyone within {radiusKm} km of this spot.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300">
                <span>Not signed in: only this device will see this moment.</span>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-2.5 py-1 rounded-md bg-accent-500 text-white font-medium shrink-0"
                >
                  Sign in
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-md bg-accent-500 hover:bg-accent-600 text-white font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all ease-apple"
            >
              <Send className="w-4 h-4" />
              <span>{currentUser ? 'Broadcast to Pulse Radar' : 'Save on this device'}</span>
            </button>
          </div>
        </form>
    </>
  );
};

export const CreateMomentModal: React.FC<CreateMomentModalProps> = ({ isOpen, onClose }) => (
  <ResponsiveSheet open={isOpen} onClose={onClose} label="Broadcast a moment" size="lg" className="p-5">
    <CreateMomentContent isOpen onClose={onClose} />
  </ResponsiveSheet>
);
