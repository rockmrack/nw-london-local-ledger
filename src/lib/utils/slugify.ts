/**
 * Utility function to convert strings to URL-friendly slugs
 */

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

/**
 * Create a slug for a property address
 */
export function slugifyPropertyAddress(address: string, postcode: string): string {
  const cleanAddress = address.replace(/,/g, '').replace(/\s+/g, '-');
  const cleanPostcode = postcode.replace(/\s+/g, '-');
  return slugify(`${cleanAddress}-${cleanPostcode}`);
}

/**
 * Create a slug for a planning application
 */
export function slugifyPlanningReference(reference: string, address: string): string {
  const cleanRef = reference.replace(/\//g, '-');
  const cleanAddress = address.split(',')[0]; // Take first part of address
  return slugify(`${cleanRef}-${cleanAddress}`);
}

/**
 * Generate a unique slug by appending a number if needed
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: string[]
): string {
  let slug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
