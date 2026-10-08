import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Flame, MapPin, MessageCircle, Clock } from 'lucide-react';
import { usePulse } from '../../context/PulseContext';
import { RadiusKm } from '../../types/pulse';
import { CATEGORY_META } from './HotspotBottomSheet';

type Snap = 'peek' | 'half' | 'full';

const SNAPS: Snap[] = ['peek', 'half', 'full'];
const PEEK_PX = 74;
const SNAP_RATIO = { half: 0.5, full: 0.88 };
const RADII: RadiusKm[] = [1, 2, 5, 10, 25];

/**
 * The default area view on the map tab: the neighbourhood's pulse and its live moments in a
 * bottom sheet you drag between peek, half and full height. It steps aside while a moment or
 * zone detail sheet is open, and publishes its height as --area-sheet-h so map controls clear it.
 */
export const AreaSheet: React.FC = () => {
  const {
    currentZoneName,
    currentPulseScore,
    radiusKm,
    setRadiusKm,
    filteredMoments,
    selectedMoment,
    selectedZone,
    setSelectedMoment
  } = usePulse();

  const rootRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const [snap, setSnap] = useState<Snap>('peek');
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; lastY: number; lastT: number; velocity: number } | null>(null);

  const snapHeight = useCallback(
    (s: Snap) => (s === 'peek' ? PEEK_PX : Math.round(containerH * SNAP_RATIO[s])),
    [containerH]
  );
  const height = dragH ?? snapHeight(snap);
  const hidden = Boolean(selectedMoment || selectedZone);

  // Track the map container's height so snap points stay proportional
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setContainerH(parent.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // Let the map controls clear the sheet (they read --area-sheet-h on the shared parent)
  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const visible = !hidden && snap !== 'full' && dragH === null;
    parent.style.setProperty('--area-sheet-h', visible ? `${height}px` : '0px');
  }, [height, hidden, snap, dragH]);

  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    return () => {
      parent?.style.removeProperty('--area-sheet-h');
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setDragH(height);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (d.lastY - e.clientY) / dt; // px per ms, positive = moving up
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragH(Math.min(snapHeight('full'), Math.max(PEEK_PX, d.startH + (d.startY - e.clientY))));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || dragH === null) return;
    // A quick flick carries on a little; a slow drag settles on the nearest snap point
    const projected = dragH + d.velocity * 220;
    const nearest = SNAPS.reduce((best, s) =>
      Math.abs(snapHeight(s) - projected) < Math.abs(snapHeight(best) - projected) ? s : best
    );
    // A tap on the handle (no movement) cycles instead
    const moved = Math.abs(dragH - d.startH) > 4;
    setSnap(moved ? nearest : SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]);
    setDragH(null);
  };

  const onHandleKey = (e: React.KeyboardEvent) => {
    const i = SNAPS.indexOf(snap);
    if (e.key === 'ArrowUp') setSnap(SNAPS[Math.min(2, i + 1)]);
    if (e.key === 'ArrowDown') setSnap(SNAPS[Math.max(0, i - 1)]);
    if (e.key === 'Enter' || e.key === ' ') setSnap(SNAPS[(i + 1) % 3]);
  };

  const sorted = [...filteredMoments].sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

  return (
    <div
      ref={rootRef}
      aria-hidden={hidden}
      className={`absolute bottom-0 left-0 right-0 sm:left-4 sm:right-auto sm:w-[26rem] z-[35] flex flex-col glass-panel rounded-t-3xl border-b-0 text-white ${
        dragH === null ? 'transition-[height,transform] duration-300 ease-out' : ''
      } ${hidden ? 'translate-y-full pointer-events-none' : ''}`}
      style={{ height }}
    >
      <div
        role="slider"
        tabIndex={hidden ? -1 : 0}
        aria-label="Area sheet height"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={SNAPS.indexOf(snap)}
        aria-valuetext={snap}
        onKeyDown={onHandleKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none select-none px-4 pt-2 pb-3 focus:outline-none"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-400">
              <MapPin className="w-3 h-3" /> Around you
            </div>
            <div className="truncate text-sm font-extrabold">{currentZoneName}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">
              {sorted.length} live · {radiusKm}km
            </span>
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent-500/15 border border-accent-500/30 text-xs font-black text-accent-300">
              <Flame className="w-3 h-3" />
              {currentPulseScore}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-2 overscroll-contain">
        <div className="flex items-center gap-1.5 px-1 pb-1">
          {RADII.map((r) => (
            <button
              key={r}
              onClick={() => setRadiusKm(r)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                radiusKm === r
                  ? 'bg-accent-500 border-accent-400 text-white'
                  : 'bg-slate-900/70 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>

        {sorted.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-400">
            Nothing live within {radiusKm}km yet. Widen the radius or broadcast the first moment.
          </p>
        )}

        {sorted.map((m) => {
          const meta = CATEGORY_META[m.category];
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMoment(m)}
              className="w-full flex gap-3 text-left p-2.5 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-signal-400/40 transition-colors"
            >
              {m.photoUrl ? (
                <img src={m.photoUrl} alt="" loading="lazy" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-800" />
              ) : (
                <div className="w-14 h-14 rounded-xl shrink-0 bg-slate-800 flex items-center justify-center text-2xl">{meta.icon}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${meta.badgeClass}`}>{meta.label}</span>
                  {m.distanceKm !== undefined && (
                    <span className="text-[10px] text-slate-400">
                      {m.distanceKm < 1 ? `${Math.round(m.distanceKm * 1000)}m` : `${m.distanceKm.toFixed(1)}km`}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs font-bold mt-0.5">{m.title}</div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    {m.commentCount}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
