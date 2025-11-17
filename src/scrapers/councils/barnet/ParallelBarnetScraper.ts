/**
 * Parallel version of Barnet Council Planning Portal Scraper
 * Implements parallel page processing for improved performance
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelBarnetScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Barnet',
      baseUrl: 'https://publicaccess.barnet.gov.uk/online-applications',
      rateLimit: 5, // Increased from 1 to 5 requests per second
      maxRetries: 3,
      timeout: 30000,
      userAgent: process.env.SCRAPER_USER_AGENT || 'NWLondonLedger-Bot/1.0',
      parallelPages: 10, // Process 10 pages in parallel
      parallelDetails: 5, // Process 5 detail pages in parallel
      useBurstRateLimit: true,
      burstCapacity: 20 // Allow burst up to 20 requests
    };

    super(config);
  }

  /**
   * Main entry point - uses parallel processing
   */
  async scrapePlanningApplications(fromDate: Date): Promise<PlanningApplication[]> {
    return this.scrapePlanningApplicationsParallel(fromDate);
  }

  /**
   * Get the total number of pages to scrape
   */
  protected async getTotalPages(fromDate: Date): Promise<number> {
    try {
      const firstPageUrl = this.buildSearchUrl(fromDate, 1);
      const html = await this.fetchPage(firstPageUrl);

      if (!html) return 0;

      const $ = cheerio.load(html);

      // Try to find pagination info
      const paginationText = $('.paging, .pagination').text();
      const pageMatch = paginationText.match(/Page \d+ of (\d+)/i);

      if (pageMatch) {
        return parseInt(pageMatch[1], 10);
      }

      // Fallback: Check if there are results and estimate
      const resultsCount = $('#searchresults tr, .searchresults tr').length;
      if (resultsCount > 0) {
        // If we can't determine exact pages, use a reasonable maximum
        return Math.min(50, Math.ceil(resultsCount / 10));
      }

      return 0;
    } catch (error) {
      this.log(`Failed to determine total pages: ${error}`, 'error');
      return 10; // Fallback to a reasonable default
    }
  }

  /**
   * Scrape a single page
   */
  protected async scrapePage(fromDate: Date, pageNumber: number): Promise<PlanningApplication[]> {
    try {
      const url = this.buildSearchUrl(fromDate, pageNumber);
      const html = await this.fetchPage(url);

      if (!html) {
        return [];
      }

      const applications = this.parseSearchResults(html);

      if (applications.length > 0) {
        this.log(`Page ${pageNumber}: Found ${applications.length} applications`);
      }

      return applications;
    } catch (error) {
      this.log(`Failed to scrape page ${pageNumber}: ${error}`, 'error');
      throw error; // Let the retry mechanism handle it
    }
  }

  /**
   * Fetch a page with error handling
   */
  private async fetchPage(url: string): Promise<string | null> {
    try {
      const response = await this.fetch(url);
      return await response.text();
    } catch (error) {
      this.log(`Failed to fetch ${url}: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Scrape details for a specific planning application
   */
  async scrapePlanningDetails(reference: string): Promise<PlanningApplication | null> {
    this.log(`Scraping details for ${reference}`);

    try {
      const detailUrl = `${this.config.baseUrl}/applicationDetails.do?keyVal=${encodeURIComponent(reference)}&activeTab=summary`;
      const html = await this.fetchPage(detailUrl);
      if (!html) return null;

      return this.parsePlanningApplication(html);
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  private parsePlanningApplication(html: string): PlanningApplication | null {
    try {
      const $ = cheerio.load(html);

      const reference = this.extractText($, '#caseNumber');
      if (!reference) return null;

      const address = this.extractText($, '.address, #address');
      const proposal = this.extractText($, '#proposal');
      const status = this.extractText($, '#caseStatus');
      const receivedDate = this.extractDate($, '#dateReceived');
      const validatedDate = this.extractDate($, '#dateValid');
      const decisionDate = this.extractDate($, '#dateDecision');
      const caseOfficer = this.extractText($, '#caseOfficer');
      const ward = this.extractText($, '#ward');

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Barnet',
        receivedDate,
        validatedDate,
        decisionDate,
        caseOfficer,
        ward,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `${this.config.baseUrl}/applicationDetails.do?keyVal=${encodeURIComponent(reference)}`,
      };

      return application as PlanningApplication;
    } catch (error) {
      this.log(`Failed to parse planning application`, 'error');
      return null;
    }
  }

  private parseSearchResults(html: string): PlanningApplication[] {
    const applications: PlanningApplication[] = [];
    const $ = cheerio.load(html);

    $('#searchresults tr, .searchresults tr').each((_, element) => {
      try {
        const $row = $(element);
        if ($row.find('th').length > 0) return;

        const $link = $row.find('a[href*="applicationDetails"]').first();
        const reference = $link.text().trim();
        if (!reference || reference.length < 5) return;

        const address = this.extractText($, $row.find('td').eq(1));
        const proposal = this.extractText($, $row.find('td').eq(2));
        const status = this.extractText($, $row.find('td').eq(3));

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Barnet',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/applicationDetails.do?keyVal=${encodeURIComponent(reference)}`,
        };

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result row`, 'error');
      }
    });

    return applications;
  }

  private buildSearchUrl(fromDate: Date, page: number): string {
    const dateStr = fromDate.toISOString().split('T')[0];
    return `${this.config.baseUrl}/search.do?action=advanced&dateFrom=${dateStr}&page=${page}`;
  }

  private extractText($: cheerio.CheerioAPI, selector: cheerio.Cheerio | string): string {
    if (typeof selector === 'string') {
      return $(selector).first().text().trim();
    }
    return selector.text().trim();
  }

  private extractDate($: cheerio.CheerioAPI, selector: string): Date | undefined {
    const text = this.extractText($, selector);
    if (!text) return undefined;

    const date = new Date(text);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeStatus(status: string): string {
    const normalized = status.toLowerCase().trim();

    if (normalized.includes('pending') || normalized.includes('submitted')) {
      return 'pending';
    } else if (normalized.includes('approve') || normalized.includes('granted') || normalized.includes('permitted')) {
      return 'approved';
    } else if (normalized.includes('refuse') || normalized.includes('reject')) {
      return 'refused';
    } else if (normalized.includes('withdrawn')) {
      return 'withdrawn';
    } else if (normalized.includes('invalid')) {
      return 'invalid';
    }

    return status;
  }
}