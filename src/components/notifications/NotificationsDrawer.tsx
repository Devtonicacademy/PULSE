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

const TYPE_ICONS: Record<NotificationType, { icon: any; color: string; bg: string }> = {
  alert: { icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/30' },
  trending: { icon: Flame, color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
  event: { icon: PartyPopper, color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/30' },
  deal: { icon: Tag, color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
  community: { icon: Radio, color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/30' },
  reward: { icon: PartyPopper, color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30' }
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
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Live Proximity Alerts</h2>
            <p className="text-[11px] text-slate-400">
              Real-time activity radar within your selected radius
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors"
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
            <p className="text-[11px] text-slate-400 leading-snug">
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
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-white/5 text-slate-200 border-white/15 hover:bg-white/10'
              }`}
            >
              {alertNotifications.enabled ? 'On' : 'Turn on'}
            </button>
          )}
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-400 glass-panel rounded-2xl">
            No alerts right now. You are fully caught up with your surroundings!
          </div>
        ) : (
          notifications.map((item) => {
            const meta = TYPE_ICONS[item.type] || TYPE_ICONS.event;
            const Icon = meta.icon;

            return (
              <div
                key={item.id}
                onClick={() => {
                  markNotificationRead(item.id);
                  if (item.momentId) {
                    onSelectMoment(item.momentId);
                  }
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  item.isRead
                    ? 'glass-panel border-white/5 opacity-75 hover:opacity-100'
                    : 'bg-slate-900/90 border-rose-500/30 shadow-lg shadow-rose-500/5'
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl border shrink-0 ${meta.bg} ${meta.color}`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-xs font-bold text-white leading-tight truncate">
                      {item.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-2">
                    {item.message}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    {item.distanceKm !== undefined && (
                      <span className="flex items-center gap-1 text-cyan-300">
                        <MapPin className="w-3 h-3" />
                        {item.distanceKm < 1
                          ? `${Math.round(item.distanceKm * 1000)}m away`
                          : `${item.distanceKm.toFixed(1)}km away`}
                      </span>
                    )}
                    {item.momentId && (
                      <span className="text-rose-400 font-semibold flex items-center gap-0.5 ml-auto">
                        View Moment <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
