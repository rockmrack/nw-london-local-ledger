/**
 * Schema Markup Utilities
 * Generate JSON-LD structured data for SEO
 */

import type { Property, PropertyWithSales } from '@/types/property';
import type { PlanningApplication } from '@/types/planning';
import type { Area } from '@/types/area';
import type { NewsArticle } from '@/types/news';

/**
 * Generate Property schema markup
 */
export function generatePropertySchema(property: PropertyWithSales) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SingleFamilyResidence',
    name: property.addressLine1,
    description: `${property.bedrooms || ''} bedroom ${property.propertyType || 'property'} in ${property.postcode}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${property.addressLine1}${property.addressLine2 ? ', ' + property.addressLine2 : ''}`,
      addressLocality: property.postcode,
      postalCode: property.postcode,
      addressCountry: 'GB',
    },
    ...(property.latitude &&
      property.longitude && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: property.latitude,
          longitude: property.longitude,
        },
      }),
    ...(property.bedrooms && {
      numberOfRooms: property.bedrooms,
    }),
    ...(property.floorAreaSqm && {
      floorSize: {
        '@type': 'QuantitativeValue',
        value: property.floorAreaSqm,
        unitCode: 'MTK',
      },
    }),
    ...(property.lastSalePrice && {
      offers: {
        '@type': 'Offer',
        price: property.lastSalePrice,
        priceCurrency: 'GBP',
        ...(property.lastSaleDate && {
          priceValidUntil: property.lastSaleDate,
        }),
      },
    }),
  };
}

/**
 * Generate Area/Place schema markup
 */
export function generateAreaSchema(area: Area, stats?: any) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: area.name,
    description: area.description || `${area.name} area in North West London`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: area.name,
      postalCode: area.postcodePrefix,
      addressCountry: 'GB',
    },
    ...(area.latitude &&
      area.longitude && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: area.latitude,
          longitude: area.longitude,
        },
      }),
    ...(stats?.averagePrice && {
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          name: 'Average Property Price',
          value: stats.averagePrice,
          unitCode: 'GBP',
        },
      ],
    }),
  };
}

/**
 * Generate News Article schema markup
 */
export function generateArticleSchema(article: NewsArticle, author?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt,
    ...(article.featuredImageUrl && {
      image: [article.featuredImageUrl],
    }),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: {
      '@type': article.aiGenerated ? 'Organization' : 'Person',
      name: author || 'NW London Local Ledger',
    },
    publisher: {
      '@type': 'Organization',
      name: 'NW London Local Ledger',
      logo: {
        '@type': 'ImageObject',
        url: 'https://nwlondonledger.com/logo.png',
      },
    },
    articleBody: article.content,
  };
}

/**
 * Generate Organization schema markup
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'NW London Local Ledger',
    url: 'https://nwlondonledger.com',
    logo: 'https://nwlondonledger.com/logo.png',
    description:
      'The most comprehensive data-driven community hub for North West London property information, planning applications, and local news.',
    areaServed: {
      '@type': 'Place',
      name: 'North West London',
      geo: {
        '@type': 'GeoCircle',
        geoMidpoint: {
          '@type': 'GeoCoordinates',
          latitude: 51.5517,
          longitude: -0.1865,
        },
        geoRadius: '5000',
      },
    },
    sameAs: [
      'https://twitter.com/nwlondonledger',
      'https://facebook.com/nwlondonledger',
    ],
  };
}

/**
 * Generate BreadcrumbList schema
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://nwlondonledger.com${item.url}`,
    })),
  };
}

/**
 * Generate FAQ schema
 */
export function generateFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate LocalBusiness schema for area pages
 */
export function generateLocalBusinessSchema(area: Area) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: `NW London Property Information - ${area.name}`,
    description: `Property and planning data for ${area.name}, ${area.postcodePrefix}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: area.name,
      postalCode: area.postcodePrefix,
      addressCountry: 'GB',
    },
    ...(area.latitude &&
      area.longitude && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: area.latitude,
          longitude: area.longitude,
        },
      }),
  };
}

/**
 * Component to render schema markup
 */
export function SchemaMarkup({ schema }: { schema: any }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
