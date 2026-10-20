import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Drawer } from 'vaul';
import { AnimatePresence, motion } from 'framer-motion';

const MOBILE_QUERY = '(max-width: 639px)';

/** True on phone-width screens, where sheets become drawers */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}

/** Keeps the last non-empty value, so a closing sheet can finish animating out with its content */
export function useRetained<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(null);
  if (value != null && value !== (false as unknown)) last.current = value;
  return last.current;
}

export const EASE = [0.16, 1, 0.3, 1] as const;

interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog */
  label: string;
  /** Max width on larger screens */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Classes for the panel body (height, flex, padding, scrolling) */
  className?: string;
  /** false when the content scrolls itself (chat panes): the body then becomes a plain flex column */
  scroll?: boolean;
  children: React.ReactNode;
}

const WIDTH: Record<NonNullable<ResponsiveSheetProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl'
};

/**
 * One surface for every modal. Phones get a drag-to-dismiss bottom drawer (vaul); larger screens
 * get a centred dialog that eases in (Radix for focus handling, framer-motion for the movement).
 */
export const ResponsiveSheet: React.FC<ResponsiveSheetProps> = ({
  open,
  onClose,
  label,
  size = 'md',
  className = '',
  scroll = true,
  children
}) => {
  const mobile = useIsMobile();
  const bodyScroll = scroll ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden';
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  if (mobile) {
    return (
      <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()} shouldScaleBackground={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col rounded-t-xl border border-b-0 border-white/10 sheet-surface text-white outline-none"
          >
            <Drawer.Title className="sr-only">{label}</Drawer.Title>
            <div className="mx-auto mt-2.5 mb-1 h-1 w-9 shrink-0 rounded-full bg-white/20" aria-hidden />
            <div className={`min-h-0 flex-1 pb-[env(safe-area-inset-bottom)] ${bodyScroll} ${className}`}>
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
            </Dialog.Overlay>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className={`pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full ${WIDTH[size]} flex-col overflow-hidden rounded-xl sheet-surface text-white outline-none`}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: EASE }}
                >
                  <Dialog.Title className="sr-only">{label}</Dialog.Title>
                  <div className={`min-h-0 flex-1 ${bodyScroll} ${className}`}>{children}</div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};
