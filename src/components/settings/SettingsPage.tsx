import React from 'react';
import { Briefcase, Compass, ChevronRight, Download, Layers, LogIn, Monitor, Moon, Palette, SlidersHorizontal, Sun, User } from 'lucide-react';
import { usePulse } from '../../context/PulseContext';
import { useTheme, ThemePreference } from '../../hooks/useTheme';
import { startTour } from '../onboarding/AppTour';
import { usePWAInstall } from '../../hooks/usePWAInstall';

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon }
];

interface SettingsPageProps {
  mapEngine: 'map' | 'pulse3d';
  onToggleMapEngine: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="px-1 text-xs font-medium text-slate-400">{title}</h2>
    <div className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10">{children}</div>
  </section>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; detail?: string; children?: React.ReactNode; onClick?: () => void }> = ({
  icon,
  title,
  detail,
  children,
  onClick
}) => {
  const body = (
    <>
      <span className="text-slate-300 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium text-white">{title}</span>
        {detail && <span className="block text-xs text-slate-400 truncate">{detail}</span>}
      </span>
      {children}
    </>
  );
  const cls = 'w-full flex items-center gap-3.5 px-4 py-3.5';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:bg-white/5 transition-colors`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

const SegButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
      active ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-slate-300 hover:bg-white/10'
    }`}
  >
    {children}
  </button>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ mapEngine, onToggleMapEngine }) => {
  const { isBusinessMode, setActiveTab, userProfile, isAuthenticated, setIsAuthModalOpen } = usePulse();
  const theme = useTheme();
  const { isInstalled, promptToInstall } = usePWAInstall();

  return (
    <div className="h-full overflow-y-auto pb-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Account, appearance and how the map works.</p>
        </header>

        <Section title="Account">
          {isAuthenticated ? (
            <Row icon={<User className="w-5 h-5" />} title={`@${userProfile.username}`} detail="Signed in" />
          ) : (
            <Row icon={<LogIn className="w-5 h-5" />} title="Sign in" detail="Save your rank and moments across devices" onClick={() => setIsAuthModalOpen(true)}>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Row>
          )}
          <Row icon={<Compass className="w-5 h-5" />} title="App tour" detail="A quick look at the main controls" onClick={() => { setActiveTab('map'); setTimeout(startTour, 500); }}>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Row>
          <Row icon={<SlidersHorizontal className="w-5 h-5" />} title="Setup" detail="Interests, range, alerts and avatar" onClick={() => setActiveTab('setup')}>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Row>
        </Section>

        <Section title="Map">
          <Row icon={<Layers className="w-5 h-5" />} title="Map view" detail={mapEngine === 'map' ? 'Flat map' : 'Walkable 3D city'}>
            <div className="flex gap-1.5">
              <SegButton active={mapEngine === 'pulse3d'} onClick={() => mapEngine !== 'pulse3d' && onToggleMapEngine()}>
                3D
              </SegButton>
              <SegButton active={mapEngine === 'map'} onClick={() => mapEngine !== 'map' && onToggleMapEngine()}>
                Map
              </SegButton>
            </div>
          </Row>
        </Section>

        <Section title="Appearance">
          <Row
            icon={<Palette className="w-5 h-5" />}
            title="Theme"
            detail={theme.preference === 'system' ? `Following your device (${theme.resolved})` : `Always ${theme.preference}`}
          >
            <div role="radiogroup" aria-label="Theme" className="flex gap-1.5">
              {THEME_OPTIONS.map(({ value, label }) => (
                <SegButton key={value} active={theme.preference === value} onClick={() => theme.setPreference(value)}>
                  {label}
                </SegButton>
              ))}
            </div>
          </Row>
        </Section>

        <Section title="Mode">
          <Row icon={<Briefcase className="w-5 h-5" />} title="Business portal" detail={isBusinessMode ? 'Managing as a merchant' : 'Browsing as a resident'}>
            <button
              type="button"
              onClick={() => setActiveTab(isBusinessMode ? 'profile' : 'business')}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-white/10 text-slate-200 hover:bg-white/10"
            >
              {isBusinessMode ? 'Switch to resident' : 'Open portal'}
            </button>
          </Row>
        </Section>

        {!isInstalled && (
          <Section title="App">
            <Row icon={<Download className="w-5 h-5" />} title="Install PULSE" detail="Add it to your home screen" onClick={promptToInstall}>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Row>
          </Section>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
