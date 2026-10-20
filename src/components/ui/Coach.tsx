import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE } from './ResponsiveSheet';

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CoachProps {
  /** Value of the `data-tour` attribute on the element to point at; null hides the tip */
  target: string | null;
  text: string;
  title?: string;
  placement?: Placement;
  /** "2 of 5" style progress */
  progress?: string;
  /** Dim the page around the target (the target itself stays clickable) */
  spotlight?: boolean;
  onDismiss?: () => void;
  /** Footer buttons, e.g. Back / Next */
  children?: React.ReactNode;
}

const ARROW_BORDERS: Record<'top' | 'bottom' | 'left' | 'right', React.CSSProperties> = {
  bottom: { borderTopWidth: 1, borderLeftWidth: 1 },
  top: { borderBottomWidth: 1, borderRightWidth: 1 },
  right: { borderLeftWidth: 1, borderBottomWidth: 1 },
  left: { borderTopWidth: 1, borderRightWidth: 1 }
};

const CARD_W = 264;
const GAP = 14;
const MARGIN = 12;

/** The first element with this tour id that is actually on screen (the nav exists twice: sidebar and bottom bar) */
function findTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return node;
  }
  return null;
}

function pickPlacement(rect: Rect, vw: number, vh: number, wanted: Placement): Exclude<Placement, 'auto'> {
  if (wanted !== 'auto') return wanted;
  const cx = rect.left + rect.width / 2;
  if (vw >= 1024 && rect.left + rect.width < 340 && rect.top > 60) return 'right';
  if (rect.top > vh * 0.5) return 'top';
  if (cx < 0 || cx > vw) return 'bottom';
  return 'bottom';
}

/**
 * A sleek tooltip with an arrow that points at a real element. It follows the element as the page
 * scrolls or resizes, and glides to the next target when `target` changes.
 */
export const Coach: React.FC<CoachProps> = ({
  target,
  text,
  title,
  placement = 'auto',
  progress,
  spotlight = false,
  onDismiss,
  children
}) => {
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(120);
  const cardRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Track the target's position
  useEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last = '';
    const measure = () => {
      const el = findTarget(target);
      if (el) {
        const r = el.getBoundingClientRect();
        const key = `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`;
        if (key !== last) {
          last = key;
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      } else if (last !== 'none') {
        last = 'none';
        setRect(null);
      }
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  if (!mounted) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const side = rect ? pickPlacement(rect, vw, vh, placement) : 'bottom';

  let x = 0;
  let y = 0;
  let arrow = { left: 0, top: 0 };
  if (rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (side === 'top' || side === 'bottom') {
      x = Math.min(Math.max(cx - CARD_W / 2, MARGIN), vw - CARD_W - MARGIN);
      y = side === 'top' ? rect.top - cardH - GAP : rect.top + rect.height + GAP;
      arrow = { left: Math.min(Math.max(cx - x, 20), CARD_W - 20), top: side === 'top' ? cardH : 0 };
    } else {
      y = Math.min(Math.max(cy - cardH / 2, MARGIN), vh - cardH - MARGIN);
      x = side === 'left' ? rect.left - CARD_W - GAP : rect.left + rect.width + GAP;
      arrow = { left: side === 'left' ? CARD_W : 0, top: Math.min(Math.max(cy - y, 20), cardH - 20) };
    }
    y = Math.min(Math.max(y, MARGIN), vh - cardH - MARGIN);
  }

  return createPortal(
    <AnimatePresence>
      {rect && (
        <>
          {spotlight && (
            <motion.div
              key="spot"
              aria-hidden
              className="pointer-events-none fixed z-[89] rounded-lg"
              style={{ boxShadow: '0 0 0 9999px rgba(4, 7, 14, 0.62), 0 0 0 1.5px rgba(255,255,255,0.35)' }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                left: rect.left - 6,
                top: rect.top - 6,
                width: rect.width + 12,
                height: rect.height + 12
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            />
          )}
          <motion.div
            key="card"
            ref={cardRef}
            role="status"
            className="fixed left-0 top-0 z-[90]"
            style={{ width: CARD_W }}
            initial={{ opacity: 0, x, y: y + (side === 'top' ? 8 : -8), scale: 0.96 }}
            animate={{ opacity: 1, x, y, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, opacity: { duration: 0.2 } }}
          >
            <div className="relative rounded-lg border border-white/20 coach-card p-3.5 text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
              <span
                aria-hidden
                className="absolute h-3 w-3 rotate-45 border-white/20 coach-card"
                style={{
                  left: arrow.left - 6,
                  top: arrow.top - 6,
                  ...ARROW_BORDERS[side]
                }}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {progress && <div className="mb-0.5 text-xs text-slate-400">{progress}</div>}
                  {title && <div className="text-sm font-semibold leading-snug">{title}</div>}
                </div>
                {onDismiss && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Hide tips"
                    className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className={`text-[13px] leading-relaxed text-slate-300 ${title ? 'mt-1' : ''}`}>{text}</p>
              {children && <div className="mt-3 flex items-center justify-between gap-2">{children}</div>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
