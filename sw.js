// FollowUpDose Service Worker v4
// HTML → Network First (دايماً أحدث نسخة)
// Icons/Fonts → Cache First (سريع وبدون نت)

const CACHE_HTML   = 'fud-html-v4';
const CACHE_ASSETS = 'fud-assets-v4';

const STATIC_ICONS = [
  './icons/icon-72.png','./icons/icon-96.png','./icons/icon-128.png',
  './icons/icon-144.png','./icons/icon-152.png','./icons/icon-192.png',
  './icons/icon-384.png','./icons/icon-512.png'
];

// ── Install: cache icons only ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then(cache =>
      Promise.allSettled(STATIC_ICONS.map(u => cache.add(u).catch(()=>{})))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: حذف كل الـ caches القديمة ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_HTML && k !== CACHE_ASSETS)
            .map(k => { console.log('[SW] حذف cache قديم:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // HTML → Network First (مهم: دايماً أحدث نسخة من الـ server)
  if (
    event.request.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_HTML).then(c => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Icons → Cache First
  if (url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  // Fonts → Cache First
  if (url.hostname.includes('fonts.')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(new Request(event.request.url, { mode: 'no-cors' }))
          .then(res => {
            caches.open(CACHE_ASSETS).then(c => c.put(event.request, res.clone()));
            return res;
          }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // باقي الطلبات → Network مع fallback
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE_ASSETS).then(c => c.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Messages ───────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '💊 مُذكِّر الدواء', body: 'حان موعد الجرعة!', icon: './icons/icon-192.png' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body, icon: data.icon, badge: './icons/icon-72.png',
      vibrate: [200,100,200,100,200], tag: 'medicine-reminder',
      renotify: true, requireInteraction: true, dir: 'rtl', lang: 'ar',
      actions: [
        { action: 'taken',  title: '✅ تم الأخذ' },
        { action: 'snooze', title: '⏰ 10 دقائق' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'snooze') {
    setTimeout(() => self.registration.showNotification('💊 مُذكِّر الدواء', {
      body: 'تذكير: حان موعد جرعتك', icon: './icons/icon-192.png',
      vibrate: [200,100,200], tag: 'medicine-snooze', dir: 'rtl'
    }), 10*60*1000);
    return;
  }
  event.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
