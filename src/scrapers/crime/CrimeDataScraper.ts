/**
 * Police Crime Data API Scraper
 * Fetches crime statistics by area from UK Police API
 */

import { BaseScraper, ScraperConfig } from '../councils/base/BaseScraper';
import { query, bulkInsert } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';

interface CrimeData {
  id: string;
  category: string;
  location_type: string;
  location: {
    latitude: string;
    longitude: string;
    street: {
      id: number;
      name: string;
    };
  };
  context: string;
  outcome_status: {
    category: string;
    date: string;
  } | null;
  persistent_id: string;
  month: string;
}

interface ForceData {
  id: string;
  name: string;
}

interface NeighbourhoodData {
  id: string;
  name: string;
}

export class CrimeDataScraper extends BaseScraper {
  private readonly apiBaseUrl = 'https://data.police.uk/api';

  constructor() {
    const config: ScraperConfig = {
      council: 'Police',
      baseUrl: 'https://data.police.uk',
      rateLimit: 15, // UK Police API allows 15 requests per second
      maxRetries: 3,
      timeout: 30000,
      userAgent: 'NWLondonLedger-Bot/1.0'
    };

    super(config);
  }

  /**
   * Main method to scrape crime data for NW London
   */
  async scrapeCrimeData(): Promise<void> {
    logger.info('Starting crime data scrape for NW London');

    try {
      // Get all NW London areas with coordinates
      const areas = await this.getNWLondonAreas();

      // Get the last 6 months of available data
      const availableDates = await this.getAvailableDates();
      const recentDates = availableDates.slice(-6); // Last 6 months

      // Process each area and date combination
      for (const area of areas) {
        for (const date of recentDates) {
          await this.scrapeAreaCrimeData(area, date);
        }
      }

      // Update area crime statistics
      await this.updateAreaCrimeStats();

      logger.info('Crime data scrape completed successfully');
    } catch (error) {
      logger.error('Failed to scrape crime data:', error);
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
      WHERE council IN ('Camden', 'Barnet', 'Brent', 'Westminster', 'Harrow', 'Ealing',
                        'Hammersmith and Fulham', 'Kensington and Chelsea', 'Hillingdon', 'Hounslow')
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    `);

    return result.rows;
  }

  /**
   * Get available dates from Police API
   */
  private async getAvailableDates(): Promise<string[]> {
    try {
      const response = await this.fetch(`${this.apiBaseUrl}/crimes-street-dates`);
      const dates = await response.json();
      return dates.map((d: { date: string }) => d.date);
    } catch (error) {
      logger.error('Failed to fetch available dates:', error);
      // Return default last 6 months
      const dates: string[] = [];
      for (let i = 0; i < 6; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        dates.push(date.toISOString().slice(0, 7)); // YYYY-MM format
      }
      return dates.reverse();
    }
  }

  /**
   * Scrape crime data for a specific area and date
   */
  private async scrapeAreaCrimeData(area: any, date: string): Promise<void> {
    try {
      // Define search radius (1km around area center)
      const crimes = await this.fetchCrimesNearLocation(
        area.latitude,
        area.longitude,
        date
      );

      if (crimes.length === 0) {
        logger.debug(`No crimes found for ${area.name} in ${date}`);
        return;
      }

      await this.saveCrimeData(crimes, area);
      logger.info(`Saved ${crimes.length} crimes for ${area.name} in ${date}`);
    } catch (error) {
      logger.error(`Failed to scrape crime data for ${area.name} in ${date}:`, error);
    }
  }

  /**
   * Fetch crimes near a location
   */
  private async fetchCrimesNearLocation(
    lat: number,
    lng: number,
    date: string
  ): Promise<CrimeData[]> {
    const url = `${this.apiBaseUrl}/crimes-street/all-crime`;
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      date: date
    });

    try {
      const response = await this.fetch(`${url}?${params}`);

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(`Failed to fetch crimes for location (${lat}, ${lng}) in ${date}:`, error);
      return [];
    }
  }

  /**
   * Fetch crimes by postcode (alternative method)
   */
  private async fetchCrimesByPostcode(postcode: string, date: string): Promise<CrimeData[]> {
    // First, get location from postcode
    const locationUrl = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;

    try {
      const locationResponse = await this.fetch(locationUrl);
      if (!locationResponse.ok) return [];

      const locationData = await locationResponse.json();
      if (!locationData.result) return [];

      const { latitude, longitude } = locationData.result;

      return await this.fetchCrimesNearLocation(latitude, longitude, date);
    } catch (error) {
      logger.error(`Failed to fetch crimes for postcode ${postcode}:`, error);
      return [];
    }
  }

  /**
   * Save crime data to database
   */
  private async saveCrimeData(crimes: CrimeData[], area: any): Promise<void> {
    const records = crimes.map(crime => ({
      crime_id: crime.id,
      latitude: parseFloat(crime.location.latitude),
      longitude: parseFloat(crime.location.longitude),
      street_name: crime.location.street?.name || 'Unknown',
      area_id: area.id,
      category: crime.category,
      crime_type: crime.category, // Can be expanded with more specific mapping
      month: new Date(`${crime.month}-01`),
      outcome_status: crime.outcome_status?.category || 'Status update unavailable',
      location_type: crime.location_type,
      context: crime.context || null
    }));

    try {
      await bulkInsert(
        'crime_stats',
        records,
        'ON CONFLICT (crime_id) DO UPDATE SET ' +
        'outcome_status = EXCLUDED.outcome_status, ' +
        'updated_at = NOW()'
      );
    } catch (error) {
      logger.error('Failed to save crime data:', error);
      throw error;
    }
  }

  /**
   * Update area crime statistics
   */
  private async updateAreaCrimeStats(): Promise<void> {
    try {
      await query(`
        WITH crime_summary AS (
          SELECT
            area_id,
            COUNT(*) as total_crimes,
            COUNT(CASE WHEN category LIKE '%violent%' THEN 1 END) as violent_crimes,
            COUNT(CASE WHEN category = 'burglary' THEN 1 END) as burglary,
            COUNT(CASE WHEN category LIKE '%vehicle%' THEN 1 END) as vehicle_crimes,
            COUNT(DISTINCT month) as months_with_data
          FROM crime_stats
          WHERE month >= CURRENT_DATE - INTERVAL '12 months'
          GROUP BY area_id
        ),
        area_population AS (
          -- Estimate population based on property count (avg 2.4 people per household)
          SELECT
            area_id,
            COUNT(*) * 2.4 as estimated_population
          FROM properties
          GROUP BY area_id
        )
        UPDATE area_statistics
        SET total_crimes_annual = cs.total_crimes,
            violent_crimes_annual = cs.violent_crimes,
            burglary_annual = cs.burglary,
            vehicle_crimes_annual = cs.vehicle_crimes,
            crime_rate_per_1000 = CASE
              WHEN ap.estimated_population > 0
              THEN (cs.total_crimes::DECIMAL / ap.estimated_population) * 1000
              ELSE NULL
            END,
            updated_at = NOW()
        FROM crime_summary cs
        LEFT JOIN area_population ap ON cs.area_id = ap.area_id
        WHERE area_statistics.area_id = cs.area_id
      `);

      logger.info('Updated area crime statistics');
    } catch (error) {
      logger.error('Failed to update area crime stats:', error);
    }
  }

  /**
   * Get crime categories and their descriptions
   */
  async getCrimeCategories(): Promise<any[]> {
    try {
      const response = await this.fetch(`${this.apiBaseUrl}/crime-categories`);
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch crime categories:', error);
      return [];
    }
  }

  /**
   * Get crime summary for an area
   */
  async getAreaCrimeSummary(areaId: number, months: number = 12): Promise<any> {
    const result = await query(`
      SELECT
        COUNT(*) as total_crimes,
        COUNT(DISTINCT month) as months_covered,
        category,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM crime_stats
      WHERE area_id = $1
      AND month >= CURRENT_DATE - INTERVAL '${months} months'
      GROUP BY category
      ORDER BY count DESC
    `, [areaId]);

    return result.rows;
  }

  /**
   * Get crime trends over time
   */
  async getAreaCrimeTrends(areaId: number): Promise<any[]> {
    const result = await query(`
      SELECT
        DATE_TRUNC('month', month) as month,
        COUNT(*) as total_crimes,
        COUNT(CASE WHEN category LIKE '%violent%' THEN 1 END) as violent_crimes,
        COUNT(CASE WHEN category = 'burglary' THEN 1 END) as burglary,
        COUNT(CASE WHEN category = 'anti-social-behaviour' THEN 1 END) as asb
      FROM crime_stats
      WHERE area_id = $1
      AND month >= CURRENT_DATE - INTERVAL '24 months'
      GROUP BY DATE_TRUNC('month', month)
      ORDER BY month ASC
    `, [areaId]);

    return result.rows;
  }

  /**
   * Get crime hotspots within an area
   */
  async getCrimeHotspots(areaId: number, limit: number = 10): Promise<any[]> {
    const result = await query(`
      WITH crime_clusters AS (
        SELECT
          street_name,
          COUNT(*) as crime_count,
          ARRAY_AGG(DISTINCT category) as crime_types,
          AVG(latitude) as avg_lat,
          AVG(longitude) as avg_lng
        FROM crime_stats
        WHERE area_id = $1
        AND month >= CURRENT_DATE - INTERVAL '6 months'
        AND street_name != 'Unknown'
        GROUP BY street_name
      )
      SELECT *
      FROM crime_clusters
      ORDER BY crime_count DESC
      LIMIT $2
    `, [areaId, limit]);

    return result.rows;
  }

  /**
   * Compare crime rates between areas
   */
  async compareAreaCrimeRates(areaIds: number[]): Promise<any[]> {
    const placeholders = areaIds.map((_, i) => `$${i + 1}`).join(',');

    const result = await query(`
      WITH area_crime_rates AS (
        SELECT
          a.id,
          a.name,
          COUNT(cs.id) as total_crimes,
          COUNT(DISTINCT DATE_TRUNC('month', cs.month)) as months_with_data,
          ROUND(COUNT(cs.id)::DECIMAL / NULLIF(COUNT(DISTINCT DATE_TRUNC('month', cs.month)), 0), 2) as avg_monthly_crimes
        FROM areas a
        LEFT JOIN crime_stats cs ON a.id = cs.area_id
          AND cs.month >= CURRENT_DATE - INTERVAL '12 months'
        WHERE a.id IN (${placeholders})
        GROUP BY a.id, a.name
      )
      SELECT
        *,
        RANK() OVER (ORDER BY avg_monthly_crimes ASC) as safety_rank
      FROM area_crime_rates
      ORDER BY avg_monthly_crimes ASC
    `, areaIds);

    return result.rows;
  }
}