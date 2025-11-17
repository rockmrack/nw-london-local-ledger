'use client';

import { useEffect } from 'react';

/**
 * Preload Resources Component
 * Manages dynamic resource preloading based on user behavior
 */
export function PreloadResources() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Preload images for better performance
    const preloadImages = () => {
      const imagesToPreload = [
        '/images/hero-bg.jpg',
        '/images/og-image.jpg',
        '/icons/icon-192x192.png',
      ];

      imagesToPreload.forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    };

    // Prefetch API data based on route
    const prefetchRouteData = () => {
      const currentPath = window.location.pathname;

      // Intelligent prefetching based on current page
      const prefetchMap: Record<string, string[]> = {
        '/': ['/api/properties?limit=10', '/api/news?limit=5', '/api/areas'],
        '/properties': ['/api/properties?page=1', '/api/areas'],
        '/news': ['/api/news?page=1'],
        '/search': ['/api/search/suggestions'],
      };

      const urlsToPrefetch = prefetchMap[currentPath] || [];

      urlsToPrefetch.forEach((url) => {
        // Use link prefetch for API endpoints
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'fetch';
        link.href = url;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      });
    };

    // Preconnect to required domains on interaction
    const setupPreconnects = () => {
      const domains = [
        'https://api.nwlondonledger.com',
        'https://cdn.nwlondonledger.com',
        'https://images.nwlondonledger.com',
      ];

      domains.forEach((domain) => {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = domain;
        document.head.appendChild(link);
      });
    };

    // Preload next page chunks based on hover
    const setupLinkPrefetch = () => {
      const links = document.querySelectorAll('a[href^="/"]');

      links.forEach((link) => {
        link.addEventListener('mouseenter', () => {
          const href = link.getAttribute('href');
          if (href) {
            // Prefetch the page
            const prefetchLink = document.createElement('link');
            prefetchLink.rel = 'prefetch';
            prefetchLink.href = href;
            document.head.appendChild(prefetchLink);

            // Prefetch associated API data
            const apiPrefetch = getApiPrefetchUrl(href);
            if (apiPrefetch) {
              fetch(apiPrefetch, {
                method: 'GET',
                credentials: 'same-origin',
                priority: 'low' as any,
              }).catch(() => {
                // Ignore prefetch errors
              });
            }
          }
        }, { once: true, passive: true });
      });
    };

    // Get API prefetch URL based on page route
    const getApiPrefetchUrl = (path: string): string | null => {
      if (path.startsWith('/property/')) {
        const slug = path.split('/').pop();
        return `/api/properties/${slug}`;
      }
      if (path.startsWith('/news/')) {
        const slug = path.split('/').pop();
        return `/api/news/${slug}`;
      }
      if (path.startsWith('/areas/')) {
        const slug = path.split('/').pop();
        return `/api/areas/${slug}`;
      }
      return null;
    };

    // Resource priority hints based on viewport
    const setupResourceHints = () => {
      const viewportHeight = window.innerHeight;

      // Find images in viewport
      const images = document.querySelectorAll('img[data-src]');
      images.forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.top < viewportHeight * 2) {
          // Image is near viewport, load it
          const imgElement = img as HTMLImageElement;
          if (imgElement.dataset.src) {
            imgElement.loading = 'eager';
            imgElement.src = imgElement.dataset.src;
            delete imgElement.dataset.src;
          }
        }
      });
    };

    // Execute preloading strategies
    const initPreloading = () => {
      // Immediate preloads
      preloadImages();
      setupPreconnects();

      // Delayed preloads (after initial load)
      requestIdleCallback(() => {
        prefetchRouteData();
        setupLinkPrefetch();
        setupResourceHints();
      }, { timeout: 2000 });
    };

    // Wait for initial page load
    if (document.readyState === 'complete') {
      initPreloading();
    } else {
      window.addEventListener('load', initPreloading, { once: true });
    }

    // Setup mutation observer for dynamic content
    const observer = new MutationObserver(() => {
      requestIdleCallback(() => {
        setupLinkPrefetch();
        setupResourceHints();
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
}