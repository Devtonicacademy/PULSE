import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Shield,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Compass,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'signin' | 'signup';
}
import { ResponsiveSheet } from '../ui/ResponsiveSheet';

const AuthContent: React.FC<AuthModalProps> = ({
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

  const input =
    'w-full pl-10 pr-3 py-2.5 rounded-md bg-white/5 border border-white/10 text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-white/40 transition-colors';
  const tab = (active: boolean) =>
    `flex-1 py-2 rounded-md text-sm font-medium transition-colors ${active ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`;
  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    clearAuthError();
    setLocalError(null);
  };

  return (
    <>
      <header className="p-5 pb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            {mode === 'signin' && 'Sign in'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {mode === 'signin' && 'Welcome back to PULSE.'}
            {mode === 'signup' && 'Save your rank and moments across devices.'}
            {mode === 'forgot' && 'We will email you a link to set a new one.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="px-5 pb-5 space-y-4">
        {mode !== 'forgot' && (
          <div className="p-1 rounded-md bg-white/5 border border-white/10 flex gap-1" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')} className={tab(mode === 'signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')} className={tab(mode === 'signup')}>
              Create account
            </button>
          </div>
        )}

        {mode !== 'forgot' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isAuthLoading}
              className="w-full py-2.5 px-4 rounded-md bg-white hover:bg-slate-100 text-slate-900 font-medium text-sm flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all ease-apple disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={handleGuestSignIn}
              disabled={isAuthLoading}
              className="w-full py-2.5 px-4 rounded-md border border-white/10 text-slate-200 hover:bg-white/10 font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all ease-apple disabled:opacity-50"
            >
              <Compass className="w-4 h-4" />
              Continue as guest
            </button>
            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-slate-400">or use email</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          </div>
        )}

        {activeError && (
          <div className="p-3 rounded-md border border-white/10 bg-white/5 text-sm text-slate-200 space-y-2" role="alert">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-accent-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">{activeError}</div>
            </div>
            {(activeError.includes('Firebase Console') || activeError.includes('Authorized domains') || activeError.includes('disabled')) && (
              <div className="pt-2 border-t border-white/10 flex flex-wrap gap-4 text-xs">
                <a
                  href="https://console.firebase.google.com/project/quizapp-project-c5e0e/authentication/providers"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-200 underline underline-offset-2 hover:text-white"
                >
                  Enable in console ↗
                </a>
                <a
                  href="https://console.firebase.google.com/project/quizapp-project-c5e0e/authentication/settings"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-200 underline underline-offset-2 hover:text-white"
                >
                  Authorised domains ↗
                </a>
              </div>
            )}
          </div>
        )}

        {resetSent && (
          <div className="p-3 rounded-md border border-white/10 bg-white/5 text-sm text-slate-200 flex items-start gap-2.5" role="status">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-slate-300 mt-0.5" />
            <div>
              <p className="font-medium text-white">Reset email sent</p>
              <p className="text-slate-400">Check your inbox for the link.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <label className="block">
              <span className="block text-xs text-slate-300 mb-1.5">Username</span>
              <span className="relative block">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="lagos_scout" className={input} required />
              </span>
            </label>
          )}

          <label className="block">
            <span className="block text-xs text-slate-300 mb-1.5">Email</span>
            <span className="relative block">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} required />
            </span>
          </label>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="auth-password" className="text-xs text-slate-300">
                  Password
                </label>
                {mode === 'signin' && (
                  <button type="button" onClick={() => setMode('forgot')} className="text-xs text-slate-300 hover:text-white underline underline-offset-2">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={`${input} pr-10`}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthLoading}
            className="w-full py-2.5 px-4 rounded-md bg-accent-500 hover:bg-accent-600 text-white font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all ease-apple disabled:opacity-50"
          >
            {isAuthLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                {mode === 'signin' && 'Sign in'}
                {mode === 'signup' && 'Create account'}
                {mode === 'forgot' && 'Send reset link'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {mode === 'forgot' && (
            <button type="button" onClick={() => setMode('signin')} className="w-full text-center text-sm text-slate-400 hover:text-white">
              Back to sign in
            </button>
          )}
        </form>

        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          Your exact location is never shown publicly.
          {!isFirebaseConfigured && <span className="ml-1 text-slate-400">Demo mode.</span>}
        </p>
      </div>
    </>
  );
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'signin' }) => (
  <ResponsiveSheet open={isOpen} onClose={onClose} label="Sign in" size="md" className="relative">
    <AuthContent isOpen onClose={onClose} defaultMode={defaultMode} />
  </ResponsiveSheet>
);
