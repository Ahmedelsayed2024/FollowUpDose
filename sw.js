// FollowUpDose Service Worker
// Provides offline support, background sync, and push notifications

const CACHE_NAME = 'followupdose-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Tajawal:wght@300;400;500;700&display=swap'
];

// ─── Install: cache all static assets ─────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE.map(url => {
        // Use no-cors for external resources like Google Fonts
        if (url.startsWith('https://fonts.')) {
          return new Request(url, { mode: 'no-cors' });
        }
        return url;
      })).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => {
      console.log('[SW] Installed ✅');
      return self.skipWaiting();
    })
  );
});

// ─── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => {
      console.log('[SW] Activated ✅');
      return self.clients.claim();
    })
  );
});

// ─── Fetch: serve from cache, fall back to network ─────────────────────────
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  // Skip chrome-extension and other non-http schemes
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve cached, refresh in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {/* offline, ignore */});
        return cached;
      }

      // Not cached — try network, then cache
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ─── Push Notifications ────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '💊 مُذكِّر الدواء', body: 'حان موعد الجرعة!', icon: './icons/icon-192.png' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: './icons/icon-72.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'medicine-reminder',
      renotify: true,
      requireInteraction: true,
      dir: 'rtl',
      lang: 'ar',
      actions: [
        { action: 'taken', title: '✅ تم الأخذ' },
        { action: 'snooze', title: '⏰ تذكيري لاحقاً' }
      ]
    })
  );
});

// ─── Notification click handler ────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'snooze') {
    // Re-show after 10 minutes
    setTimeout(() => {
      self.registration.showNotification('💊 مُذكِّر الدواء', {
        body: 'تذكير: حان موعد جرعتك',
        icon: './icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'medicine-snooze',
        dir: 'rtl'
      });
    }, 10 * 60 * 1000);
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// ─── Background Sync (for marking doses taken offline) ─────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-doses') {
    event.waitUntil(syncDoses());
  }
});

async function syncDoses() {
  // Doses are stored in localStorage on the client side
  // This is a placeholder for future server sync
  console.log('[SW] Background sync: doses');
}

// ─── Periodic Background Sync (alarm check every hour) ────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-alarms') {
    event.waitUntil(checkAndFireAlarms());
  }
});

async function checkAndFireAlarms() {
  // Notify all clients to check their alarms
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  allClients.forEach(client => client.postMessage({ type: 'CHECK_ALARMS' }));
}
