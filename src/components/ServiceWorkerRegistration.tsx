'use client';

import { useEffect, useState } from 'react';

/**
 * Service Worker Registration Component
 * Handles service worker registration and updates
 */
export function ServiceWorkerRegistration() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Only register in production and if supported
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      // Wait for window load to not impact initial page load performance
      await new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve(undefined);
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });

      // Register service worker
      const reg = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      setRegistration(reg);

      // Check for updates every 30 minutes
      setInterval(() => {
        reg.update();
      }, 1000 * 60 * 30);

      // Handle updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              setUpdateAvailable(true);
              console.log('[SW] New version available');

              // Show update notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Update Available', {
                  body: 'A new version of NW London Local Ledger is available. Refresh to update.',
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/badge-72x72.png',
                  tag: 'update-notification',
                  requireInteraction: false,
                });
              }
            }
          });
        }
      });

      // Handle controller change (new SW activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Reload the page to get the new version
        if (!updateAvailable) {
          window.location.reload();
        }
      });

      // Request notification permission for updates and push notifications
      if ('Notification' in window && Notification.permission === 'default') {
        // Delay permission request to not overwhelm users
        setTimeout(() => {
          Notification.requestPermission();
        }, 60000); // Request after 1 minute
      }

      // Enable navigation preload if supported
      if ('navigationPreload' in reg) {
        await reg.navigationPreload.enable();
      }

      console.log('[SW] Service Worker registered successfully');

      // Warm up critical caches
      warmUpCaches();
    } catch (error) {
      console.error('[SW] Service Worker registration failed:', error);
    }
  };

  const warmUpCaches = () => {
    // Pre-cache critical API routes
    if ('caches' in window) {
      const criticalUrls = [
        '/api/properties?limit=10',
        '/api/news?limit=5',
        '/api/areas',
      ];

      caches.open('api-v2.0.0').then((cache) => {
        criticalUrls.forEach((url) => {
          fetch(url)
            .then((response) => {
              if (response.ok) {
                cache.put(url, response);
              }
            })
            .catch(() => {
              // Ignore cache warming errors
            });
        });
      });
    }
  };

  const handleUpdate = () => {
    if (registration?.waiting) {
      // Tell waiting SW to activate
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      setUpdateAvailable(false);
    }
  };

  // Update notification banner
  if (updateAvailable) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 animate-slide-up">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Update Available</h4>
            <p className="text-sm opacity-90">
              A new version is ready to install.
            </p>
          </div>
          <button
            onClick={handleUpdate}
            className="ml-4 bg-white text-blue-600 px-4 py-2 rounded-md font-medium hover:bg-blue-50 transition-colors"
            aria-label="Update now"
          >
            Update
          </button>
        </div>
      </div>
    );
  }

  return null;
}