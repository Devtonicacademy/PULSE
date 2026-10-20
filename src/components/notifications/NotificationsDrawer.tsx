import React from 'react';
import { usePulse } from '../../context/PulseContext';
import { NotificationType } from '../../types/pulse';
import { Bell, CheckCheck, Flame, TriangleAlert, CalendarDays, Tag, Radio, Trophy, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationsDrawerProps {
  onSelectMoment: (momentId: string) => void;
}

const TYPE_META: Record<NotificationType, { Icon: typeof Bell; label: string }> = {
  alert: { Icon: TriangleAlert, label: 'Alert' },
  trending: { Icon: Flame, label: 'Trending' },
  event: { Icon: CalendarDays, label: 'Event' },
  deal: { Icon: Tag, label: 'Deal' },
  community: { Icon: Radio, label: 'Community' },
  reward: { Icon: Trophy, label: 'Reward' }
};

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ onSelectMoment }) => {
  const { notifications, markNotificationRead, markAllNotificationsRead, alertNotifications } = usePulse();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 text-slate-100">
      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Alerts</h1>
            <p className="text-sm text-slate-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'You are up to date'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </header>

        {/* On-device notifications */}
        {alertNotifications.permission !== 'unsupported' && (
          <section
            className="flex items-center justify-between gap-4 p-4 rounded-lg border border-white/10 bg-white/5"
            data-testid="alert-notifications"
          >
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-white">Device notifications</h2>
              <p className="text-sm text-slate-400">
                {alertNotifications.permission === 'denied'
                  ? 'Blocked in your browser settings.'
                  : alertNotifications.enabled
                  ? 'On while PULSE is open.'
                  : 'Get nearby alerts while PULSE is open.'}
              </p>
            </div>
            {alertNotifications.permission !== 'denied' && (
              <button
                type="button"
                onClick={() => (alertNotifications.enabled ? alertNotifications.disable() : void alertNotifications.enable())}
                className={`shrink-0 px-3.5 py-2 rounded-md text-xs font-medium border transition-colors ${
                  alertNotifications.enabled
                    ? 'bg-white/10 border-white/30 text-white'
                    : 'border-white/10 text-slate-200 hover:bg-white/10'
                }`}
              >
                {alertNotifications.enabled ? 'On' : 'Turn on'}
              </button>
            )}
          </section>
        )}

        {notifications.length === 0 ? (
          <div className="text-center py-20 rounded-lg border border-white/10 bg-white/5">
            <Bell className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <h2 className="text-sm font-medium text-white">No alerts</h2>
            <p className="text-sm text-slate-400 mt-1">New activity near you will show up here.</p>
          </div>
        ) : (
          <ul className="rounded-lg border border-white/10 bg-white/5 divide-y divide-white/10 overflow-hidden">
            {notifications.map((item) => {
              const { Icon, label } = TYPE_META[item.type] ?? TYPE_META.event;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationRead(item.id);
                      if (item.momentId) onSelectMoment(item.momentId);
                    }}
                    className="w-full flex items-start gap-3.5 px-4 py-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <Icon className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-2">
                          {label}
                          {!item.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-500" aria-label="Unread" />}
                        </span>
                        <span className="shrink-0">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                      </div>
                      <div className={`mt-1 text-sm leading-snug ${item.isRead ? 'text-slate-200' : 'font-medium text-white'}`}>
                        {item.title}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-400 leading-relaxed line-clamp-2">{item.message}</p>
                      {(item.distanceKm !== undefined || item.momentId) && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                          {item.distanceKm !== undefined && (
                            <span>
                              {item.distanceKm < 1
                                ? `${Math.round(item.distanceKm * 1000)} m away`
                                : `${item.distanceKm.toFixed(1)} km away`}
                            </span>
                          )}
                          {item.momentId && (
                            <span className="ml-auto flex items-center gap-0.5 text-slate-300">
                              View <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
