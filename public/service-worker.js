// Service Worker v2.0 - Advanced Offline-First Architecture
// Performance optimizations with intelligent caching strategies

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Cache size limits
const MAX_CACHE_SIZE = {
  dynamic: 100,
  api: 50,
  images: 200
};

// Critical assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/_next/static/css/app.css',
  '/_next/static/chunks/framework.js',
  '/_next/static/chunks/main.js',
  '/_next/static/chunks/pages/_app.js',
  '/_next/static/chunks/webpack.js',
  '/fonts/inter-var.woff2',
  '/manifest.json',
  '/favicon.ico'
];

// Network-first routes (always try to get fresh data)
const NETWORK_FIRST_ROUTES = [
  '/api/properties',
  '/api/news',
  '/api/search',
  '/api/monitoring'
];

// Cache-first routes (serve from cache when available)
const CACHE_FIRST_ROUTES = [
  '/_next/static',
  '/fonts',
  '/images',
  '/icons'
];

// Stale-while-revalidate routes
const STALE_WHILE_REVALIDATE_ROUTES = [
  '/api/areas',
  '/api/ml/predict'
];

// Install event - Pre-cache critical assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v2.0');

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching critical assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.error('[SW] Failed to pre-cache:', err);
        // Continue installation even if some assets fail
        return Promise.resolve();
      });
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v2.0');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return !cacheName.includes(CACHE_VERSION);
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      // Claim all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - Advanced caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions and dev tools
  if (url.protocol === 'chrome-extension:' || url.hostname === 'localhost' && url.port === '3001') {
    return;
  }

  // Apply different strategies based on route
  if (isNetworkFirstRoute(url.pathname)) {
    event.respondWith(networkFirstStrategy(request));
  } else if (isCacheFirstRoute(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isStaleWhileRevalidateRoute(url.pathname)) {
    event.respondWith(staleWhileRevalidateStrategy(request));
  } else if (request.destination === 'image') {
    event.respondWith(imageStrategy(request));
  } else {
    event.respondWith(dynamicStrategy(request));
  }
});

// Network-first strategy with fallback
async function networkFirstStrategy(request) {
  const cache = await caches.open(API_CACHE);

  try {
    // Try network with timeout
    const networkResponse = await fetchWithTimeout(request, 5000);

    if (networkResponse.ok) {
      // Update cache with fresh data
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error('Network response not ok');
  } catch (error) {
    console.log('[SW] Network first failed, trying cache:', error.message);

    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fallback to offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }

    return new Response('Network error', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache-first strategy with network fallback
async function cacheFirstStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);

  // Check cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // Fallback to network
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error);
    return new Response('Resource not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(API_CACHE);

  // Return from cache immediately if available
  const cachedResponse = await cache.match(request);

  // Fetch fresh data in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[SW] Background revalidation failed:', error);
    return cachedResponse;
  });

  // Return cached immediately, or wait for network
  return cachedResponse || fetchPromise;
}

// Optimized image caching strategy
async function imageStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);

  // Check cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Only cache images under 500KB
      const contentLength = networkResponse.headers.get('content-length');
      if (!contentLength || parseInt(contentLength) < 500000) {
        await limitCacheSize(IMAGE_CACHE, MAX_CACHE_SIZE.images);
        cache.put(request, networkResponse.clone());
      }
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Image fetch failed:', error);
    // Return placeholder image
    return new Response(null, {
      status: 404,
      statusText: 'Not Found'
    });
  }
}

// Dynamic content strategy
async function dynamicStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);

  try {
    // Try network first for dynamic content
    const networkResponse = await fetchWithTimeout(request, 3000);

    if (networkResponse.ok) {
      // Cache successful responses
      await limitCacheSize(DYNAMIC_CACHE, MAX_CACHE_SIZE.dynamic);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }

    throw new Error('Network response not ok');
  } catch (error) {
    // Fallback to cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests, show offline page
    if (request.mode === 'navigate') {
      return caches.match('/offline');
    }

    return new Response('Resource not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Fetch with timeout utility
function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

// Limit cache size by removing oldest entries
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxSize) {
    // Remove oldest entries
    const toDelete = keys.length - maxSize;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// Route matchers
function isNetworkFirstRoute(pathname) {
  return NETWORK_FIRST_ROUTES.some(route => pathname.startsWith(route));
}

function isCacheFirstRoute(pathname) {
  return CACHE_FIRST_ROUTES.some(route => pathname.startsWith(route));
}

function isStaleWhileRevalidateRoute(pathname) {
  return STALE_WHILE_REVALIDATE_ROUTES.some(route => pathname.startsWith(route));
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered');

  if (event.tag === 'sync-properties') {
    event.waitUntil(syncProperties());
  } else if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

// Sync properties data
async function syncProperties() {
  try {
    const response = await fetch('/api/properties?sync=true');
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put('/api/properties', response);
      console.log('[SW] Properties synced successfully');
    }
  } catch (error) {
    console.error('[SW] Properties sync failed:', error);
  }
}

// Sync analytics data
async function syncAnalytics() {
  try {
    // Get pending analytics from IndexedDB
    const db = await openDB();
    const tx = db.transaction('analytics', 'readonly');
    const store = tx.objectStore('analytics');
    const analytics = await store.getAll();

    if (analytics.length > 0) {
      await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analytics)
      });

      // Clear sent analytics
      const clearTx = db.transaction('analytics', 'readwrite');
      const clearStore = clearTx.objectStore('analytics');
      await clearStore.clear();

      console.log('[SW] Analytics synced:', analytics.length, 'events');
    }
  } catch (error) {
    console.error('[SW] Analytics sync failed:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('[SW] Invalid push data:', error);
  }

  const options = {
    title: data.title || 'NW London Local Ledger',
    body: data.body || 'New update available',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: data.actions || [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if needed
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Message handling for cache updates
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  } else if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// Helper function to open IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('NWLondonLedger', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('analytics')) {
        db.createObjectStore('analytics', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}