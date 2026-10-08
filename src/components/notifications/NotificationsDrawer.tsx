import React from 'react';
import { usePulse } from '../../context/PulseContext';
import { NotificationType, NotificationItem } from '../../types/pulse';
import {
  Bell,
  CheckCheck,
  Flame,
  AlertTriangle,
  PartyPopper,
  Tag,
  Radio,
  Clock,
  MapPin,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationsDrawerProps {
  onSelectMoment: (momentId: string) => void;
}

interface TypeMeta {
  icon: any;
  label: string;
  /** Icon chip */
  chip: string;
  /** Category pill beside the title */
  pill: string;
  /** Left edge stripe that separates and color-codes each alert */
  stripe: string;
}

// Each alert category owns a hue. Full class names so Tailwind can see them.
const TYPE_ICONS: Record<NotificationType, TypeMeta> = {
  alert: {
    icon: AlertTriangle,
    label: 'Alert',
    chip: 'bg-rose-500/20 border-rose-400/40 text-rose-300',
    pill: 'bg-rose-500/15 border-rose-400/40 text-rose-200',
    stripe: 'border-l-rose-400'
  },
  trending: {
    icon: Flame,
    label: 'Trending',
    chip: 'bg-orange-500/20 border-orange-400/40 text-orange-300',
    pill: 'bg-orange-500/15 border-orange-400/40 text-orange-200',
    stripe: 'border-l-orange-400'
  },
  event: {
    icon: PartyPopper,
    label: 'Event',
    chip: 'bg-violet-500/20 border-violet-400/40 text-violet-300',
    pill: 'bg-violet-500/15 border-violet-400/40 text-violet-200',
    stripe: 'border-l-violet-400'
  },
  deal: {
    icon: Tag,
    label: 'Deal',
    chip: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300',
    pill: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
    stripe: 'border-l-emerald-400'
  },
  community: {
    icon: Radio,
    label: 'Community',
    chip: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300',
    pill: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200',
    stripe: 'border-l-cyan-400'
  },
  reward: {
    icon: PartyPopper,
    label: 'Reward',
    chip: 'bg-yellow-500/20 border-yellow-400/40 text-yellow-300',
    pill: 'bg-yellow-500/15 border-yellow-400/40 text-yellow-200',
    stripe: 'border-l-yellow-400'
  }
};

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  onSelectMoment
}) => {
  const { notifications, markNotificationRead, markAllNotificationsRead, alertNotifications } = usePulse();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100 p-4 sm:p-6 space-y-5 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-accent-500/20 text-accent-400 border border-accent-500/30">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Live Proximity Alerts</h2>
            <p className="text-[11px] text-slate-300">
              Real-time activity radar within your selected radius
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="text-xs text-signal-400 hover:text-signal-300 font-semibold flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* On-device alert notifications: asked for here, when the user opens their alerts */}
      {alertNotifications.permission !== 'unsupported' && (
        <div className="p-3.5 rounded-2xl glass-panel border border-white/10 flex items-center justify-between gap-3" data-testid="alert-notifications">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">Alert notifications</div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {alertNotifications.permission === 'denied'
                ? 'Notifications are blocked in your browser settings.'
                : alertNotifications.enabled
                ? 'You will be notified of new alerts nearby while Pulse is open.'
                : 'Get notified of new alerts in your radius while Pulse is open (this device only).'}
            </p>
          </div>
          {alertNotifications.permission !== 'denied' && (
            <button
              onClick={() => (alertNotifications.enabled ? alertNotifications.disable() : void alertNotifications.enable())}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                alertNotifications.enabled
                  ? 'bg-accent-500/20 text-accent-300 border-accent-500/40'
                  : 'bg-white/5 text-slate-200 border-white/15 hover:bg-white/10'
              }`}
            >
              {alertNotifications.enabled ? 'On' : 'Turn on'}
            </button>
          )}
        </div>
      )}

      {/* Notifications List: one panel, rows divided by rules, each stripe-coded by category */}
      {notifications.length === 0 ? (
        <div className="text-center py-16 text-xs text-slate-300 glass-panel rounded-2xl">
          No alerts right now. You are fully caught up with your surroundings!
        </div>
      ) : (
        <ul className="glass-panel rounded-2xl overflow-hidden">
          {notifications.map((item) => {
            const meta = TYPE_ICONS[item.type] || TYPE_ICONS.event;
            const Icon = meta.icon;

            return (
              <li
                key={item.id}
                onClick={() => {
                  markNotificationRead(item.id);
                  if (item.momentId) {
                    onSelectMoment(item.momentId);
                  }
                }}
                className={`px-4 py-4 sm:px-5 border-l-4 ${meta.stripe} border-b border-b-white/10 last:border-b-0 transition-colors cursor-pointer flex items-start gap-3.5 ${
                  item.isRead
                    ? 'bg-transparent hover:bg-white/5'
                    : 'bg-white/[0.06] hover:bg-white/10'
                }`}
              >
                <div className={`p-2.5 rounded-xl border shrink-0 ${meta.chip}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}
                      >
                        {meta.label}
                      </span>
                      {!item.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-400 shrink-0" aria-label="Unread" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white leading-snug">{item.title}</h4>

                  <p className="text-xs text-slate-200 leading-relaxed mt-1">{item.message}</p>

                  {(item.distanceKm !== undefined || item.momentId) && (
                    <div className="flex items-center gap-3 text-[11px] mt-2.5 pt-2.5 border-t border-white/10">
                      {item.distanceKm !== undefined && (
                        <span className="flex items-center gap-1 text-signal-300 font-medium">
                          <MapPin className="w-3 h-3" />
                          {item.distanceKm < 1
                            ? `${Math.round(item.distanceKm * 1000)}m away`
                            : `${item.distanceKm.toFixed(1)}km away`}
                        </span>
                      )}
                      {item.momentId && (
                        <span className="text-accent-300 font-semibold flex items-center gap-0.5 ml-auto">
                          View Moment <ChevronRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
