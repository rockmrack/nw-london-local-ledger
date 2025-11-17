/**
 * Contact Information Component
 * Reusable component displaying Hampstead Renovations contact details
 */

import React from 'react';
import { COMPANY, getVCardData } from '@/lib/constants/company';

interface ContactInfoProps {
  variant?: 'default' | 'compact' | 'card';
  showMap?: boolean;
}

export function ContactInfo({ variant = 'default', showMap = false }: ContactInfoProps) {
  const handleDownloadVCard = () => {
    const vcard = getVCardData();
    const blob = new Blob([vcard], { type: 'text/vcard' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hampstead-renovations.vcf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (variant === 'compact') {
    return (
      <div className="flex flex-col space-y-2 text-sm">
        <a href={COMPANY.contact.phoneHref} className="flex items-center text-blue-600 hover:text-blue-800">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {COMPANY.contact.phone}
        </a>
        <a href={COMPANY.contact.emailHref} className="flex items-center text-blue-600 hover:text-blue-800">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {COMPANY.contact.email}
        </a>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">{COMPANY.name}</h3>
        <div className="space-y-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 mr-3 mt-1 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="text-sm text-gray-700">
              <p>{COMPANY.address.line1}</p>
              <p>{COMPANY.address.line2}</p>
              <p>{COMPANY.address.city} {COMPANY.address.postcode}</p>
            </div>
          </div>

          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a href={COMPANY.contact.phoneHref} className="text-sm text-blue-600 hover:text-blue-800">
              {COMPANY.contact.phone}
            </a>
          </div>

          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <a href={COMPANY.contact.emailHref} className="text-sm text-blue-600 hover:text-blue-800">
              {COMPANY.contact.email}
            </a>
          </div>

          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <a href={COMPANY.contact.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800">
              {COMPANY.contact.website}
            </a>
          </div>

          <button
            onClick={handleDownloadVCard}
            className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Add to Contacts
          </button>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact {COMPANY.name}</h2>
        <p className="text-gray-600 mb-6">{COMPANY.branding.description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Address</h3>
            <div className="text-gray-900">
              <p>{COMPANY.address.line1}</p>
              <p>{COMPANY.address.line2}</p>
              <p>{COMPANY.address.city} {COMPANY.address.postcode}</p>
              <p>{COMPANY.address.country}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Phone</h3>
            <a href={COMPANY.contact.phoneHref} className="text-lg text-blue-600 hover:text-blue-800 font-medium">
              {COMPANY.contact.phone}
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Email</h3>
            <a href={COMPANY.contact.emailHref} className="text-lg text-blue-600 hover:text-blue-800 font-medium">
              {COMPANY.contact.email}
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Website</h3>
            <a href={COMPANY.contact.website} target="_blank" rel="noopener noreferrer" className="text-lg text-blue-600 hover:text-blue-800 font-medium">
              {COMPANY.contact.website}
            </a>
          </div>

          <button
            onClick={handleDownloadVCard}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Contact Card
          </button>
        </div>

        {showMap && (
          <div className="h-64 md:h-full bg-gray-200 rounded-lg overflow-hidden">
            <iframe
              src={`https://www.google.com/maps/embed/v1/place?key=YOUR_GOOGLE_MAPS_API_KEY&q=${encodeURIComponent(COMPANY.address.full)}`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              title="Hampstead Renovations Location"
            />
          </div>
        )}
      </div>
    </div>
  );
}
