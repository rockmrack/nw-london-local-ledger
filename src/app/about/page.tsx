/**
 * About Page
 * Information about Hampstead Renovations
 */

import React from 'react';
import type { Metadata } from 'next';
import { ContactInfo } from '@/components/branding/ContactInfo';
import { COMPANY, SERVICES, SERVICE_AREAS, COMPANY_META } from '@/lib/constants/company';

export const metadata: Metadata = {
  title: 'About Us',
  description: `Learn about ${COMPANY.name} - your trusted partner for property data, planning applications, and renovation services in North West London.`,
  keywords: ['about', 'Hampstead Renovations', 'company information', 'North West London', 'property services'],
  openGraph: {
    title: `About ${COMPANY.name}`,
    description: `Learn about ${COMPANY.name} and our property services`,
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold mb-4">About {COMPANY.name}</h1>
          <p className="text-xl text-blue-100 max-w-3xl">
            {COMPANY.branding.tagline}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Company Overview */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Who We Are</h2>
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-700 leading-relaxed mb-4">
              {COMPANY.name} is North West London's premier provider of comprehensive property data, planning application insights, and renovation services. Based in the heart of Hampstead, we combine deep local knowledge with cutting-edge technology to deliver unparalleled property intelligence and renovation expertise.
            </p>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our platform aggregates and analyzes property data from multiple authoritative sources, including HM Land Registry, local council planning portals, Energy Performance Certificate registers, and more. We transform this raw data into actionable insights that empower property owners, developers, and investors to make informed decisions.
            </p>
            <p className="text-gray-700 leading-relaxed">
              With years of experience in the North West London property market, we understand the unique characteristics of each neighborhood we serve - from the tree-lined streets of Hampstead to the vibrant communities of Camden, from the suburban charm of Finchley to the urban energy of Kilburn.
            </p>
          </div>
        </div>

        {/* Services Grid */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Our Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((service, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{service}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Why Choose Us */}
        <div className="bg-blue-50 rounded-lg p-8 mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Why Choose Hampstead Renovations?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Comprehensive Data</h3>
              <p className="text-sm text-gray-600">Access to 200,000+ property records from 10 NW London councils</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-Time Updates</h3>
              <p className="text-sm text-gray-600">Daily updates from planning portals and property registers</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Local Expertise</h3>
              <p className="text-sm text-gray-600">Deep knowledge of North West London property market</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">GDPR Compliant</h3>
              <p className="text-sm text-gray-600">Full compliance with UK data protection regulations</p>
            </div>
          </div>
        </div>

        {/* Service Areas */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Areas We Cover</h2>
          <div className="bg-white rounded-lg shadow-md p-8">
            <p className="text-center text-gray-600 mb-6">
              We provide comprehensive property data and services across North West London, including:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {SERVICE_AREAS.map((area, index) => (
                <div key={index} className="flex items-center text-gray-700">
                  <svg className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  <span className="text-sm">{area}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mt-6">
              And many more areas across NW London postcodes (NW1-NW11)
            </p>
          </div>
        </div>

        {/* Data Sources */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Our Data Sources</h2>
          <div className="prose prose-lg max-w-none">
            <p className="text-gray-700 mb-6">
              We aggregate property data from trusted, authoritative sources to ensure accuracy and reliability:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">HM Land Registry</h4>
                  <p className="text-sm text-gray-600">Official property ownership and sale price data</p>
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">Local Council Planning Portals</h4>
                  <p className="text-sm text-gray-600">Planning applications from 10 NW London councils</p>
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">Energy Performance Certificates</h4>
                  <p className="text-sm text-gray-600">Official EPC ratings and energy efficiency data</p>
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">Transport for London</h4>
                  <p className="text-sm text-gray-600">Public transport accessibility and connections</p>
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">Police UK Crime Data</h4>
                  <p className="text-sm text-gray-600">Local crime statistics and safety information</p>
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-5 h-5 text-blue-600 mr-3 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-gray-900">NHS & Local Amenities</h4>
                  <p className="text-sm text-gray-600">Schools, healthcare, and community facilities</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-8 mb-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Get in Touch</h2>
            <p className="text-xl text-blue-100">
              Ready to explore North West London property data? Contact us today.
            </p>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg p-6 text-gray-900">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Address</h3>
                  <p className="text-sm">
                    {COMPANY.address.line1}<br />
                    {COMPANY.address.line2}<br />
                    {COMPANY.address.city} {COMPANY.address.postcode}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Contact</h3>
                  <p className="text-sm">
                    <a href={COMPANY.contact.phoneHref} className="text-blue-600 hover:text-blue-800">
                      {COMPANY.contact.phone}
                    </a>
                    <br />
                    <a href={COMPANY.contact.emailHref} className="text-blue-600 hover:text-blue-800">
                      {COMPANY.contact.email}
                    </a>
                  </p>
                </div>
              </div>
              <div className="mt-6 text-center">
                <a
                  href="/contact"
                  className="inline-block bg-blue-600 text-white px-8 py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
