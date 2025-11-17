/**
 * Validation utilities
 */

/**
 * Validate UK postcode format
 */
export function isValidPostcode(postcode: string): boolean {
  const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
  return postcodeRegex.test(postcode.trim());
}

/**
 * Validate NW London postcode (NW1-NW11)
 */
export function isNWLondonPostcode(postcode: string): boolean {
  if (!isValidPostcode(postcode)) return false;
  const nwRegex = /^NW([1-9]|1[01])/i;
  return nwRegex.test(postcode.trim());
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UK phone number
 */
export function isValidUKPhone(phone: string): boolean {
  const phoneRegex = /^(?:(?:\(?(?:0(?:0|11)\)?[\s-]?\(?|\+)44\)?[\s-]?(?:\(?0\)?[\s-]?)?)|(?:\(?0))(?:(?:\d{5}\)?[\s-]?\d{4,5})|(?:\d{4}\)?[\s-]?(?:\d{5}|\d{3}[\s-]?\d{3}))|(?:\d{3}\)?[\s-]?\d{3}[\s-]?\d{3,4})|(?:\d{2}\)?[\s-]?\d{4}[\s-]?\d{4}))(?:[\s-]?(?:x|ext\.?|\#)\d{3,4})?$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Validate price range
 */
export function isValidPriceRange(minPrice?: number, maxPrice?: number): boolean {
  if (minPrice !== undefined && minPrice < 0) return false;
  if (maxPrice !== undefined && maxPrice < 0) return false;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return false;
  return true;
}

/**
 * Validate planning reference format
 */
export function isValidPlanningReference(reference: string): boolean {
  // Most councils use formats like: 2024/1234/P or 24/1234/F
  const refRegex = /^\d{2,4}\/\d{3,6}\/[A-Z]$/;
  return refRegex.test(reference.trim());
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and parse pagination parameters
 */
export function validatePaginationParams(
  page?: string | number,
  limit?: string | number
): { page: number; limit: number } {
  const parsedPage = typeof page === 'string' ? parseInt(page, 10) : page || 1;
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit || 20;

  return {
    page: Math.max(1, isNaN(parsedPage) ? 1 : parsedPage),
    limit: Math.min(100, Math.max(1, isNaN(parsedLimit) ? 20 : parsedLimit)),
  };
}
