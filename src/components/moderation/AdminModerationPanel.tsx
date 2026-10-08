import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, Trash2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Moment } from '../../types/pulse';
import {
  subscribeToHiddenMoments,
  fetchReportsForMoment,
  restoreMoment,
  deleteMomentAsAdmin,
  ReportEntry
} from '../../services/firebaseSyncService';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam or promotion',
  harassment: 'Harassment or hate',
  false_information: 'False information',
  dangerous_content: 'Dangerous or illegal'
};

/**
 * Review queue for moderators (accounts listed in the admins collection): moments that were hidden
 * after enough distinct reports, with the reports behind them. Restoring puts a moment back on the
 * map; deleting removes it.
 */
export const AdminModerationPanel: React.FC = () => {
  const [queue, setQueue] = useState<Moment[] | null>(null);
  const [reports, setReports] = useState<Record<string, ReportEntry[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToHiddenMoments(setQueue);
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    (queue ?? []).forEach((m) => {
      if (reports[m.id]) return;
      void fetchReportsForMoment(m.id).then((list) => setReports((prev) => ({ ...prev, [m.id]: list })));
    });
  }, [queue, reports]);

  const act = async (momentId: string, action: 'restore' | 'delete') => {
    setBusyId(momentId);
    if (action === 'restore') await restoreMoment(momentId);
    else await deleteMomentAsAdmin(momentId);
    setBusyId(null);
  };

  return (
    <div className="rounded-3xl glass-panel border border-accent-500/30 p-4 space-y-3" data-testid="admin-panel">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-bold text-white">Moderation queue</h3>
        <span className="ml-auto text-[10px] text-slate-400">Hidden after 3 reports</span>
      </div>

      {queue === null && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
        </div>
      )}
      {queue?.length === 0 && <p className="text-xs text-slate-400">Nothing waiting for review.</p>}

      {queue?.map((m) => (
        <div key={m.id} className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 space-y-2">
          <div>
            <div className="text-xs font-bold text-white break-words">{m.title}</div>
            <div className="text-[11px] text-slate-400 break-words">{m.description}</div>
            <div className="text-[10px] text-slate-500 mt-1">
              by @{m.userName} · {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })} · {m.reportCount} reports
            </div>
          </div>
          <ul className="space-y-0.5">
            {(reports[m.id] ?? []).map((r) => (
              <li key={r.id} className="text-[10px] text-slate-300">
                <span className="text-accent-300 font-semibold">{REASON_LABELS[r.reason] ?? r.reason}</span>
                {r.notes ? <span className="text-slate-400"> — {r.notes}</span> : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              disabled={busyId === m.id}
              onClick={() => act(m.id, 'restore')}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> Restore
            </button>
            <button
              disabled={busyId === m.id}
              onClick={() => act(m.id, 'delete')}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-accent-500/15 border border-accent-500/30 text-accent-300 text-[11px] font-bold disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
