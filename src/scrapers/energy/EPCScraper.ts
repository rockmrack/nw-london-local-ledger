/**
 * EPC (Energy Performance Certificate) Register API Scraper
 * Fetches energy ratings and efficiency data for properties
 */

import { BaseScraper, ScraperConfig } from '../councils/base/BaseScraper';
import { query, bulkInsert } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';

interface EPCCertificate {
  lmk_key: string; // Unique certificate ID
  address1: string;
  address2?: string;
  address3?: string;
  postcode: string;
  building_reference_number?: string;
  current_energy_rating: string;
  current_energy_efficiency: number;
  potential_energy_rating: string;
  potential_energy_efficiency: number;
  property_type: string;
  built_form: string;
  inspection_date: string;
  certificate_date: string;
  transaction_type: string;
  environment_impact_current: number;
  environment_impact_potential: number;
  energy_consumption_current: number;
  energy_consumption_potential: number;
  co2_emissions_current: number;
  co2_emissions_potential: number;
  co2_emiss_curr_per_floor_area: number;
  lighting_cost_current: number;
  lighting_cost_potential: number;
  heating_cost_current: number;
  heating_cost_potential: number;
  hot_water_cost_current: number;
  hot_water_cost_potential: number;
  total_floor_area: number;
  number_habitable_rooms?: number;
  number_heated_rooms?: number;
  main_fuel?: string;
  floor_description?: string;
  windows_description?: string;
  walls_description?: string;
  roof_description?: string;
  main_heating_description?: string;
  main_heating_controls?: string;
  hot_water_description?: string;
  lodgement_datetime: string;
  tenure?: string;
  fixed_lighting_outlets_count?: number;
  low_energy_lighting_percentage?: number;
}

export class EPCScraper extends BaseScraper {
  private readonly apiKey: string;
  private readonly apiBaseUrl = 'https://epc.opendatacommunities.org/api/v1';

  constructor() {
    const config: ScraperConfig = {
      council: 'EPC',
      baseUrl: 'https://epc.opendatacommunities.org',
      rateLimit: 5, // EPC API rate limit
      maxRetries: 3,
      timeout: 30000,
      userAgent: 'NWLondonLedger-Bot/1.0'
    };

    super(config);
    this.apiKey = process.env.EPC_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('EPC API key not found. EPC scraping will be limited.');
    }
  }

  /**
   * Main method to scrape EPC data for NW London postcodes
   */
  async scrapeEnergyRatings(): Promise<void> {
    logger.info('Starting EPC data scrape for NW London');

    try {
      // Get all NW London postcodes
      const postcodes = await this.getNWLondonPostcodes();

      // Process postcodes in batches
      const batchSize = 10;
      for (let i = 0; i < postcodes.length; i += batchSize) {
        const batch = postcodes.slice(i, i + batchSize);
        await Promise.all(batch.map(postcode => this.scrapePostcodeEPCs(postcode)));

        // Log progress
        logger.info(`Processed ${Math.min(i + batchSize, postcodes.length)} of ${postcodes.length} postcodes`);
      }

      // Update area statistics
      await this.updateAreaEnergyStats();

      logger.info('EPC data scrape completed successfully');
    } catch (error) {
      logger.error('Failed to scrape EPC data:', error);
      throw error;
    }
  }

  /**
   * Get all NW London postcodes from database
   */
  private async getNWLondonPostcodes(): Promise<string[]> {
    const result = await query(`
      SELECT DISTINCT postcode
      FROM areas
      WHERE postcode_prefix IN ('NW1', 'NW2', 'NW3', 'NW4', 'NW5', 'NW6', 'NW7', 'NW8', 'NW9', 'NW10', 'NW11',
                                'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14',
                                'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8',
                                'HA0', 'HA1', 'HA2', 'HA3', 'HA4', 'HA5', 'HA6', 'HA7', 'HA8', 'HA9',
                                'UB1', 'UB2', 'UB3', 'UB4', 'UB5', 'UB6', 'UB7', 'UB8', 'UB9', 'UB10',
                                'TW1', 'TW2', 'TW3', 'TW4', 'TW5', 'TW7', 'TW8')
      AND postcode IS NOT NULL
    `);

    return result.rows.map((row: any) => row.postcode);
  }

  /**
   * Scrape EPC certificates for a specific postcode
   */
  private async scrapePostcodeEPCs(postcode: string): Promise<void> {
    try {
      const certificates = await this.fetchEPCsByPostcode(postcode);

      if (certificates.length === 0) {
        logger.debug(`No EPC certificates found for postcode: ${postcode}`);
        return;
      }

      await this.saveEPCCertificates(certificates);
      logger.info(`Saved ${certificates.length} EPC certificates for postcode: ${postcode}`);
    } catch (error) {
      logger.error(`Failed to scrape EPCs for postcode ${postcode}:`, error);
    }
  }

  /**
   * Fetch EPC certificates from API
   */
  private async fetchEPCsByPostcode(postcode: string): Promise<EPCCertificate[]> {
    const url = `${this.apiBaseUrl}/domestic/search`;
    const headers = {
      'Authorization': `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
      'Accept': 'application/json'
    };

    const params = new URLSearchParams({
      postcode: postcode.replace(/\s+/g, ''),
      size: '200' // Maximum allowed per request
    });

    try {
      const response = await this.fetch(`${url}?${params}`, { headers });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      return data.rows || [];
    } catch (error) {
      logger.error(`Failed to fetch EPCs for postcode ${postcode}:`, error);
      return [];
    }
  }

  /**
   * Save EPC certificates to database
   */
  private async saveEPCCertificates(certificates: EPCCertificate[]): Promise<void> {
    const records = certificates.map(cert => ({
      certificate_hash: cert.lmk_key,
      address_line_1: cert.address1,
      address_line_2: cert.address2,
      address_line_3: cert.address3,
      postcode: cert.postcode,
      uprn: cert.building_reference_number,
      current_energy_rating: cert.current_energy_rating,
      current_energy_efficiency: cert.current_energy_efficiency,
      potential_energy_rating: cert.potential_energy_rating,
      potential_energy_efficiency: cert.potential_energy_efficiency,
      current_co2_emissions: cert.co2_emissions_current,
      potential_co2_emissions: cert.co2_emissions_potential,
      current_co2_emissions_per_floor_area: cert.co2_emiss_curr_per_floor_area,
      property_type: cert.property_type,
      built_form: cert.built_form,
      floor_area: cert.total_floor_area,
      number_habitable_rooms: cert.number_habitable_rooms,
      walls_description: cert.walls_description,
      roof_description: cert.roof_description,
      floor_description: cert.floor_description,
      windows_description: cert.windows_description,
      main_heating_description: cert.main_heating_description,
      main_heating_fuel: cert.main_fuel,
      hot_water_description: cert.hot_water_description,
      lighting_cost_current: cert.lighting_cost_current,
      heating_cost_current: cert.heating_cost_current,
      hot_water_cost_current: cert.hot_water_cost_current,
      total_energy_cost_current: (cert.lighting_cost_current || 0) + (cert.heating_cost_current || 0) + (cert.hot_water_cost_current || 0),
      total_energy_cost_potential: (cert.lighting_cost_potential || 0) + (cert.heating_cost_potential || 0) + (cert.hot_water_cost_potential || 0),
      potential_saving: ((cert.lighting_cost_current || 0) + (cert.heating_cost_current || 0) + (cert.hot_water_cost_current || 0)) -
                       ((cert.lighting_cost_potential || 0) + (cert.heating_cost_potential || 0) + (cert.hot_water_cost_potential || 0)),
      inspection_date: cert.inspection_date,
      certificate_date: cert.certificate_date,
      valid_until: this.calculateValidUntilDate(cert.certificate_date)
    }));

    try {
      await bulkInsert(
        'energy_ratings',
        records,
        'ON CONFLICT (certificate_hash) DO UPDATE SET ' +
        'current_energy_rating = EXCLUDED.current_energy_rating, ' +
        'current_energy_efficiency = EXCLUDED.current_energy_efficiency, ' +
        'updated_at = NOW()'
      );

      // Link EPCs to properties where possible
      await this.linkEPCsToProperties();
    } catch (error) {
      logger.error('Failed to save EPC certificates:', error);
      throw error;
    }
  }

  /**
   * Calculate valid until date (EPCs are valid for 10 years)
   */
  private calculateValidUntilDate(certificateDate: string): Date {
    const date = new Date(certificateDate);
    date.setFullYear(date.getFullYear() + 10);
    return date;
  }

  /**
   * Link EPC certificates to properties in the database
   */
  private async linkEPCsToProperties(): Promise<void> {
    try {
      const result = await query(`
        UPDATE energy_ratings er
        SET property_id = p.id,
            area_id = p.area_id
        FROM properties p
        WHERE er.property_id IS NULL
        AND LOWER(er.address_line_1) = LOWER(p.address_line_1)
        AND er.postcode = p.postcode
      `);

      logger.info(`Linked ${result.rowCount} EPC certificates to properties`);
    } catch (error) {
      logger.error('Failed to link EPCs to properties:', error);
    }
  }

  /**
   * Update area energy statistics
   */
  private async updateAreaEnergyStats(): Promise<void> {
    try {
      await query(`
        WITH area_energy_stats AS (
          SELECT
            area_id,
            COUNT(*) as epc_count,
            AVG(current_energy_efficiency) as avg_efficiency,
            MODE() WITHIN GROUP (ORDER BY current_energy_rating) as most_common_rating,
            AVG(current_co2_emissions) as avg_co2_emissions,
            AVG(total_energy_cost_current) as avg_energy_cost
          FROM energy_ratings
          WHERE area_id IS NOT NULL
          GROUP BY area_id
        )
        UPDATE area_statistics
        SET avg_energy_rating = aes.most_common_rating,
            avg_energy_efficiency = aes.avg_efficiency,
            properties_with_epc = aes.epc_count,
            updated_at = NOW()
        FROM area_energy_stats aes
        WHERE area_statistics.area_id = aes.area_id
      `);

      logger.info('Updated area energy statistics');
    } catch (error) {
      logger.error('Failed to update area energy stats:', error);
    }
  }

  /**
   * Get energy rating summary for an area
   */
  async getAreaEnergyRatingSummary(areaId: number): Promise<any> {
    const result = await query(`
      SELECT
        COUNT(*) as total_properties,
        AVG(current_energy_efficiency) as avg_efficiency,
        COUNT(CASE WHEN current_energy_rating IN ('A', 'B') THEN 1 END) as high_efficiency_count,
        COUNT(CASE WHEN current_energy_rating IN ('F', 'G') THEN 1 END) as low_efficiency_count,
        AVG(current_co2_emissions) as avg_co2_emissions,
        AVG(total_energy_cost_current) as avg_annual_energy_cost,
        SUM(potential_saving) as total_potential_savings
      FROM energy_ratings
      WHERE area_id = $1
      AND certificate_date >= CURRENT_DATE - INTERVAL '10 years'
    `, [areaId]);

    return result.rows[0];
  }

  /**
   * Find properties with poor energy ratings
   */
  async findPoorEnergyProperties(areaId?: number): Promise<any[]> {
    const whereClause = areaId ? 'WHERE er.area_id = $1' : '';
    const params = areaId ? [areaId] : [];

    const result = await query(`
      SELECT
        er.certificate_hash,
        er.address_line_1,
        er.postcode,
        er.current_energy_rating,
        er.current_energy_efficiency,
        er.potential_energy_rating,
        er.potential_saving,
        er.total_energy_cost_current,
        p.current_value as property_value
      FROM energy_ratings er
      LEFT JOIN properties p ON er.property_id = p.id
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} er.current_energy_rating IN ('F', 'G')
      ORDER BY er.current_energy_efficiency ASC
      LIMIT 100
    `, params);

    return result.rows;
  }
}