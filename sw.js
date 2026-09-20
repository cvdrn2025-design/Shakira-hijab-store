/* ============================================================
   SERVICE WORKER — Shakira Hijab Store
   Fungsi: Cache aset & data untuk mode offline
   ============================================================ */

const CACHE_NAME = 'shakira-hijab-v1';
const CACHE_STATIC = 'shakira-static-v1';
const CACHE_IMAGES = 'shakira-images-v1';

/* Aset yang wajib di-cache saat pertama install */
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

/* ============================================================
   INSTALL — Cache aset statis
   ============================================================ */
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Caching static assets');
      // Pakai addAll dengan catch agar tidak gagal total jika 1 file missing
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
   ACTIVATE — Hapus cache lama
   ============================================================ */
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => {
          return key !== CACHE_STATIC && 
                 key !== CACHE_IMAGES && 
                 key !== CACHE_NAME;
        }).map(key => {
          console.log('[SW] Hapus cache lama:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — Strategi caching sesuai tipe request
   ============================================================ */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;

  // Skip Firebase & Google APIs (harus selalu online)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('wa.me')
  ) {
    return; // biarkan browser handle normal
  }

  // Skip extension/scheme lain
  if (!url.protocol.startsWith('http')) return;

  // Gambar (Unsplash, icon, dll) → Cache First
  if (
    req.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i) ||
    url.hostname.includes('unsplash.com')
  ) {
    event.respondWith(cacheFirst(req, CACHE_IMAGES));
    return;
  }

  // HTML/CSS/JS → Network First (supaya update cepat terlihat)
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
   STRATEGI: Network First (coba online dulu, fallback ke cache)
   ============================================================ */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    // Simpan ke cache kalau sukses
    if (response && response.status === 200 && response.type === 'basic') {
      const clone = response.clone();
      caches.open(cacheName).then(cache => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    // Offline → ambil dari cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Offline → dari cache:', request.url);
      return cached;
    }
    // Fallback halaman offline khusus untuk HTML
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

/* ============================================================
   STRATEGI: Cache First (ambil cache dulu, fallback ke network)
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
    // Placeholder gambar jika offline & tidak ada cache
    if (request.destination === 'image') {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
          <rect width="200" height="200" fill="#fdf2f6"/>
          <text x="100" y="105" font-size="14" text-anchor="middle" fill="#a61e4d" font-family="sans-serif">Gambar offline</text>
        </svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    return new Response('Offline', { status: 503 });
  }
}

/* ============================================================
   MESSAGE — Komunikasi dari halaman (opsional)
   ============================================================ */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }
});
