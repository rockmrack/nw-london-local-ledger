/**
 * Legal Compliance Module
 * Central export point for all legal compliance tools
 */

export { PrivacyPolicyGenerator } from './privacy-policy';
export type { PrivacyPolicyConfig } from './privacy-policy';

export { CookieConsentManager, cookieConsentManager } from './cookie-consent';
export type { CookieCategory, CookieDefinition, ConsentPreferences } from './cookie-consent';

export { TermsOfServiceGenerator } from './terms-of-service';
export type { TermsConfig } from './terms-of-service';

export { DataRetentionManager, dataRetentionManager } from './data-retention';
export type { RetentionPolicy, DataRetentionLog } from './data-retention';

export { LegalDisclaimerSystem, legalDisclaimerSystem } from './disclaimer';
export type { DisclaimerType, DisclaimerConfig } from './disclaimer';

// Default configuration for the platform
export const defaultLegalConfig = {
  company: {
    name: 'NW London Local Ledger',
    email: 'legal@nwlondonledger.com',
    address: 'London, United Kingdom',
    website: 'https://nwlondonledger.com',
    dpoEmail: 'dpo@nwlondonledger.com'
  },
  compliance: {
    jurisdiction: 'England and Wales',
    disputeResolution: 'litigation' as const,
    icoRegistration: '', // Add when registered
    dataProcessingAgreements: true
  },
  features: {
    cookieConsent: true,
    dataRetention: true,
    legalDisclaimers: true,
    privacyByDesign: true,
    auditLogging: true
  }
};

/**
 * Initialize all legal compliance systems
 */
export function initializeLegalCompliance() {
  // Initialize cookie consent
  if (typeof window !== 'undefined') {
    const consent = cookieConsentManager.getConsent();
    if (!consent) {
      // Show consent banner on first visit
      console.log('Cookie consent required');
    }
  }

  // Schedule data retention checks
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    // Run retention policies daily
    setInterval(() => {
      dataRetentionManager.executeRetentionPolicies(false)
        .then(results => {
          console.log('Data retention executed:', results);
        })
        .catch(error => {
          console.error('Data retention error:', error);
        });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  return {
    cookieConsentManager,
    dataRetentionManager,
    legalDisclaimerSystem
  };
}