// Custom service worker for BudOverBills
// Built with vite-plugin-pwa injectManifest strategy.
// Workbox injects the precache manifest into the placeholder below at build time.

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

self.skipWaiting();
clientsClaim();

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

// SPA navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'BudOverBills';
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/pwa-192x192.png',
    badge: data.badge ?? '/pwa-192x192.png',
    data: data.url ? { url: data.url } : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
