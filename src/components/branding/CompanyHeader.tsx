/**
 * Company Header Component
 * Displays Hampstead Renovations branding in the header
 */

import React from 'react';
import Link from 'next/link';
import { COMPANY } from '@/lib/constants/company';

export function CompanyHeader() {
  return (
    <div className="bg-white border-b border-gray-200">
      {/* Top Bar with Contact Info */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center text-sm">
            <div className="flex items-center space-x-4 mb-2 sm:mb-0">
              <a href={COMPANY.contact.phoneHref} className="flex items-center hover:text-gray-300">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {COMPANY.contact.phone}
              </a>
              <a href={COMPANY.contact.emailHref} className="flex items-center hover:text-gray-300">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {COMPANY.contact.email}
              </a>
            </div>
            <div className="text-xs text-gray-300">
              {COMPANY.address.city} {COMPANY.address.postcode}
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <Link href="/" className="flex items-center">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900">
                {COMPANY.name}
              </h1>
              <p className="text-xs text-gray-600">
                {COMPANY.branding.tagline}
              </p>
            </div>
          </Link>

          <nav className="hidden md:flex space-x-8">
            <Link href="/properties" className="text-gray-700 hover:text-gray-900 font-medium">
              Properties
            </Link>
            <Link href="/planning" className="text-gray-700 hover:text-gray-900 font-medium">
              Planning
            </Link>
            <Link href="/areas" className="text-gray-700 hover:text-gray-900 font-medium">
              Areas
            </Link>
            <Link href="/about" className="text-gray-700 hover:text-gray-900 font-medium">
              About
            </Link>
            <Link href="/contact" className="text-gray-700 hover:text-gray-900 font-medium">
              Contact
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
