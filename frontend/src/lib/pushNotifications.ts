import { api } from '@/lib/api';

/**
 * pushNotifications.ts
 * Manages Web Push and OS-level Service Worker notifications for order milestone updates.
 */

export function isPushNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isPushNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) return 'denied';

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerSubscriptionWithServer();
    }
    return permission;
  } catch (err) {
    console.warn('[PushNotification] Permission request failed:', err);
    return 'denied';
  }
}

export async function registerSubscriptionWithServer(): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    // If subscription doesn't exist, we register with server
    const endpoint = sub ? sub.endpoint : `local-sw-${Date.now()}`;
    await api.post('/api/customer/push-subscription', {
      endpoint,
      keys: sub ? JSON.stringify(sub) : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
    });
    return true;
  } catch (err) {
    // Non-fatal if push-subscription storage succeeds locally
    console.info('[PushNotification] Server registration notice:', err);
    return false;
  }
}

/**
 * Dispatches an OS-level notification via the registered service worker.
 */
export async function dispatchLocalNotification(title: string, body: string, url = '/dashboard') {
  if (!isPushNotificationSupported() || Notification.permission !== 'granted') return;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: { url }
      });
    }
  } catch (err) {
    console.warn('[PushNotification] Local dispatch failed:', err);
  }
}
