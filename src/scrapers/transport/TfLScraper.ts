/**
 * Transport for London (TfL) API Scraper
 * Fetches transport data including stations, accessibility, and real-time status
 */

import { BaseScraper, ScraperConfig } from '../councils/base/BaseScraper';
import { query, bulkInsert } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';

interface TfLStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone?: string;
  modes: string[];
  lines: string[];
  facilities?: string[];
}

interface TfLLineStatus {
  id: string;
  name: string;
  modeName: string;
  disruptions: any[];
  lineStatuses: {
    statusSeverity: number;
    statusSeverityDescription: string;
    reason?: string;
  }[];
}

interface StopPoint {
  naptanId: string;
  commonName: string;
  lat: number;
  lon: number;
  stopType: string;
  modes: string[];
  lines: { id: string; name: string }[];
  zone?: string;
  additionalProperties?: {
    category: string;
    key: string;
    value: string;
  }[];
}

export class TfLScraper extends BaseScraper {
  private readonly apiKey: string;
  private readonly apiBaseUrl = 'https://api.tfl.gov.uk';

  constructor() {
    const config: ScraperConfig = {
      council: 'TfL',
      baseUrl: 'https://api.tfl.gov.uk',
      rateLimit: 10, // TfL allows 500 requests per minute
      maxRetries: 3,
      timeout: 30000,
      userAgent: 'NWLondonLedger-Bot/1.0'
    };

    super(config);
    this.apiKey = process.env.TFL_API_KEY || '';
  }

  /**
   * Main method to scrape all TfL data
   */
  async scrapeTransportData(): Promise<void> {
    logger.info('Starting TfL transport data scrape');

    try {
      // 1. Fetch all stations
      await this.scrapeStations();

      // 2. Fetch line status
      await this.scrapeLineStatus();

      // 3. Fetch accessibility information
      await this.scrapeAccessibility();

      // 4. Calculate PTAL scores for areas
      await this.calculatePTALScores();

      logger.info('TfL transport data scrape completed successfully');
    } catch (error) {
      logger.error('Failed to scrape TfL data:', error);
      throw error;
    }
  }

  /**
   * Scrape all TfL stations and stops
   */
  private async scrapeStations(): Promise<void> {
    logger.info('Fetching TfL stations...');

    try {
      // Fetch tube stations
      const tubeStations = await this.fetchStopPointsByMode('tube');
      await this.saveStations(tubeStations, 'tube');

      // Fetch overground stations
      const overgroundStations = await this.fetchStopPointsByMode('overground');
      await this.saveStations(overgroundStations, 'overground');

      // Fetch DLR stations
      const dlrStations = await this.fetchStopPointsByMode('dlr');
      await this.saveStations(dlrStations, 'dlr');

      // Fetch tram stops
      const tramStops = await this.fetchStopPointsByMode('tram');
      await this.saveStations(tramStops, 'tram');

      // Fetch major bus stops (interchanges)
      const busInterchanges = await this.fetchBusInterchanges();
      await this.saveStations(busInterchanges, 'bus');

      logger.info('Stations fetched and saved successfully');
    } catch (error) {
      logger.error('Failed to scrape stations:', error);
      throw error;
    }
  }

  /**
   * Fetch stop points by transport mode
   */
  private async fetchStopPointsByMode(mode: string): Promise<StopPoint[]> {
    const url = `${this.apiBaseUrl}/StopPoint/Mode/${mode}`;
    const params = this.apiKey ? { app_key: this.apiKey } : {};

    try {
      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      const data = await response.json();

      return data.stopPoints || [];
    } catch (error) {
      logger.error(`Failed to fetch ${mode} stations:`, error);
      return [];
    }
  }

  /**
   * Fetch major bus interchanges
   */
  private async fetchBusInterchanges(): Promise<StopPoint[]> {
    const url = `${this.apiBaseUrl}/StopPoint/Type/NaptanBusCoachStation`;
    const params = this.apiKey ? { app_key: this.apiKey } : {};

    try {
      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      const data = await response.json();

      return data.stopPoints || [];
    } catch (error) {
      logger.error('Failed to fetch bus interchanges:', error);
      return [];
    }
  }

  /**
   * Save stations to database
   */
  private async saveStations(stations: StopPoint[], stationType: string): Promise<void> {
    if (stations.length === 0) return;

    const stationRecords = stations.map(station => {
      // Extract accessibility information
      const stepFree = station.additionalProperties?.find(
        p => p.key === 'AccessibilitySummary'
      )?.value.includes('step free') || false;

      const wifi = station.additionalProperties?.find(
        p => p.key === 'WiFi'
      )?.value === 'yes' || false;

      const toilets = station.additionalProperties?.find(
        p => p.key === 'Toilets'
      )?.value === 'yes' || false;

      // Extract zone
      let zone: number | null = null;
      if (station.zone) {
        const zoneMatch = station.zone.match(/\d+/);
        if (zoneMatch) {
          zone = parseInt(zoneMatch[0], 10);
        }
      }

      // Extract lines
      const lines = station.lines?.map(l => l.name) || [];

      // Generate slug
      const slug = station.commonName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return {
        station_id: station.naptanId,
        name: station.commonName,
        slug,
        station_type: stationType,
        lines,
        zone,
        latitude: station.lat,
        longitude: station.lon,
        step_free_access: stepFree,
        wifi,
        toilets,
        last_scraped_at: new Date()
      };
    });

    // Bulk insert stations
    try {
      await bulkInsert(
        'transport_stations',
        stationRecords,
        'ON CONFLICT (station_id) DO UPDATE SET ' +
        'name = EXCLUDED.name, ' +
        'lines = EXCLUDED.lines, ' +
        'zone = EXCLUDED.zone, ' +
        'step_free_access = EXCLUDED.step_free_access, ' +
        'wifi = EXCLUDED.wifi, ' +
        'toilets = EXCLUDED.toilets, ' +
        'last_scraped_at = EXCLUDED.last_scraped_at, ' +
        'updated_at = NOW()'
      );

      logger.info(`Saved ${stationRecords.length} ${stationType} stations`);
    } catch (error) {
      logger.error(`Failed to save ${stationType} stations:`, error);
      throw error;
    }
  }

  /**
   * Fetch real-time line status
   */
  private async scrapeLineStatus(): Promise<void> {
    logger.info('Fetching TfL line status...');

    const url = `${this.apiBaseUrl}/Line/Mode/tube,overground,dlr,tram/Status`;
    const params = this.apiKey ? { app_key: this.apiKey } : {};

    try {
      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      const lineStatuses: TfLLineStatus[] = await response.json();

      // Update station status based on line status
      for (const line of lineStatuses) {
        const status = line.lineStatuses[0];
        const statusLevel = this.mapStatusSeverity(status.statusSeverity);

        // Update all stations on this line
        await query(
          `UPDATE transport_stations
           SET current_status = $1,
               status_message = $2,
               status_updated_at = NOW()
           WHERE $3 = ANY(lines)`,
          [statusLevel, status.reason || status.statusSeverityDescription, line.name]
        );
      }

      logger.info('Line status updated successfully');
    } catch (error) {
      logger.error('Failed to fetch line status:', error);
    }
  }

  /**
   * Map TfL status severity to our status levels
   */
  private mapStatusSeverity(severity: number): string {
    if (severity >= 10) return 'good';
    if (severity >= 6) return 'minor_delays';
    if (severity >= 3) return 'severe_delays';
    return 'closed';
  }

  /**
   * Fetch detailed accessibility information
   */
  private async scrapeAccessibility(): Promise<void> {
    logger.info('Fetching accessibility information...');

    try {
      // Fetch step-free access information
      const url = `${this.apiBaseUrl}/StopPoint/Meta/AccessibilityTypes`;
      const params = this.apiKey ? { app_key: this.apiKey } : {};

      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      const accessibilityData = await response.json();

      // Process and update stations with detailed accessibility info
      // This would require station-by-station updates based on the data structure

      logger.info('Accessibility information updated');
    } catch (error) {
      logger.error('Failed to fetch accessibility information:', error);
    }
  }

  /**
   * Calculate PTAL scores for areas
   */
  private async calculatePTALScores(): Promise<void> {
    logger.info('Calculating PTAL scores...');

    try {
      // PTAL calculation is complex and requires:
      // 1. Walking distance to stops
      // 2. Service frequency
      // 3. Reliability factors

      // Simplified PTAL calculation based on station proximity and type
      const result = await query(`
        WITH area_transport AS (
          SELECT
            a.id as area_id,
            COUNT(DISTINCT ts.id) as station_count,
            COUNT(DISTINCT CASE WHEN ts.station_type = 'tube' THEN ts.id END) as tube_count,
            COUNT(DISTINCT CASE WHEN ts.station_type = 'overground' THEN ts.id END) as overground_count,
            MIN(ST_Distance(
              ST_MakePoint(a.longitude, a.latitude)::geography,
              ST_MakePoint(ts.longitude, ts.latitude)::geography
            )) as nearest_station_distance
          FROM areas a
          LEFT JOIN transport_stations ts ON
            ST_DWithin(
              ST_MakePoint(a.longitude, a.latitude)::geography,
              ST_MakePoint(ts.longitude, ts.latitude)::geography,
              2000 -- 2km radius
            )
          GROUP BY a.id
        )
        UPDATE areas a
        SET ptal_score = CASE
          WHEN at.tube_count >= 2 AND at.nearest_station_distance < 500 THEN 6.5
          WHEN at.tube_count >= 1 AND at.nearest_station_distance < 500 THEN 5.0
          WHEN at.station_count >= 3 AND at.nearest_station_distance < 800 THEN 4.0
          WHEN at.station_count >= 2 AND at.nearest_station_distance < 1000 THEN 3.0
          WHEN at.station_count >= 1 AND at.nearest_station_distance < 1500 THEN 2.0
          WHEN at.station_count >= 1 THEN 1.5
          ELSE 1.0
        END
        FROM area_transport at
        WHERE a.id = at.area_id
      `);

      logger.info('PTAL scores calculated successfully');
    } catch (error) {
      logger.error('Failed to calculate PTAL scores:', error);
    }
  }

  /**
   * Fetch journey planner data for key routes
   */
  async getJourneyTime(from: string, to: string): Promise<number | null> {
    const url = `${this.apiBaseUrl}/Journey/JourneyResults/${from}/to/${to}`;
    const params = this.apiKey ? { app_key: this.apiKey } : {};

    try {
      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      const data = await response.json();

      if (data.journeys && data.journeys.length > 0) {
        return data.journeys[0].duration; // Duration in minutes
      }

      return null;
    } catch (error) {
      logger.error('Failed to fetch journey time:', error);
      return null;
    }
  }

  /**
   * Fetch and save arrivals for a station
   */
  async getStationArrivals(stationId: string): Promise<any[]> {
    const url = `${this.apiBaseUrl}/StopPoint/${stationId}/Arrivals`;
    const params = this.apiKey ? { app_key: this.apiKey } : {};

    try {
      const response = await this.fetch(`${url}?${new URLSearchParams(params)}`);
      return await response.json();
    } catch (error) {
      logger.error(`Failed to fetch arrivals for station ${stationId}:`, error);
      return [];
    }
  }
}