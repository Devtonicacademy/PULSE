import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Download,
  X,
  Share,
  PlusSquare,
  Sparkles,
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
      <div className="absolute bottom-20 left-3 right-3 sm:left-4 sm:right-4 z-40 animate-slide-up">
        <div className="glass-panel rounded-2xl p-4 border border-accent-500/30 shadow-2xl bg-gradient-to-r from-slate-950/95 via-slate-900/95 to-slate-950/95 text-white">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-500 to-accent2-500 flex items-center justify-center text-white shadow-lg shadow-accent-500/30 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Install PULSE App
                  </h4>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-accent-500/20 text-accent-300 border border-accent-500/30">
                    PWA
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Get real-time nearby alerts and full-screen map experience.
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
          <div className="grid grid-cols-3 gap-1.5 py-2 my-1 border-y border-white/5 text-[10px] text-slate-300">
            <div className="flex items-center gap-1">
              <span className="text-accent-400">⚡</span>
              <span>Fast 1-tap launch</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-signal-400">🚨</span>
              <span>Proximity radar</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-amber-400">📱</span>
              <span>Native app feel</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-colors"
            >
              Maybe Later
            </button>

            <button
              onClick={handleInstallClick}
              className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent2-500 hover:from-accent-600 hover:to-accent2-600 text-white text-xs font-bold shadow-lg shadow-accent-500/20 flex items-center justify-center gap-1.5 active:scale-98 transition-all"
            >
              {installSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Installed!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Install Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* iOS Instructions Modal (Since iOS Safari doesn't fire beforeinstallprompt) */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl glass-panel border border-white/10 p-5 shadow-2xl text-white animate-slide-up">
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
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
                <div className="p-2 rounded-xl bg-signal-500/20 text-signal-400 shrink-0">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Step 1: Tap Share</div>
                  <div className="text-[11px] text-slate-400">
                    Tap the <strong>Share</strong> icon in the bottom Safari toolbar.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
                <div className="p-2 rounded-xl bg-accent-500/20 text-accent-400 shrink-0">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Step 2: Add to Home Screen</div>
                  <div className="text-[11px] text-slate-400">
                    Scroll down and select <strong>"Add to Home Screen"</strong>.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-accent-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-accent-500/25 active:scale-98 transition-all"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
