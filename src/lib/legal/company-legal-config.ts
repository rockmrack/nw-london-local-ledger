/**
 * Legal Configuration for Hampstead Renovations
 * Pre-configured legal documents with company details
 */

import { PrivacyPolicyGenerator } from './privacy-policy';
import { TermsOfServiceGenerator } from './terms-of-service';
import { COMPANY } from '../constants/company';

/**
 * Company-specific privacy policy configuration
 */
export const privacyPolicyConfig = {
  companyName: COMPANY.legalName,
  companyEmail: COMPANY.contact.email,
  companyAddress: COMPANY.address.full,
  websiteUrl: COMPANY.contact.website,
  lastUpdated: new Date(),
  dataProtectionOfficerEmail: COMPANY.legal.dpo,
  icoRegistrationNumber: COMPANY.legal.icoNumber,
};

/**
 * Company-specific terms of service configuration
 */
export const termsOfServiceConfig = {
  companyName: COMPANY.legalName,
  companyEmail: COMPANY.contact.email,
  companyAddress: COMPANY.address.full,
  websiteUrl: COMPANY.contact.website,
  lastUpdated: new Date(),
  jurisdiction: 'England and Wales',
  disputeResolution: 'litigation' as const,
};

/**
 * Pre-configured privacy policy generator for Hampstead Renovations
 */
export const hampsteadPrivacyPolicy = new PrivacyPolicyGenerator(privacyPolicyConfig);

/**
 * Pre-configured terms of service generator for Hampstead Renovations
 */
export const hampsteadTermsOfService = new TermsOfServiceGenerator(termsOfServiceConfig);

/**
 * Get the current privacy policy document
 */
export function getPrivacyPolicy(): string {
  return hampsteadPrivacyPolicy.generatePolicy();
}

/**
 * Get the current privacy policy as JSON
 */
export function getPrivacyPolicyJSON() {
  return hampsteadPrivacyPolicy.generateJSON();
}

/**
 * Get the current terms of service document
 */
export function getTermsOfService(): string {
  return hampsteadTermsOfService.generateTerms();
}

/**
 * Get the current terms of service as JSON
 */
export function getTermsOfServiceJSON() {
  return hampsteadTermsOfService.generateJSON();
}

/**
 * Get cookie policy specific to Hampstead Renovations
 */
export function getCookiePolicy(): string {
  return `
# Cookie Policy - Hampstead Renovations

**Last Updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}**

## About This Policy

${COMPANY.name} ("we", "our", or "us") uses cookies and similar technologies on our website at ${COMPANY.contact.website}.

This Cookie Policy explains what cookies are, how we use them, and your choices regarding cookies.

## What Are Cookies?

Cookies are small text files that are placed on your device when you visit our website. They help us provide you with a better experience by:
- Remembering your preferences
- Understanding how you use our site
- Improving site functionality

## Cookies We Use

### Essential Cookies (Always Active)
These cookies are necessary for the website to function properly.

| Cookie Name | Purpose | Duration |
|-------------|---------|----------|
| session_id | Maintains your session state | Session |
| cookie_consent | Stores your cookie preferences | 1 year |

### Analytics Cookies (Optional)
These cookies help us understand how visitors use our website.

| Cookie Name | Provider | Purpose | Duration |
|-------------|----------|---------|----------|
| _ga | Google Analytics | Distinguish users | 2 years |
| _gid | Google Analytics | Distinguish users | 24 hours |
| _gat | Google Analytics | Throttle request rate | 1 minute |

### Preference Cookies (Optional)
These cookies remember your settings and preferences.

| Cookie Name | Purpose | Duration |
|-------------|---------|----------|
| user_preferences | Store UI preferences | 1 year |
| area_selection | Remember selected areas | 1 year |

## Managing Cookies

You can control and manage cookies in several ways:

### Through Our Cookie Banner
When you first visit our site, you can choose which cookies to accept through our cookie consent banner.

### Through Your Browser
Most browsers allow you to:
- View cookies stored on your device
- Delete cookies
- Block cookies from specific sites
- Block all cookies

**Note:** Blocking essential cookies may prevent you from using parts of our website.

### Browser-Specific Instructions

**Chrome:** Settings > Privacy and Security > Cookies and other site data
**Firefox:** Settings > Privacy & Security > Cookies and Site Data
**Safari:** Preferences > Privacy > Manage Website Data
**Edge:** Settings > Cookies and site permissions > Cookies and site data

## Third-Party Cookies

We use Google Analytics to help us understand how our website is used. Google Analytics sets cookies on your device. For more information about Google's privacy practices, visit: https://policies.google.com/privacy

You can opt-out of Google Analytics tracking by installing the Google Analytics Opt-out Browser Add-on: https://tools.google.com/dlpage/gaoptout

## Contact Us

If you have questions about our use of cookies, please contact:

**${COMPANY.name}**
${COMPANY.address.full}
Email: ${COMPANY.contact.email}
Phone: ${COMPANY.contact.phone}

## Updates to This Policy

We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated revision date.

## Legal Compliance

This Cookie Policy complies with:
- UK GDPR (General Data Protection Regulation)
- PECR (Privacy and Electronic Communications Regulations)
- ePrivacy Directive

For more information about your privacy rights, see our [Privacy Policy](${COMPANY.contact.website}/privacy).
`;
}

/**
 * Get data protection contact information
 */
export function getDataProtectionContact(): {
  officer: string;
  email: string;
  address: string;
  phone: string;
} {
  return {
    officer: 'Data Protection Officer',
    email: COMPANY.legal.dpo,
    address: COMPANY.address.full,
    phone: COMPANY.contact.phone,
  };
}
