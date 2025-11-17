/**
 * Company Information Constants
 * Centralized company branding and contact information
 */

import companyConfig from '../../../config/company.json';

export const COMPANY = {
  name: 'Hampstead Renovations',
  legalName: 'Hampstead Renovations Ltd',

  address: {
    line1: 'Unit 3, Palace Court',
    line2: '250 Finchley Road',
    city: 'London',
    postcode: 'NW3 6DN',
    country: 'United Kingdom',
    full: 'Unit 3, Palace Court, 250 Finchley Road, London NW3 6DN',
  },

  contact: {
    phone: '07459 345456',
    phoneFormatted: '07459 345456',
    phoneHref: 'tel:+447459345456',
    email: 'contact@hampsteadrenovations.co.uk',
    emailHref: 'mailto:contact@hampsteadrenovations.co.uk',
    website: 'https://www.hampsteadrenovations.co.uk',
  },

  branding: {
    tagline: 'Your Trusted Partner for North West London Property Information',
    description: 'Hampstead Renovations provides comprehensive property data, planning applications, and local area insights for North West London. Specializing in property renovation, development, and market intelligence.',
    shortDescription: 'NW London property data and renovation specialists',
  },

  social: {
    twitter: '@HampsteadReno',
    facebook: 'HampsteadRenovations',
    linkedin: 'company/hampstead-renovations',
    instagram: '@hampsteadrenovations',
  },

  legal: {
    dpo: 'contact@hampsteadrenovations.co.uk',
    icoNumber: 'TBD',
    companyNumber: 'TBD',
    vatNumber: 'TBD',
  },
} as const;

export const COMPANY_META = {
  title: 'Hampstead Renovations - NW London Property Data & Planning',
  titleTemplate: '%s | Hampstead Renovations',
  description: 'Hampstead Renovations provides comprehensive property data, planning applications, and market intelligence for North West London. Search properties, planning applications, and local area insights.',
  keywords: [
    'Hampstead Renovations',
    'North West London property',
    'property renovation',
    'planning applications',
    'property data NW London',
    'Hampstead property services',
    'property development London',
    'NW London property search',
    'planning permission London',
    'property market intelligence',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: 'Hampstead Renovations',
  },
} as const;

export const SERVICE_AREAS = [
  'Hampstead',
  'Belsize Park',
  'Swiss Cottage',
  'West Hampstead',
  'Primrose Hill',
  'St John\'s Wood',
  'Camden',
  'Finchley',
  'Golders Green',
  'Kilburn',
  'Brent',
  'Barnet',
  'Ealing',
  'Harrow',
  'Haringey',
] as const;

export const SERVICES = [
  'Property Data & Market Intelligence',
  'Planning Application Insights',
  'Property Renovation Services',
  'Development Opportunities Analysis',
  'Local Area Market Reports',
  'Property Valuation Data',
  'Planning Permission Research',
  'Property Development Consulting',
] as const;

/**
 * Get formatted company address for display
 */
export function getFormattedAddress(multiline: boolean = false): string {
  if (multiline) {
    return `${COMPANY.address.line1}\n${COMPANY.address.line2}\n${COMPANY.address.city} ${COMPANY.address.postcode}`;
  }
  return COMPANY.address.full;
}

/**
 * Get company contact vCard data
 */
export function getVCardData(): string {
  return `BEGIN:VCARD
VERSION:3.0
FN:${COMPANY.name}
ORG:${COMPANY.legalName}
ADR;TYPE=WORK:;;${COMPANY.address.line1};${COMPANY.address.city};;${COMPANY.address.postcode};${COMPANY.address.country}
TEL;TYPE=WORK,VOICE:${COMPANY.contact.phone}
EMAIL:${COMPANY.contact.email}
URL:${COMPANY.contact.website}
END:VCARD`;
}

/**
 * Get structured data for Organization schema
 */
export function getOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    'name': COMPANY.name,
    'legalName': COMPANY.legalName,
    'url': COMPANY.contact.website,
    'logo': `${COMPANY.contact.website}/logo.png`,
    'image': `${COMPANY.contact.website}/og-image.png`,
    'description': COMPANY.branding.description,
    'address': {
      '@type': 'PostalAddress',
      'streetAddress': `${COMPANY.address.line1}, ${COMPANY.address.line2}`,
      'addressLocality': COMPANY.address.city,
      'postalCode': COMPANY.address.postcode,
      'addressCountry': 'GB',
    },
    'contactPoint': {
      '@type': 'ContactPoint',
      'telephone': COMPANY.contact.phone,
      'email': COMPANY.contact.email,
      'contactType': 'customer service',
      'areaServed': 'GB',
      'availableLanguage': 'English',
    },
    'sameAs': [
      `https://twitter.com/${COMPANY.social.twitter.replace('@', '')}`,
      `https://www.facebook.com/${COMPANY.social.facebook}`,
      `https://www.linkedin.com/${COMPANY.social.linkedin}`,
      `https://www.instagram.com/${COMPANY.social.instagram.replace('@', '')}`,
    ],
    'areaServed': {
      '@type': 'GeoCircle',
      'geoMidpoint': {
        '@type': 'GeoCoordinates',
        'latitude': '51.5486',
        'longitude': '-0.1777',
      },
      'geoRadius': '15000', // 15km radius from Hampstead
    },
    'priceRange': '£££',
    'serviceType': SERVICES,
  };
}
