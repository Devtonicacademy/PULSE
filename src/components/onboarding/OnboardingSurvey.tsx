import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dices, X } from 'lucide-react';
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

const INTERESTS: { id: MomentCategory; label: string; icon: string }[] = [
  { id: 'events', label: 'Events', icon: '🎉' },
  { id: 'food_drinks', label: 'Food & drink', icon: '🍔' },
  { id: 'alerts', label: 'Safety alerts', icon: '🚨' },
  { id: 'deals', label: 'Deals', icon: '🛍️' },
  { id: 'activities', label: 'Activities', icon: '🏃' },
  { id: 'community', label: 'Community', icon: '💬' },
  { id: 'recommendations', label: 'Tips', icon: '💡' },
  { id: 'lost_found', label: 'Lost & found', icon: '🔍' }
];
const AROUND: { id: SurveyAnswers['getAround']; label: string; icon: string }[] = [
  { id: 'walk', label: 'On foot', icon: '🚶' },
  { id: 'transit', label: 'Public transport', icon: '🚌' },
  { id: 'drive', label: 'Driving', icon: '🚗' },
  { id: 'mixed', label: 'A bit of everything', icon: '🔀' }
];
const HOURS: { id: SurveyAnswers['hours'][number]; label: string }[] = [
  { id: 'morning', label: 'Mornings' },
  { id: 'afternoon', label: 'Afternoons' },
  { id: 'evening', label: 'Evenings' },
  { id: 'late', label: 'Late night' }
];
const RADII: RadiusKm[] = [1, 2, 5, 10, 25];

const STEPS = ['Interests', 'Your routine', 'Alerts', 'Your avatar'] as const;

const chip = (active: boolean) =>
  `px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
    active
      ? 'bg-accent-500/20 border-accent-500/60 text-accent-200'
      : 'bg-slate-900/70 border-white/10 text-slate-300 hover:text-white hover:border-white/25'
  }`;

const Swatches: React.FC<{ colors: string[]; value: string; onPick: (c: string) => void; label: string }> = ({
  colors,
  value,
  onPick,
  label
}) => (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{label}</div>
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          style={{ background: c }}
          className={`w-7 h-7 rounded-full border-2 transition-transform ${
            value.toLowerCase() === c.toLowerCase() ? 'border-white scale-110' : 'border-white/20 hover:scale-105'
          }`}
        />
      ))}
    </div>
  </div>
);

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const OnboardingSurvey: React.FC = () => {
  const { surveyAnswers, avatarConfig, completeSurvey, closeSurvey } = usePulse();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>(surveyAnswers ?? DEFAULT_SURVEY);
  const [avatar, setAvatar] = useState<AvatarConfig>(avatarConfig ?? DEFAULT_AVATAR);
  const last = step === STEPS.length - 1;

  const toggle = <K extends 'interests' | 'hours'>(key: K, value: SurveyAnswers[K][number]) =>
    setAnswers((a) => {
      const list = a[key] as string[];
      const next = list.includes(value as string) ? list.filter((x) => x !== value) : [...list, value as string];
      return { ...a, [key]: next } as SurveyAnswers;
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

  const finish = () => completeSurvey(answers, avatar);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Welcome survey">
      <div className="w-full sm:max-w-xl max-h-[100dvh] sm:max-h-[92dvh] flex flex-col glass-panel rounded-t-3xl sm:rounded-3xl text-white animate-slide-up overflow-hidden">
        <div className="shrink-0 px-5 pt-4 pb-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-accent-400">
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="text-lg font-extrabold">{STEPS[step]}</h2>
            </div>
            <button onClick={closeSurvey} className="p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white" aria-label="Skip the survey for now">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-1.5">
            {STEPS.map((name, i) => (
              <div key={name} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-gradient-to-r from-accent-500 to-accent2-500' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {step === 0 && (
            <>
              <p className="text-sm text-slate-300">What do you want to hear about around you? Pick as many as you like.</p>
              <div className="grid grid-cols-2 gap-2">
                {INTERESTS.map((i) => (
                  <button key={i.id} type="button" aria-pressed={answers.interests.includes(i.id)} onClick={() => toggle('interests', i.id)} className={`${chip(answers.interests.includes(i.id))} text-left`}>
                    <span className="mr-2">{i.icon}</span>
                    {i.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <p className="text-sm text-slate-300 mb-2">How do you usually get around?</p>
                <div className="grid grid-cols-2 gap-2">
                  {AROUND.map((a) => (
                    <button key={a.id} type="button" aria-pressed={answers.getAround === a.id} onClick={() => setAnswers((s) => ({ ...s, getAround: a.id }))} className={`${chip(answers.getAround === a.id)} text-left`}>
                      <span className="mr-2">{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-300 mb-2">When are you usually out?</p>
                <div className="flex flex-wrap gap-2">
                  {HOURS.map((h) => (
                    <button key={h.id} type="button" aria-pressed={answers.hours.includes(h.id)} onClick={() => toggle('hours', h.id)} className={chip(answers.hours.includes(h.id))}>
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <p className="text-sm text-slate-300 mb-2">How far around you should Pulse look?</p>
                <div className="flex flex-wrap gap-2">
                  {RADII.map((r) => (
                    <button key={r} type="button" aria-pressed={answers.radiusKm === r} onClick={() => setAnswers((s) => ({ ...s, radiusKm: r }))} className={chip(answers.radiusKm === r)}>
                      {r} km
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-slate-900/60 border border-white/10 cursor-pointer">
                <span>
                  <span className="block text-sm font-bold">Nearby alerts</span>
                  <span className="block text-xs text-slate-400">Tell me when something urgent happens close to me.</span>
                </span>
                <input type="checkbox" checked={answers.alerts} onChange={(e) => setAnswers((s) => ({ ...s, alerts: e.target.checked }))} className="w-5 h-5 accent-accent-500" />
              </label>
            </>
          )}

          {step === 3 && (
            <div className="grid sm:grid-cols-[minmax(0,13rem)_1fr] gap-4">
              <div className="relative rounded-2xl bg-slate-950/70 border border-white/10 h-64 sm:h-[22rem] sm:sticky sm:top-0 self-start">
                <AvatarPreview config={avatar} className="absolute inset-0" />
                <button type="button" onClick={randomize} className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-white/15 text-[11px] font-bold hover:bg-slate-800">
                  <Dices className="w-3.5 h-3.5 text-signal-400" /> Surprise me
                </button>
              </div>
              <div className="space-y-3.5">
                <Swatches label="Skin" colors={SKIN_TONES} value={avatar.skin} onPick={(c) => set('skin', c)} />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Hair</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {HAIR_STYLES.map((h) => (
                      <button key={h.id} type="button" aria-pressed={avatar.hairStyle === h.id} onClick={() => set('hairStyle', h.id)} className={`${chip(avatar.hairStyle === h.id)} !py-1.5`}>
                        {h.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {HAIR_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`Hair color ${c}`} onClick={() => set('hair', c)} style={{ background: c }} className={`w-7 h-7 rounded-full border-2 ${avatar.hair === c ? 'border-white scale-110' : 'border-white/20'}`} />
                    ))}
                  </div>
                </div>
                <Swatches label="Top" colors={OUTFIT_COLORS} value={avatar.top} onPick={(c) => set('top', c)} />
                <Swatches label="Bottoms" colors={OUTFIT_COLORS} value={avatar.bottom} onPick={(c) => set('bottom', c)} />
                <Swatches label="Shoes" colors={OUTFIT_COLORS} value={avatar.shoes} onPick={(c) => set('shoes', c)} />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Extras</div>
                  <div className="flex flex-wrap gap-1.5">
                    {([['cap', 'Cap'], ['glasses', 'Glasses'], ['headphones', 'Headphones'], ['backpack', 'Backpack']] as const).map(([key, label]) => (
                      <button key={key} type="button" aria-pressed={avatar[key]} onClick={() => set(key, !avatar[key])} className={`${chip(avatar[key])} !py-1.5`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {(avatar.cap || avatar.headphones || avatar.backpack) && (
                    <div className="mt-2.5">
                      <Swatches label="Extras color" colors={OUTFIT_COLORS} value={avatar.accent} onPick={(c) => set('accent', c)} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-white/10 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white disabled:opacity-30">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {last ? (
            <button type="button" onClick={finish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent2-500 text-white text-sm font-extrabold shadow-lg shadow-accent-500/25 active:scale-[0.98]">
              <Check className="w-4 h-4" /> Finish
            </button>
          ) : (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent2-500 text-white text-sm font-extrabold shadow-lg shadow-accent-500/25 active:scale-[0.98]">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingSurvey;
