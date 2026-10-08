import React, { useState } from 'react';
import { usePulse } from '../../context/PulseContext';
import { X, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface ReportModalProps {
  momentId: string | null;
  onClose: () => void;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or Promotional Abuse', desc: 'Misleading ads or repetitive unwanted content.' },
  { id: 'harassment', label: 'Harassment or Hate Speech', desc: 'Attacking individuals, toxic behavior, bullying.' },
  { id: 'false_information', label: 'False or Misleading Info', desc: 'Fake alerts, fake events, inaccurate hazards.' },
  { id: 'dangerous_content', label: 'Dangerous or Illegal Activity', desc: 'Violent threats, physical danger, illegal acts.' }
];

export const ReportModal: React.FC<ReportModalProps> = ({ momentId, onClose }) => {
  const { reportMoment } = usePulse();
  const [reason, setReason] = useState('spam');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!momentId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reportMoment(momentId, reason, notes);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md rounded-3xl glass-panel border border-accent-500/30 p-5 shadow-2xl text-white animate-slide-up">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-accent-400">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="text-sm font-bold text-white">Trust & Safety Report</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center text-xs space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Report Submitted</h4>
            <p className="text-slate-400 max-w-xs mx-auto">
              Our automated community moderation has flagged this item for expedited review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-3">
            <p className="text-xs text-slate-300">
              Why are you reporting this live Moment? Help maintain high signal on Pulse.
            </p>

            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                    reason === r.id
                      ? 'bg-accent-500/20 border-accent-500 text-white'
                      : 'bg-slate-900/60 border-white/5 text-slate-300 hover:border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                    className="mt-0.5 accent-accent-500"
                  />
                  <div>
                    <div className="text-xs font-bold leading-tight">{r.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{r.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Additional Context (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain the issue with this location or post..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accent-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold shadow-lg shadow-accent-600/30 transition-all"
              >
                Submit Report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
