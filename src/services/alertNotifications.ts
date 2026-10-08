/**
 * "New alert near you" notifications that run entirely on the device (no push server):
 * while the app is open, even in a background tab or installed window, a new alert that appears
 * inside the user's radius raises an OS notification. Real background push (app closed) needs
 * a server to send it, which this app does not have.
 */

const ENABLED_KEY = 'pulse_alert_notifications';

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationPermission(): NotificationSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationSupport;
}

/** The user switched alert notifications on in the app (a separate choice from the browser permission) */
export function isAlertNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'on' && notificationPermission() === 'granted';
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (a button click); asks the browser for permission if needed */
export async function enableAlertNotifications(): Promise<NotificationSupport> {
  const current = notificationPermission();
  if (current === 'unsupported' || current === 'denied') return current;

  const result = current === 'granted' ? 'granted' : ((await Notification.requestPermission()) as NotificationSupport);
  try {
    if (result === 'granted') localStorage.setItem(ENABLED_KEY, 'on');
  } catch {
    // storage unavailable: the choice just won't persist
  }
  return result;
}

export function disableAlertNotifications(): void {
  try {
    localStorage.setItem(ENABLED_KEY, 'off');
  } catch {
    // ignore
  }
}

export interface AlertNotificationInput {
  momentId: string;
  title: string;
  body: string;
}

/** Shows the OS notification through the service worker when there is one, so a click can focus the app */
export async function showAlertNotification({ momentId, title, body }: AlertNotificationInput): Promise<void> {
  if (!isAlertNotificationsEnabled()) return;

  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `pulse-alert-${momentId}`,
    data: { momentId }
  };

  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch (err) {
    console.warn('[PULSE] Could not show the alert notification:', err);
  }
}
