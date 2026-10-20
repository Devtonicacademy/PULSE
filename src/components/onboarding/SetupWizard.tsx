import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bus,
  CalendarDays,
  Car,
  Check,
  Dices,
  Footprints,
  Lightbulb,
  LocateFixed,
  Map as MapIcon,
  MessageCircle,
  Search,
  Shuffle,
  ShieldAlert,
  Tag,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { usePulse } from '../../context/PulseContext';
import { MomentCategory, RadiusKm } from '../../types/pulse';
import { DEFAULT_SURVEY, SurveyAnswers } from '../../utils/survey';
import {
  AvatarConfig,
  DEFAULT_AVATAR,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  SKIN_TONES
} from '../avatar/avatarConfig';
import AvatarPreview from '../avatar/AvatarPreview';
import { Coach } from '../ui/Coach';
import { EASE } from '../ui/ResponsiveSheet';
import { startTour } from './AppTour';

type IconType = typeof Check;

const INTERESTS: { id: MomentCategory; label: string; Icon: IconType }[] = [
  { id: 'events', label: 'Events', Icon: CalendarDays },
  { id: 'food_drinks', label: 'Food & drink', Icon: Utensils },
  { id: 'alerts', label: 'Safety alerts', Icon: ShieldAlert },
  { id: 'deals', label: 'Deals', Icon: Tag },
  { id: 'activities', label: 'Activities', Icon: Activity },
  { id: 'community', label: 'Community', Icon: Users },
  { id: 'recommendations', label: 'Tips', Icon: Lightbulb },
  { id: 'lost_found', label: 'Lost & found', Icon: Search }
];
const AROUND: { id: SurveyAnswers['getAround']; label: string; Icon: IconType }[] = [
  { id: 'walk', label: 'On foot', Icon: Footprints },
  { id: 'transit', label: 'Public transport', Icon: Bus },
  { id: 'drive', label: 'Driving', Icon: Car },
  { id: 'mixed', label: 'A bit of everything', Icon: Shuffle }
];
const HOURS: { id: SurveyAnswers['hours'][number]; label: string }[] = [
  { id: 'morning', label: 'Mornings' },
  { id: 'afternoon', label: 'Afternoons' },
  { id: 'evening', label: 'Evenings' },
  { id: 'late', label: 'Late night' }
];
const RADII: RadiusKm[] = [1, 2, 5, 10, 25];

const STEPS = [
  { id: 'welcome', title: 'Welcome', hint: 'What PULSE does' },
  { id: 'location', title: 'Location', hint: 'Find what is near you' },
  { id: 'interests', title: 'Interests', hint: 'What you want to see' },
  { id: 'routine', title: 'Routine', hint: 'How and when you move' },
  { id: 'alerts', title: 'Alerts', hint: 'Range and notifications' },
  { id: 'avatar', title: 'Avatar', hint: 'How you appear on the map' }
] as const;

const HEADINGS: Record<(typeof STEPS)[number]['id'], { title: string; lead: string }> = {
  welcome: { title: 'Welcome to PULSE', lead: 'See what is happening around you right now. Setup takes about a minute and you can change everything later in Settings.' },
  location: { title: 'Turn on location', lead: 'PULSE uses your position to show nearby moments and place you on the map. It is never shown publicly as an exact point.' },
  interests: { title: 'What do you want to see?', lead: 'Pick the topics you care about. Your feed and alerts start from these.' },
  routine: { title: 'How do you get around?', lead: 'This helps us suggest routes and time what we show you.' },
  alerts: { title: 'Set your range', lead: 'Choose how far around you PULSE looks, and whether urgent nearby alerts reach you.' },
  avatar: { title: 'Create your avatar', lead: 'This is how you appear while you walk the map. You can edit it any time.' }
};

/** Where the guide points on each step: first at the control to use, then at the button to continue */
const TIPS: Record<(typeof STEPS)[number]['id'], { target: string; text: string }> = {
  welcome: { target: 'wizard-next', text: 'Start here. Click Get started to begin.' },
  location: { target: 'wizard-location', text: 'Click to share your location. You can also skip this step.' },
  interests: { target: 'wizard-interests', text: 'Tap the topics you care about. Pick as many as you like.' },
  routine: { target: 'wizard-routine', text: 'Choose how you get around and when you are usually out.' },
  alerts: { target: 'wizard-radius', text: 'Pick how far around you PULSE should look.' },
  avatar: { target: 'wizard-avatar', text: 'Try Randomise, or tweak each part on the right.' }
};
const TIPS_KEY = 'pulse_wizard_tips_off';

const option = (active: boolean) =>
  `flex items-center gap-3 px-3.5 py-3 rounded-md border text-left text-sm transition-colors ${
    active
      ? 'bg-white/10 border-white/30 text-white'
      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
  }`;

const Check16: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    className={`ml-auto w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
      on ? 'bg-accent-500 text-white' : 'border border-white/20'
    }`}
  >
    {on && <Check className="w-3 h-3 stroke-[3]" />}
  </span>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium text-slate-400 mb-2">{children}</div>
);

const Swatches: React.FC<{ colors: string[]; value: string; onPick: (c: string) => void; label: string }> = ({
  colors,
  value,
  onPick,
  label
}) => (
  <div>
    <Label>{label}</Label>
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          style={{ background: c }}
          className={`w-7 h-7 rounded-full border transition-transform ${
            value.toLowerCase() === c.toLowerCase() ? 'border-white ring-2 ring-white/30' : 'border-white/10 hover:scale-105'
          }`}
        />
      ))}
    </div>
  </div>
);

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const SetupWizard: React.FC = () => {
  const {
    surveyAnswers,
    avatarConfig,
    completeSurvey,
    closeSurvey,
    setActiveTab,
    useBrowserLocation,
    isLocating,
    currentLocation
  } = usePulse();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>(surveyAnswers ?? DEFAULT_SURVEY);
  const [avatar, setAvatar] = useState<AvatarConfig>(avatarConfig ?? DEFAULT_AVATAR);
  const [askedLocation, setAskedLocation] = useState(false);
  const [direction, setDirection] = useState(1);
  const [touched, setTouched] = useState(false);
  const [tipsOff, setTipsOff] = useState(() => {
    try {
      return localStorage.getItem(TIPS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const go = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), STEPS.length - 1);
    setDirection(clamped >= step ? 1 : -1);
    setTouched(false);
    setStep(clamped);
  };
  const hideTips = () => {
    setTipsOff(true);
    try {
      localStorage.setItem(TIPS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  const current = STEPS[step];
  const heading = HEADINGS[current.id];
  const last = step === STEPS.length - 1;
  const next = STEPS[step + 1];

  const toggle = <K extends 'interests' | 'hours'>(key: K, value: SurveyAnswers[K][number]) =>
    setAnswers((a) => {
      const list = a[key] as string[];
      const updated = list.includes(value as string) ? list.filter((x) => x !== value) : [...list, value as string];
      return { ...a, [key]: updated } as SurveyAnswers;
    });
  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => setAvatar((a) => ({ ...a, [key]: value }));

  const randomize = () =>
    setAvatar({
      skin: pick(SKIN_TONES),
      hairStyle: pick(HAIR_STYLES).id,
      hair: pick(HAIR_COLORS),
      top: pick(OUTFIT_COLORS),
      bottom: pick(OUTFIT_COLORS),
      shoes: pick(OUTFIT_COLORS),
      accent: pick(OUTFIT_COLORS),
      cap: Math.random() < 0.25,
      glasses: Math.random() < 0.3,
      headphones: Math.random() < 0.25,
      backpack: Math.random() < 0.3
    });

  const finish = () => {
    completeSurvey(answers, avatar);
    setActiveTab('map');
    // Then show where the main controls are
    setTimeout(startTour, 900);
  };
  const skipAll = () => {
    closeSurvey();
    setActiveTab('map');
  };

  const primaryLabel = last ? 'Finish setup' : step === 0 ? 'Get started' : 'Continue';

  return (
    <div className="fixed inset-0 z-[80] flex bg-[#0A0E17] text-white" role="dialog" aria-modal="true" aria-label="Setup">
      {/* Step list (desktop) */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col justify-between glass-sidebar px-6 py-8">
        <div>
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-md bg-accent-500 flex items-center justify-center font-semibold">P</div>
            <span className="font-semibold tracking-tight">PULSE</span>
          </div>
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const done = i < step;
              const here = i === step;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={i > step}
                    onClick={() => go(i)}
                    aria-current={here ? 'step' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
                      here ? 'bg-white/10' : done ? 'hover:bg-white/5' : 'opacity-75 cursor-default'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        done ? 'bg-accent-500 text-white' : here ? 'bg-white text-slate-900' : 'border border-white/20 text-slate-400'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-slate-400 truncate">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <button type="button" onClick={skipAll} className="text-xs text-slate-400 hover:text-white text-left">
          Skip setup for now
        </button>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile progress */}
        <header className="lg:hidden shrink-0 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Step {step + 1} of {STEPS.length} · {current.title}
            </span>
            <button type="button" onClick={skipAll} aria-label="Skip setup" className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2.5 flex gap-1">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent-500' : 'bg-white/10'}`} />
            ))}
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 lg:py-14">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={current.id}
              custom={direction}
              initial={{ opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -24 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
            <div className="hidden lg:block text-xs font-medium text-slate-400 mb-3">
              Step {step + 1} of {STEPS.length}
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{heading.title}</h1>
            <p className="mt-2 text-sm sm:text-base text-slate-400 leading-relaxed">{heading.lead}</p>

            <div className="mt-8 space-y-6" onClickCapture={() => setTouched(true)}>
              {current.id === 'welcome' && (
                <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/5">
                  {[
                    { Icon: MapIcon, title: 'A live map around you', text: 'Walk the streets in 3D and see moments as they happen.' },
                    { Icon: Bell, title: 'Alerts that matter', text: 'Hear about urgent things close to you, nothing else.' },
                    { Icon: MessageCircle, title: 'Share with neighbours', text: 'Post short-lived updates that expire on their own.' }
                  ].map(({ Icon, title, text }) => (
                    <li key={title} className="flex items-start gap-3.5 p-4">
                      <Icon className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium">{title}</div>
                        <div className="text-sm text-slate-400">{text}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {current.id === 'location' && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-4">
                  <div className="flex items-start gap-3.5">
                    <LocateFixed className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {askedLocation && !isLocating ? 'Location updated' : 'Share your location'}
                      </div>
                      <div className="text-sm text-slate-400">
                        {askedLocation && !isLocating
                          ? `Your hub is ${currentLocation.name}.`
                          : 'Your browser will ask for permission. You can skip this and pick a city hub instead.'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isLocating}
                    data-tour="wizard-location"
                    onClick={() => {
                      setAskedLocation(true);
                      useBrowserLocation();
                    }}
                    className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-medium disabled:opacity-50"
                  >
                    {isLocating ? 'Locating…' : askedLocation ? 'Try again' : 'Use my location'}
                  </button>
                </div>
              )}

              {current.id === 'interests' && (
                <div>
                  <div data-tour="wizard-interests" className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                    {INTERESTS.map(({ id, label, Icon }) => {
                      const on = answers.interests.includes(id);
                      return (
                        <button key={id} type="button" aria-pressed={on} onClick={() => toggle('interests', id)} className={option(on)}>
                          <Icon className="w-4 h-4 text-slate-300 shrink-0" />
                          <span>{label}</span>
                          <Check16 on={on} />
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {answers.interests.length === 0 ? 'Nothing selected yet. You will see everything.' : `${answers.interests.length} selected`}
                  </p>
                </div>
              )}

              {current.id === 'routine' && (
                <>
                  <div>
                    <Label>Usually getting around</Label>
                    <div data-tour="wizard-routine" className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                      {AROUND.map(({ id, label, Icon }) => {
                        const on = answers.getAround === id;
                        return (
                          <button key={id} type="button" aria-pressed={on} onClick={() => setAnswers((s) => ({ ...s, getAround: id }))} className={option(on)}>
                            <Icon className="w-4 h-4 text-slate-300 shrink-0" />
                            <span>{label}</span>
                            <Check16 on={on} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <Label>Usually out</Label>
                    <div className="grid grid-cols-2 min-[520px]:grid-cols-4 gap-2.5">
                      {HOURS.map(({ id, label }) => {
                        const on = answers.hours.includes(id);
                        return (
                          <button key={id} type="button" aria-pressed={on} onClick={() => toggle('hours', id)} className={`${option(on)} justify-center text-center`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {current.id === 'alerts' && (
                <>
                  <div>
                    <Label>Search range</Label>
                    <div data-tour="wizard-radius" className="grid grid-cols-5 gap-2">
                      {RADII.map((r) => (
                        <button key={r} type="button" aria-pressed={answers.radiusKm === r} onClick={() => setAnswers((s) => ({ ...s, radiusKm: r }))} className={`${option(answers.radiusKm === r)} justify-center`}>
                          {r} km
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-4 p-4 rounded-lg border border-white/10 bg-white/5 cursor-pointer">
                    <span>
                      <span className="block text-sm font-medium">Nearby alerts</span>
                      <span className="block text-sm text-slate-400">Notify me when something urgent happens close to me.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={answers.alerts}
                      onChange={(e) => setAnswers((s) => ({ ...s, alerts: e.target.checked }))}
                      className="w-5 h-5 shrink-0 accent-accent-500"
                    />
                  </label>
                </>
              )}

              {current.id === 'avatar' && (
                <div className="grid sm:grid-cols-[13rem_1fr] gap-6">
                  <div data-tour="wizard-avatar" className="relative rounded-lg border border-white/10 bg-white/5 h-64 sm:h-[22rem] sm:sticky sm:top-0 self-start">
                    <AvatarPreview config={avatar} className="absolute inset-0" />
                    <button type="button" onClick={randomize} className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/80 border border-white/10 text-xs font-medium hover:bg-slate-800">
                      <Dices className="w-3.5 h-3.5" /> Randomise
                    </button>
                  </div>
                  <div className="space-y-5">
                    <Swatches label="Skin" colors={SKIN_TONES} value={avatar.skin} onPick={(c) => set('skin', c)} />
                    <div>
                      <Label>Hair</Label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {HAIR_STYLES.map((h) => (
                          <button key={h.id} type="button" aria-pressed={avatar.hairStyle === h.id} onClick={() => set('hairStyle', h.id)} className={`px-3 py-1.5 rounded-md border text-xs font-medium ${avatar.hairStyle === h.id ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                            {h.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {HAIR_COLORS.map((c) => (
                          <button key={c} type="button" aria-label={`Hair color ${c}`} onClick={() => set('hair', c)} style={{ background: c }} className={`w-7 h-7 rounded-full border ${avatar.hair === c ? 'border-white ring-2 ring-white/30' : 'border-white/10'}`} />
                        ))}
                      </div>
                    </div>
                    <Swatches label="Top" colors={OUTFIT_COLORS} value={avatar.top} onPick={(c) => set('top', c)} />
                    <Swatches label="Bottoms" colors={OUTFIT_COLORS} value={avatar.bottom} onPick={(c) => set('bottom', c)} />
                    <Swatches label="Shoes" colors={OUTFIT_COLORS} value={avatar.shoes} onPick={(c) => set('shoes', c)} />
                    <div>
                      <Label>Extras</Label>
                      <div className="flex flex-wrap gap-2">
                        {([['cap', 'Cap'], ['glasses', 'Glasses'], ['headphones', 'Headphones'], ['backpack', 'Backpack']] as const).map(([key, label]) => (
                          <button key={key} type="button" aria-pressed={avatar[key]} onClick={() => set(key, !avatar[key])} className={`px-3 py-1.5 rounded-md border text-xs font-medium ${avatar[key] ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      {(avatar.cap || avatar.headphones || avatar.backpack) && (
                        <div className="mt-4">
                          <Swatches label="Extras colour" colors={OUTFIT_COLORS} value={avatar.accent} onPick={(c) => set('accent', c)} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="shrink-0 border-t border-white/10 glass-bottom-bar pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-slate-300 hover:text-white disabled:invisible"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-4">
              {!last && step > 0 && (
                <button type="button" onClick={() => go(step + 1)} className="text-sm text-slate-400 hover:text-white">
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={last ? finish : () => go(step + 1)}
                data-tour="wizard-next"
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold active:scale-[0.98]"
              >
                {primaryLabel}
                {last ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {next && (
            <div className="max-w-2xl mx-auto px-5 sm:px-8 mt-1.5 text-right text-xs text-slate-400">Next: {next.title}</div>
          )}
        </footer>
      </div>
      {!tipsOff && (
        <Coach
          target={touched || (current.id === 'location' && askedLocation) ? 'wizard-next' : TIPS[current.id].target}
          placement={touched || current.id === 'welcome' ? 'top' : 'auto'}
          title={touched ? undefined : current.title}
          text={
            touched
              ? last
                ? 'All set. Click Finish setup.'
                : `Looks good. Click Continue to go to ${next?.title}.`
              : TIPS[current.id].text
          }
          onDismiss={hideTips}
        />
      )}
    </div>
  );
};

export default SetupWizard;
