/* ============================================================
   SERVICE WORKER — Shakira Hijab Store v2
   Fitur: Cache aset + Skip Firebase + Offline fallback
   ============================================================ */

const CACHE_VERSION = 'v2';
const CACHE_STATIC = `shakira-static-${CACHE_VERSION}`;
const CACHE_IMAGES = `shakira-images-${CACHE_VERSION}`;
const CACHE_FONTS = `shakira-fonts-${CACHE_VERSION}`;

/* Aset yang wajib di-cache saat install */
const STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './firebase-config.js',
  './header-hijab.png',
  './icon-192.png',
  './icon-512.png',
  './qris.png'
];

/* Domain yang TIDAK boleh di-cache (harus fresh dari network) */
const SKIP_CACHE_DOMAINS = [
  'firebase',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'wa.me',
  'whatsapp.com'
];

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW] Installing v2...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Gagal cache:', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE — Hapus cache versi lama
   ============================================================ */
self.addEventListener('activate', event => {
  console.log('[SW] Activating v2...');
  const currentCaches = [CACHE_STATIC, CACHE_IMAGES, CACHE_FONTS];
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => !currentCaches.includes(key)).map(key => {
          console.log('[SW] Hapus cache lama:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — Strategi caching per tipe request
   ============================================================ */
self.addEventListener('fetch', event => {
  const req = event.request;
  
  // Skip non-GET
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch(e) { return; }

  // Skip scheme non-http
  if (!url.protocol.startsWith('http')) return;

  // ===== SKIP FIREBASE & WHATSAPP =====
  if (SKIP_CACHE_DOMAINS.some(d => url.hostname.includes(d))) {
    return; // biarkan browser handle (network only)
  }

  // ===== GAMBAR (Unsplash, icon, dll) → Cache First =====
  if (
    req.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i) ||
    url.hostname.includes('unsplash.com')
  ) {
    event.respondWith(cacheFirst(req, CACHE_IMAGES));
    return;
  }

  // ===== FONT (Google Fonts) → Cache First =====
  if (
    req.destination === 'font' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(req, CACHE_FONTS));
    return;
  }

  // ===== HTML/CSS/JS → Network First =====
  if (
    req.destination === 'document' ||
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.match(/\.(html|css|js|json)$/i) ||
    url.pathname === '/'
  ) {
    event.respondWith(networkFirst(req, CACHE_STATIC));
    return;
  }

  // Default: Network First
  event.respondWith(networkFirst(req, CACHE_STATIC));
});

/* ============================================================
   NETWORK FIRST — Coba online, fallback ke cache
   ============================================================ */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
      const clone = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Offline → cache:', request.url);
      return cached;
    }
    // Fallback HTML → index.html
    if (request.destination === 'document') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline — tidak tersedia di cache', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* ============================================================
   CACHE FIRST — Ambil cache dulu, fallback ke network
   ============================================================ */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const clone = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    // Placeholder jika gambar offline
    if (request.destination === 'image') {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
          <rect width="300" height="300" fill="#fdf2f6"/>
          <text x="150" y="140" font-size="40" text-anchor="middle">🖼️</text>
          <text x="150" y="180" font-size="14" text-anchor="middle" fill="#a61e4d" font-family="sans-serif">Gambar offline</text>
        </svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    return new Response('Offline', { status: 503 });
  }
}

/* ============================================================
   MESSAGE — Komunikasi dari halaman
   ============================================================ */
self.addEventListener('message', event => {
  const data = event.data;

  // Skip Waiting (update langsung)
  if (data === 'SKIP_WAITING' || data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Clear semua cache
  if (data === 'CLEAR_CACHE' || data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
      console.log('[SW] Semua cache dihapus');
    });
  }

  // Clear cache tertentu
  if (data?.type === 'CLEAR_CACHE_BY_NAME' && data.name) {
    caches.delete(data.name).then(() => {
      console.log('[SW] Cache dihapus:', data.name);
    });
  }
});

/* ============================================================
   SYNC — Background sync (untuk order offline, opsional)
   ============================================================ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    console.log('[SW] Background sync orders...');
    // Placeholder untuk fitur sync order offline nanti
  }
});
