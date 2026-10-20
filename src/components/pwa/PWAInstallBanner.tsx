import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveSheet, EASE } from '../ui/ResponsiveSheet';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Download,
  X,
  Share,
  PlusSquare,
  Smartphone,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

interface PWAInstallBannerProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  forceShow = false,
  onClose
}) => {
  const { isInstallable, isInstalled, isIOS, promptToInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Check if previously dismissed in this session
  useEffect(() => {
    const isDismissed = sessionStorage.getItem('pulse_pwa_dismissed') === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem('pulse_pwa_dismissed', 'true');
    setDismissed(true);
    if (onClose) onClose();
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    const outcome = await promptToInstall();
    if (outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => {
        handleDismiss();
      }, 2000);
    } else if (outcome === 'manual_ios') {
      setShowIOSModal(true);
    }
  };

  // If already installed, don't show unless forced
  if (isInstalled && !forceShow) return null;

  // If dismissed and not forced, don't show
  if (dismissed && !forceShow) return null;

  return (
    <>
      {/* Floating Bottom Installation Prompt */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.6 }} className="absolute bottom-20 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-40">
        <div className="glass-panel rounded-lg p-3 sm:p-4 border border-white/10 shadow-2xl !bg-slate-950 text-white">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-accent-500 flex items-center justify-center text-white shadow-lg shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Install PULSE
                  </h4>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Add it to your home screen for alerts and a full-screen map.
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1 rounded-full text-slate-400 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Value Props Pills */}
          <div className="hidden sm:grid grid-cols-3 gap-1.5 py-2 my-1 border-y border-white/5 text-[11px] text-slate-300">
            <div className="flex items-center gap-1">
              <span>Launches in one tap</span>
            </div>
            <div className="flex items-center gap-1">
              <span>Nearby alerts</span>
            </div>
            <div className="flex items-center gap-1">
              <span>Full-screen map</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-1 sm:pt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            >
              Not now
            </button>

            <button
              onClick={handleInstallClick}
              className="flex-1 py-2 px-3 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ease-apple"
            >
              {installSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Installed!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Install</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* iOS Instructions Modal (Since iOS Safari doesn't fire beforeinstallprompt) */}
      <ResponsiveSheet open={showIOSModal} onClose={() => setShowIOSModal(false)} label="Install on iPhone or iPad" size="sm" className="p-5">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-accent-400" />
                <h3 className="text-sm font-bold text-white">Install on iPhone / iPad</h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Apple Safari lets you install PULSE directly to your Home Screen in 2 quick steps:
            </p>

            <div className="space-y-3 mb-5">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="p-2 rounded-md bg-white/10 text-slate-200 shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Step 1: Tap Share</div>
                  <div className="text-xs text-slate-400">
                    Tap the <strong>Share</strong> icon in the bottom Safari toolbar.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="p-2 rounded-md bg-white/10 text-slate-200 shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Step 2: Add to Home Screen</div>
                  <div className="text-xs text-slate-400">
                    Scroll down and select <strong>"Add to Home Screen"</strong>.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-md bg-accent-500 text-white font-bold text-xs uppercase tracking-wide shadow-lg active:scale-[0.98] transition-all ease-apple"
            >
              Got it, thanks!
            </button>
          </div>
      </ResponsiveSheet>
    </>
  );
};
