'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

interface ProgressiveHydrationProps {
  children: ReactNode;
  priority?: 'immediate' | 'high' | 'normal' | 'low';
  fallback?: ReactNode;
}

/**
 * Progressive Hydration Component
 * Implements selective hydration based on component visibility and priority
 */
export function ProgressiveHydration({
  children,
  priority = 'normal',
  fallback,
}: ProgressiveHydrationProps) {
  const [isHydrated, setIsHydrated] = useState(priority === 'immediate');
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hydrationTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Immediate priority components hydrate right away
    if (priority === 'immediate') {
      setIsHydrated(true);
      return;
    }

    // Setup Intersection Observer for lazy hydration
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        // Adjust rootMargin based on priority
        rootMargin: priority === 'high' ? '200px' : priority === 'low' ? '-50px' : '100px',
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Hydration timing based on priority and visibility
    if (isVisible) {
      const delay = priority === 'high' ? 0 : priority === 'low' ? 2000 : 500;

      hydrationTimeoutRef.current = setTimeout(() => {
        requestIdleCallback(
          () => {
            setIsHydrated(true);
          },
          { timeout: priority === 'high' ? 100 : 1000 }
        );
      }, delay);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
      if (hydrationTimeoutRef.current) {
        clearTimeout(hydrationTimeoutRef.current);
      }
    };
  }, [priority, isVisible]);

  // Force hydration on user interaction
  useEffect(() => {
    if (!isHydrated) {
      const handleInteraction = () => {
        setIsHydrated(true);
      };

      const events = ['touchstart', 'click', 'keydown', 'scroll'];
      events.forEach((event) => {
        window.addEventListener(event, handleInteraction, { once: true, passive: true });
      });

      return () => {
        events.forEach((event) => {
          window.removeEventListener(event, handleInteraction);
        });
      };
    }
  }, [isHydrated]);

  // Use requestIdleCallback polyfill if not available
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.requestIdleCallback) {
      window.requestIdleCallback = function (cb: IdleRequestCallback, options?: IdleRequestOptions) {
        const start = Date.now();
        return setTimeout(() => {
          cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          } as IdleDeadline);
        }, options?.timeout || 1) as unknown as number;
      };
    }
  }, []);

  return (
    <div ref={containerRef} data-hydrated={isHydrated}>
      {isHydrated ? children : fallback || children}
    </div>
  );
}