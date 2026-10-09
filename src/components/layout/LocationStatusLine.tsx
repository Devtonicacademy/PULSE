import React from 'react';
import { describeSource, useLocationStatus } from '../../services/locationService';

/** One quiet line saying which position source is in use and how good it is */
export const LocationStatusLine: React.FC<{ className?: string }> = ({ className = '' }) => {
  const status = useLocationStatus();
  const text = describeSource(status);
  if (!text) return null;
  const tone =
    status.source === 'gps' ? 'bg-emerald-400' : status.source === 'ip' ? 'bg-amber-400' : 'bg-slate-400';
  return (
    <div className={`flex items-center gap-1.5 text-[10px] text-slate-300 ${className}`} data-testid="location-status-line" title="How your position was found">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone}`} />
      <span className="truncate">{text}</span>
    </div>
  );
};
