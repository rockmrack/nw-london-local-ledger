'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * Hero Section Component with optimized animations
 */
export default function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className={`relative bg-gradient-to-r from-blue-600 to-indigo-700 text-white transition-opacity duration-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0 bg-black opacity-20"></div>

      <div className="relative container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            NW London Local Ledger
          </h1>

          <p className="text-xl md:text-2xl mb-8 text-blue-100">
            Your comprehensive source for property data, planning applications,
            and local news in North West London
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/search"
              className="inline-block px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              Search Properties
            </Link>

            <Link
              href="/properties"
              className="inline-block px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white hover:text-blue-600 transition-colors"
            >
              Browse All Properties
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold">50K+</div>
              <div className="text-blue-200">Properties Tracked</div>
            </div>
            <div>
              <div className="text-3xl font-bold">1K+</div>
              <div className="text-blue-200">Daily Updates</div>
            </div>
            <div>
              <div className="text-3xl font-bold">6</div>
              <div className="text-blue-200">Council Areas</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}