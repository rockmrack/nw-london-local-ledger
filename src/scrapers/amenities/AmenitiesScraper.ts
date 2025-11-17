/**
 * Amenities Scraper
 * Fetches local amenities from Google Places API and NHS API
 */

import { BaseScraper, ScraperConfig } from '../councils/base/BaseScraper';
import { query, bulkInsert } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';

interface GooglePlace {
  place_id: string;
  name: string;
  types: string[];
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  opening_hours?: {
    open_now?: boolean;
    periods?: any[];
    weekday_text?: string[];
  };
  formatted_phone_number?: string;
  website?: string;
  wheelchair_accessible_entrance?: boolean;
  delivery?: boolean;
  takeout?: boolean;
  dine_in?: boolean;
  reservable?: boolean;
  photos?: { photo_reference: string }[];
}

interface NHSFacility {
  OrganisationID: string;
  OrganisationName: string;
  OrganisationType: string;
  Address1: string;
  Address2?: string;
  Address3?: string;
  City: string;
  County?: string;
  Postcode: string;
  Latitude?: number;
  Longitude?: number;
  Phone?: string;
  Website?: string;
  Services?: string[];
}

export class AmenitiesScraper extends BaseScraper {
  private readonly googleApiKey: string;
  private readonly googlePlacesUrl = 'https://maps.googleapis.com/maps/api/place';
  private readonly nhsApiUrl = 'https://api.nhs.uk/service-search';

  constructor() {
    const config: ScraperConfig = {
      council: 'Amenities',
      baseUrl: 'https://maps.googleapis.com',
      rateLimit: 10, // Google Places API rate limit
      maxRetries: 3,
      timeout: 30000,
      userAgent: 'NWLondonLedger-Bot/1.0'
    };

    super(config);
    this.googleApiKey = process.env.GOOGLE_PLACES_API_KEY || '';

    if (!this.googleApiKey) {
      logger.warn('Google Places API key not found. Amenities scraping will be limited.');
    }
  }

  /**
   * Main method to scrape amenities for NW London
   */
  async scrapeAmenities(): Promise<void> {
    logger.info('Starting amenities scrape for NW London');

    try {
      // Get all NW London areas
      const areas = await this.getNWLondonAreas();

      // Scrape different types of amenities
      for (const area of areas) {
        await this.scrapeAreaAmenities(area);
      }

      // Scrape NHS facilities separately
      await this.scrapeNHSFacilities();

      // Update area statistics
      await this.updateAreaAmenityStats();

      logger.info('Amenities scrape completed successfully');
    } catch (error) {
      logger.error('Failed to scrape amenities:', error);
      throw error;
    }
  }

  /**
   * Get NW London areas with coordinates
   */
  private async getNWLondonAreas(): Promise<any[]> {
    const result = await query(`
      SELECT
        id,
        name,
        latitude,
        longitude,
        postcode_prefix
      FROM areas
      WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND council IN ('Camden', 'Barnet', 'Brent', 'Westminster', 'Harrow', 'Ealing',
                      'Hammersmith and Fulham', 'Kensington and Chelsea', 'Hillingdon', 'Hounslow')
      LIMIT 50 -- Limit to control API costs
    `);

    return result.rows;
  }

  /**
   * Scrape amenities for a specific area
   */
  private async scrapeAreaAmenities(area: any): Promise<void> {
    logger.info(`Scraping amenities for ${area.name}`);

    // Categories to search for
    const categories = [
      { type: 'restaurant', category: 'restaurant', subcategory: null },
      { type: 'cafe', category: 'cafe', subcategory: null },
      { type: 'supermarket', category: 'supermarket', subcategory: null },
      { type: 'gym', category: 'gym', subcategory: 'fitness' },
      { type: 'park', category: 'park', subcategory: 'recreation' },
      { type: 'school', category: 'school', subcategory: 'education' },
      { type: 'pharmacy', category: 'pharmacy', subcategory: 'health' },
      { type: 'bank', category: 'bank', subcategory: 'finance' },
      { type: 'shopping_mall', category: 'shopping', subcategory: 'retail' },
      { type: 'movie_theater', category: 'entertainment', subcategory: 'cinema' }
    ];

    for (const cat of categories) {
      try {
        const places = await this.searchNearbyPlaces(
          area.latitude,
          area.longitude,
          cat.type
        );

        await this.saveGooglePlaces(places, area, cat.category, cat.subcategory);
        logger.info(`Found ${places.length} ${cat.type} amenities in ${area.name}`);
      } catch (error) {
        logger.error(`Failed to fetch ${cat.type} for ${area.name}:`, error);
      }
    }
  }

  /**
   * Search for nearby places using Google Places API
   */
  private async searchNearbyPlaces(
    lat: number,
    lng: number,
    type: string,
    radius: number = 1500
  ): Promise<GooglePlace[]> {
    if (!this.googleApiKey) {
      logger.warn('Google Places API key not configured');
      return [];
    }

    const url = `${this.googlePlacesUrl}/nearbysearch/json`;
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: radius.toString(),
      type: type,
      key: this.googleApiKey
    });

    try {
      const response = await this.fetch(`${url}?${params}`);
      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${data.status}`);
      }

      return data.results || [];
    } catch (error) {
      logger.error(`Failed to search nearby places:`, error);
      return [];
    }
  }

  /**
   * Get detailed place information
   */
  private async getPlaceDetails(placeId: string): Promise<GooglePlace | null> {
    if (!this.googleApiKey) return null;

    const url = `${this.googlePlacesUrl}/details/json`;
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,price_level,wheelchair_accessible_entrance,delivery,takeout,dine_in,reservable',
      key: this.googleApiKey
    });

    try {
      const response = await this.fetch(`${url}?${params}`);
      const data = await response.json();

      if (data.status === 'OK') {
        return data.result;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get place details for ${placeId}:`, error);
      return null;
    }
  }

  /**
   * Save Google Places to database
   */
  private async saveGooglePlaces(
    places: GooglePlace[],
    area: any,
    category: string,
    subcategory: string | null
  ): Promise<void> {
    if (places.length === 0) return;

    const records = places.map(place => {
      // Generate slug
      const slug = place.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Extract postcode from address if possible
      const postcodeMatch = place.formatted_address?.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : null;

      // Get photo URL if available
      const photoUrl = place.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${this.googleApiKey}`
        : null;

      return {
        place_id: place.place_id,
        name: place.name,
        slug,
        category,
        subcategory,
        address: place.formatted_address,
        postcode,
        area_id: area.id,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        phone: place.formatted_phone_number,
        website: place.website,
        opening_hours: place.opening_hours ? JSON.stringify(place.opening_hours.weekday_text) : null,
        price_level: place.price_level,
        rating: place.rating,
        rating_count: place.user_ratings_total,
        wheelchair_accessible: place.wheelchair_accessible_entrance,
        delivery: place.delivery,
        takeaway: place.takeout,
        reservations: place.reservable,
        photo_url: photoUrl,
        data_source: 'google_places',
        source_updated_at: new Date()
      };
    });

    try {
      await bulkInsert(
        'amenities',
        records,
        'ON CONFLICT (place_id) DO UPDATE SET ' +
        'rating = EXCLUDED.rating, ' +
        'rating_count = EXCLUDED.rating_count, ' +
        'opening_hours = EXCLUDED.opening_hours, ' +
        'source_updated_at = EXCLUDED.source_updated_at, ' +
        'updated_at = NOW()'
      );
    } catch (error) {
      logger.error('Failed to save Google Places:', error);
      throw error;
    }
  }

  /**
   * Scrape NHS facilities
   */
  private async scrapeNHSFacilities(): Promise<void> {
    logger.info('Scraping NHS facilities...');

    try {
      // Get postcodes for NW London
      const postcodes = await this.getNWLondonPostcodes();

      for (const postcode of postcodes) {
        const facilities = await this.searchNHSFacilities(postcode);
        await this.saveNHSFacilities(facilities);
      }

      logger.info('NHS facilities scrape completed');
    } catch (error) {
      logger.error('Failed to scrape NHS facilities:', error);
    }
  }

  /**
   * Get NW London postcodes
   */
  private async getNWLondonPostcodes(): Promise<string[]> {
    const result = await query(`
      SELECT DISTINCT postcode_prefix
      FROM areas
      WHERE postcode_prefix IN ('NW1', 'NW2', 'NW3', 'NW4', 'NW5', 'NW6', 'NW7', 'NW8', 'NW9', 'NW10', 'NW11',
                                'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14',
                                'HA', 'UB', 'TW')
      LIMIT 20
    `);

    return result.rows.map((row: any) => row.postcode_prefix);
  }

  /**
   * Search NHS facilities by postcode
   */
  private async searchNHSFacilities(postcode: string): Promise<NHSFacility[]> {
    // Note: NHS API endpoint is illustrative - actual implementation would need proper NHS API access
    const url = `${this.nhsApiUrl}/organizations`;
    const params = new URLSearchParams({
      postcode: postcode,
      range: '5' // 5 mile radius
    });

    try {
      // This is a placeholder - actual NHS API integration would be different
      logger.debug(`Would search NHS facilities for postcode: ${postcode}`);
      return [];
    } catch (error) {
      logger.error(`Failed to search NHS facilities for ${postcode}:`, error);
      return [];
    }
  }

  /**
   * Save NHS facilities to database
   */
  private async saveNHSFacilities(facilities: NHSFacility[]): Promise<void> {
    if (facilities.length === 0) return;

    const records = facilities.map(facility => {
      const slug = facility.OrganisationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const category = this.mapNHSTypeToCategory(facility.OrganisationType);

      return {
        place_id: `nhs_${facility.OrganisationID}`,
        name: facility.OrganisationName,
        slug,
        category,
        subcategory: 'healthcare',
        address: [facility.Address1, facility.Address2, facility.Address3, facility.City]
          .filter(Boolean)
          .join(', '),
        postcode: facility.Postcode,
        latitude: facility.Latitude,
        longitude: facility.Longitude,
        phone: facility.Phone,
        website: facility.Website,
        data_source: 'nhs',
        source_updated_at: new Date()
      };
    });

    try {
      await bulkInsert(
        'amenities',
        records,
        'ON CONFLICT (place_id) DO UPDATE SET ' +
        'phone = EXCLUDED.phone, ' +
        'website = EXCLUDED.website, ' +
        'source_updated_at = EXCLUDED.source_updated_at, ' +
        'updated_at = NOW()'
      );
    } catch (error) {
      logger.error('Failed to save NHS facilities:', error);
      throw error;
    }
  }

  /**
   * Map NHS organization type to category
   */
  private mapNHSTypeToCategory(type: string): string {
    const typeMap: { [key: string]: string } = {
      'GP Practice': 'gp_surgery',
      'Hospital': 'hospital',
      'Dental Practice': 'dentist',
      'Pharmacy': 'pharmacy',
      'Urgent Care': 'urgent_care',
      'Walk-in Centre': 'walk_in_centre'
    };

    return typeMap[type] || 'healthcare';
  }

  /**
   * Update area amenity statistics
   */
  private async updateAreaAmenityStats(): Promise<void> {
    try {
      await query(`
        WITH amenity_counts AS (
          SELECT
            area_id,
            COUNT(*) as total_amenities,
            COUNT(CASE WHEN category = 'restaurant' THEN 1 END) as restaurant_count,
            COUNT(CASE WHEN category = 'cafe' THEN 1 END) as cafe_count,
            COUNT(CASE WHEN category = 'supermarket' THEN 1 END) as supermarket_count,
            COUNT(CASE WHEN category = 'gym' THEN 1 END) as gym_count,
            COUNT(CASE WHEN category = 'park' THEN 1 END) as park_count,
            AVG(rating) as avg_amenity_rating
          FROM amenities
          WHERE area_id IS NOT NULL
          GROUP BY area_id
        )
        UPDATE area_statistics
        SET restaurant_count = ac.restaurant_count,
            cafe_count = ac.cafe_count,
            supermarket_count = ac.supermarket_count,
            gym_count = ac.gym_count,
            park_count = ac.park_count,
            avg_amenity_rating = ac.avg_amenity_rating,
            updated_at = NOW()
        FROM amenity_counts ac
        WHERE area_statistics.area_id = ac.area_id
      `);

      logger.info('Updated area amenity statistics');
    } catch (error) {
      logger.error('Failed to update area amenity stats:', error);
    }
  }

  /**
   * Find nearest amenities to a location
   */
  async findNearestAmenities(
    lat: number,
    lng: number,
    category: string,
    limit: number = 5
  ): Promise<any[]> {
    const result = await query(`
      SELECT
        *,
        ST_Distance(
          ST_MakePoint($1, $2)::geography,
          ST_MakePoint(longitude, latitude)::geography
        ) as distance_meters
      FROM amenities
      WHERE category = $3
      ORDER BY distance_meters ASC
      LIMIT $4
    `, [lng, lat, category, limit]);

    return result.rows;
  }
}