/**
 * Cookie Consent Component
 * GDPR/PECR compliant cookie consent banner
 */

import React, { useState, useEffect } from 'react';
import { cookieConsentManager } from '@/lib/legal/cookie-consent';
import type { ConsentPreferences } from '@/lib/legal/cookie-consent';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<Partial<ConsentPreferences>>({
    analytics: false,
    marketing: false,
    preferences: true
  });

  useEffect(() => {
    // Check if consent already given
    const existingConsent = cookieConsentManager.getConsent();
    if (!existingConsent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    cookieConsentManager.acceptAll();
    setIsVisible(false);
  };

  const handleRejectAll = () => {
    cookieConsentManager.rejectAll();
    setIsVisible(false);
  };

  const handleSavePreferences = () => {
    cookieConsentManager.saveConsent(preferences);
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-blue-600 shadow-2xl">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Cookie Consent
            </h3>
            <p className="text-sm text-gray-600">
              We use cookies to improve your experience, analyze site usage, and assist in our marketing efforts.
              By clicking "Accept All", you consent to our use of cookies.
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="ml-2 text-blue-600 hover:text-blue-700 underline"
              >
                {showDetails ? 'Hide' : 'Show'} Details
              </button>
            </p>

            {showDetails && (
              <div className="mt-4 space-y-3">
                <div className="bg-gray-50 p-3 rounded">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium text-sm">Essential Cookies</span>
                      <span className="text-xs text-gray-500 ml-2">(Always Required)</span>
                      <p className="text-xs text-gray-600 mt-1">
                        Required for basic site functionality, security, and authentication.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.analytics}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        analytics: e.target.checked
                      })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium text-sm">Analytics Cookies</span>
                      <p className="text-xs text-gray-600 mt-1">
                        Help us understand how visitors interact with our website.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.marketing}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        marketing: e.target.checked
                      })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium text-sm">Marketing Cookies</span>
                      <p className="text-xs text-gray-600 mt-1">
                        Used to track visitors across websites for marketing purposes.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="bg-gray-50 p-3 rounded">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.preferences}
                      onChange={(e) => setPreferences({
                        ...preferences,
                        preferences: e.target.checked
                      })}
                      className="mr-2"
                    />
                    <div>
                      <span className="font-medium text-sm">Preference Cookies</span>
                      <p className="text-xs text-gray-600 mt-1">
                        Remember your settings and preferences for a better experience.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button
              onClick={handleRejectAll}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Reject All
            </button>

            {showDetails ? (
              <button
                onClick={handleSavePreferences}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Save Preferences
              </button>
            ) : (
              <button
                onClick={handleAcceptAll}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Accept All
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            By using our site, you agree to our{' '}
            <a href="/privacy-policy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/cookie-policy" className="text-blue-600 hover:underline">
              Cookie Policy
            </a>
            . You can change your preferences at any time in{' '}
            <button
              onClick={() => {/* Open preferences modal */}}
              className="text-blue-600 hover:underline"
            >
              Cookie Settings
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;