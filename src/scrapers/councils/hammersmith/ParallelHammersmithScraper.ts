/**
 * Parallel version of Hammersmith & Fulham Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelHammersmithScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Hammersmith and Fulham',
      baseUrl: 'https://public-access.lbhf.gov.uk/online-applications',
      rateLimit: 5,
      maxRetries: 3,
      timeout: 30000,
      userAgent: process.env.SCRAPER_USER_AGENT || 'NWLondonLedger-Bot/1.0',
      parallelPages: 10,
      parallelDetails: 5,
      useBurstRateLimit: true,
      burstCapacity: 20
    };

    super(config);
  }

  async scrapePlanningApplications(fromDate: Date): Promise<PlanningApplication[]> {
    return this.scrapePlanningApplicationsParallel(fromDate);
  }

  protected async getTotalPages(fromDate: Date): Promise<number> {
    try {
      const firstPageUrl = this.buildSearchUrl(fromDate, 1);
      const response = await this.fetch(firstPageUrl);
      const html = await response.text();
      const $ = cheerio.load(html);

      // Look for pagination indicators
      const paginationText = $('.pagination, .paging, .searchResults').text();
      const pageMatch = paginationText.match(/Page \d+ of (\d+)/i);

      if (pageMatch) {
        return parseInt(pageMatch[1], 10);
      }

      // Check for result count
      const resultsMatch = paginationText.match(/(\d+) results?/i);
      if (resultsMatch) {
        const totalResults = parseInt(resultsMatch[1], 10);
        return Math.ceil(totalResults / 10); // Assuming 10 results per page
      }

      // Count visible results
      const resultsCount = $('.searchresult, #searchresults tbody tr').length;
      return resultsCount > 0 ? Math.min(50, Math.ceil(resultsCount / 10)) : 0;
    } catch (error) {
      this.log(`Failed to determine total pages: ${error}`, 'error');
      return 10; // Default fallback
    }
  }

  protected async scrapePage(fromDate: Date, pageNumber: number): Promise<PlanningApplication[]> {
    try {
      const url = this.buildSearchUrl(fromDate, pageNumber);
      const response = await this.fetch(url);
      const html = await response.text();

      const applications = this.parseSearchResults(html);
      if (applications.length > 0) {
        this.log(`Page ${pageNumber}: Found ${applications.length} applications`);
      }

      return applications;
    } catch (error) {
      this.log(`Failed to scrape page ${pageNumber}: ${error}`, 'error');
      throw error;
    }
  }

  async scrapePlanningDetails(reference: string): Promise<PlanningApplication | null> {
    this.log(`Scraping details for ${reference}`);

    try {
      const detailUrl = `${this.config.baseUrl}/applicationDetails.do?activeTab=summary&keyVal=${encodeURIComponent(reference)}`;
      const response = await this.fetch(detailUrl);
      const html = await response.text();
      return this.parsePlanningApplication(html, reference);
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  private parsePlanningApplication(html: string, reference: string): PlanningApplication | null {
    try {
      const $ = cheerio.load(html);

      // Extract key information
      const address = this.extractText($, '#address, .address, td:contains("Site Address") + td');
      const proposal = this.extractText($, '#proposal, .proposal, td:contains("Proposal") + td');
      const status = this.extractText($, '#status, .status, td:contains("Status") + td');

      // Extract dates
      const receivedDate = this.extractDate($, 'td:contains("Received") + td, #receivedDate');
      const validatedDate = this.extractDate($, 'td:contains("Validated") + td, #validDate');
      const decisionDate = this.extractDate($, 'td:contains("Decision") + td, #decisionDate');

      // Extract additional details
      const caseOfficer = this.extractText($, 'td:contains("Case Officer") + td, #officer');
      const ward = this.extractText($, 'td:contains("Ward") + td, #ward');
      const applicationType = this.extractText($, 'td:contains("Application Type") + td');

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Hammersmith and Fulham',
        receivedDate,
        validatedDate,
        decisionDate,
        caseOfficer,
        ward,
        applicationType,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `${this.config.baseUrl}/applicationDetails.do?activeTab=summary&keyVal=${encodeURIComponent(reference)}`,
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

    // Try multiple selectors for different council website structures
    $('.searchresult, #searchresults tbody tr, .resultsTable tr').each((_, element) => {
      try {
        const $elem = $(element);

        // Skip header rows
        if ($elem.find('th').length > 0 || $elem.hasClass('header')) return;

        // Find the application reference link
        const $link = $elem.find('a[href*="applicationDetails"], a[href*="keyVal"]').first();
        const reference = $link.text().trim();

        if (!reference || reference.length < 5) return;

        // Extract href to get the key value
        const href = $link.attr('href');
        const keyValMatch = href?.match(/keyVal=([^&]+)/);
        const keyVal = keyValMatch ? keyValMatch[1] : reference;

        // Extract other fields
        const cells = $elem.find('td');
        const address = this.extractCellText($, cells, 1) || this.extractText($, $elem.find('.address'));
        const proposal = this.extractCellText($, cells, 2) || this.extractText($, $elem.find('.description, .proposal'));
        const status = this.extractCellText($, cells, 3) || this.extractText($, $elem.find('.status'));
        const dateText = this.extractCellText($, cells, 4) || this.extractText($, $elem.find('.date'));

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Hammersmith and Fulham',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/applicationDetails.do?activeTab=summary&keyVal=${encodeURIComponent(keyVal)}`,
        };

        if (dateText) {
          const date = new Date(dateText);
          if (!isNaN(date.getTime())) {
            application.receivedDate = date;
          }
        }

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result`, 'error');
      }
    });

    return applications;
  }

  private buildSearchUrl(fromDate: Date, page: number): string {
    const dateStr = fromDate.toISOString().split('T')[0];

    // Common URL patterns for council planning portals
    const params = new URLSearchParams({
      'searchType': 'Application',
      'searchCriteria.page': page.toString(),
      'searchCriteria.resultsPerPage': '10',
      'action': 'firstPage',
      'dateType': 'DC_Validated',
      'dateFrom': dateStr,
      'dateTo': new Date().toISOString().split('T')[0]
    });

    return `${this.config.baseUrl}/search.do?${params.toString()}`;
  }

  private extractText($: cheerio.CheerioAPI, selector: cheerio.Cheerio | string): string {
    if (typeof selector === 'string') {
      return $(selector).first().text().trim();
    }
    return selector.text().trim();
  }

  private extractCellText($: cheerio.CheerioAPI, cells: cheerio.Cheerio, index: number): string {
    return cells.eq(index).text().trim();
  }

  private extractDate($: cheerio.CheerioAPI, selector: string): Date | undefined {
    const text = this.extractText($, selector);
    if (!text) return undefined;

    // Handle various date formats
    const date = new Date(text);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeStatus(status: string): string {
    const normalized = status.toLowerCase().trim();

    if (normalized.includes('pending') || normalized.includes('submitted') || normalized.includes('awaiting')) {
      return 'pending';
    } else if (normalized.includes('approve') || normalized.includes('granted') || normalized.includes('permitted')) {
      return 'approved';
    } else if (normalized.includes('refuse') || normalized.includes('reject') || normalized.includes('denied')) {
      return 'refused';
    } else if (normalized.includes('withdrawn')) {
      return 'withdrawn';
    } else if (normalized.includes('invalid')) {
      return 'invalid';
    } else if (normalized.includes('appeal')) {
      return 'appeal';
    }

    return status;
  }
}