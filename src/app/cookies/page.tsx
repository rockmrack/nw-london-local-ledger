/**
 * Cookie Policy Page
 * Displays Hampstead Renovations cookie policy
 */

import React from 'react';
import type { Metadata } from 'next';
import { getCookiePolicy } from '@/lib/legal/company-legal-config';
import { COMPANY } from '@/lib/constants/company';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `Cookie policy for ${COMPANY.name}. Learn about the cookies we use and how to manage your preferences.`,
};

export default function CookiesPage() {
  const cookiePolicy = getCookiePolicy();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Company Header */}
          <div className="text-center mb-8 pb-8 border-b border-gray-200">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{COMPANY.name}</h1>
            <p className="text-gray-600">{COMPANY.address.full}</p>
            <p className="text-gray-600">
              <a href={COMPANY.contact.phoneHref} className="text-blue-600 hover:text-blue-800">{COMPANY.contact.phone}</a>
              {' | '}
              <a href={COMPANY.contact.emailHref} className="text-blue-600 hover:text-blue-800">{COMPANY.contact.email}</a>
            </p>
          </div>

          {/* Cookie Policy Content */}
          <div className="prose prose-lg max-w-none">
            <div dangerouslySetInnerHTML={{
              __html: cookiePolicy
                .split('\n')
                .map(line => {
                  if (line.startsWith('# ')) {
                    return `<h1 class="text-3xl font-bold text-gray-900 mt-8 mb-4">${line.replace('# ', '')}</h1>`;
                  } else if (line.startsWith('## ')) {
                    return `<h2 class="text-2xl font-bold text-gray-900 mt-6 mb-3">${line.replace('## ', '')}</h2>`;
                  } else if (line.startsWith('### ')) {
                    return `<h3 class="text-xl font-semibold text-gray-900 mt-4 mb-2">${line.replace('### ', '')}</h3>`;
                  } else if (line.startsWith('**') && line.endsWith('**')) {
                    return `<p class="font-semibold text-gray-900 mt-4">${line.replace(/\*\*/g, '')}</p>`;
                  } else if (line.startsWith('| ') && line.includes(' | ')) {
                    // Simple table row handling
                    const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
                    return `<tr>${cells.map(cell => `<td class="border px-4 py-2">${cell}</td>`).join('')}</tr>`;
                  } else if (line.startsWith('- ')) {
                    return `<li class="ml-4">${line.replace('- ', '')}</li>`;
                  } else if (line.trim() === '') {
                    return '<br>';
                  } else {
                    return `<p class="text-gray-700 leading-relaxed mb-4">${line}</p>`;
                  }
                })
                .join('')
            }} />
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              For questions about cookies, please contact:
            </p>
            <p className="text-sm font-medium text-gray-900 mt-2">
              {COMPANY.name}<br />
              {COMPANY.address.full}<br />
              <a href={COMPANY.contact.emailHref} className="text-blue-600 hover:text-blue-800">
                {COMPANY.contact.email}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
