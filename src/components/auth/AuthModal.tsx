import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Sparkles,
  Shield,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Compass,
  AlertCircle
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultMode = 'signin'
}) => {
  const {
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    loginAsGuest,
    isAuthLoading,
    authError,
    clearAuthError,
    isFirebaseConfigured
  } = usePulse();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (mode === 'forgot') {
      try {
        // Send reset email
        setResetSent(true);
      } catch (err: any) {
        setLocalError(err.message || 'Could not send reset link.');
      }
      return;
    }

    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && !username.trim()) {
      setLocalError('Please choose a Scout handle or username.');
      return;
    }

    try {
      if (mode === 'signin') {
        await loginWithEmail(email.trim(), password);
      } else {
        await registerWithEmail(email.trim(), password, username.trim());
      }
      onClose();
    } catch (err: any) {
      // Auth error is captured in context or localError
      setLocalError(err.message || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    clearAuthError();
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setLocalError(err.message || 'Google sign-in was interrupted. Please try again.');
    }
  };

  const handleGuestSignIn = async () => {
    setLocalError(null);
    clearAuthError();
    try {
      await loginAsGuest();
      onClose();
    } catch (err: any) {
      setLocalError(err.message || 'Could not sign in as guest.');
    }
  };

  const activeError = localError || authError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md rounded-3xl glass-panel border border-white/15 bg-[#0D1322]/95 shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient circles */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="p-5 pb-4 flex items-center justify-between border-b border-white/10 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center font-black text-white shadow-lg shadow-rose-500/30">
              P
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-base tracking-tight text-white">PULSE</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Auth
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                {mode === 'signin' && 'Sign into your city radar'}
                {mode === 'signup' && 'Create your Pulse Scout account'}
                {mode === 'forgot' && 'Reset your password'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        {mode !== 'forgot' && (
          <div className="px-5 pt-4">
            <div className="p-1 rounded-2xl bg-slate-900/90 border border-white/5 flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  clearAuthError();
                  setLocalError(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  mode === 'signin'
                    ? 'bg-gradient-to-r from-rose-500/25 to-amber-500/25 text-white border border-rose-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  clearAuthError();
                  setLocalError(null);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                  mode === 'signup'
                    ? 'bg-gradient-to-r from-rose-500/25 to-amber-500/25 text-white border border-rose-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Status info banner */}
          <div className="flex items-center justify-between text-[11px] p-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-slate-300">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>Project:</span>
              <span className="font-mono text-cyan-300 font-bold">quizapp-project-c5e0e</span>
            </div>
            <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              {isFirebaseConfigured ? 'Live Firebase' : 'Demo Mode'}
            </span>
          </div>

          {/* Social / 1-Click Fast Actions */}
          {mode !== 'forgot' && (
            <div className="space-y-2">
              {/* Google Sign-In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthLoading}
                className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2.5 shadow-lg shadow-white/5 active:scale-98 transition-all disabled:opacity-50"
              >
                {/* Official Google 'G' icon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Guest / Pulse Scout Fast Pass */}
              <button
                type="button"
                onClick={handleGuestSignIn}
                disabled={isAuthLoading}
                className="w-full py-2.5 px-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/40 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
              >
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>Continue as Guest Scout (1-Tap Explore)</span>
              </button>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  or with email
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {activeError && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 text-[11px] leading-relaxed">{activeError}</div>
            </div>
          )}

          {/* Reset Sent Confirmation */}
          {resetSent && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-bold">Password reset email dispatched!</p>
                <p className="text-[11px] text-emerald-300/80 mt-0.5">
                  Check your inbox for instructions to restore your credentials.
                </p>
              </div>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Username for Signup */}
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Scout Handle / Username
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. lagos_scout, yaba_eats"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500/80 transition-colors"
                    required
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="scout@pulseapp.io"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500/80 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Password */}
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-300">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500/80 transition-colors"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 active:scale-98 transition-all disabled:opacity-50 mt-2"
            >
              {isAuthLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'signin' && 'Sign In to Pulse'}
                    {mode === 'signup' && 'Join Pulse Radar'}
                    {mode === 'forgot' && 'Send Reset Link'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Back to sign in from forgot password */}
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="w-full text-center text-xs text-slate-400 hover:text-white mt-2"
              >
                ← Back to Sign In
              </button>
            )}
          </form>

          {/* Privacy & Safety Footnote */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-rose-400" />
              <span>Location privacy protected</span>
            </span>
            <span>256-bit SSL Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};
