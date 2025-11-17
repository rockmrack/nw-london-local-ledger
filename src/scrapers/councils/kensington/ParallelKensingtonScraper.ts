/**
 * Parallel version of Kensington & Chelsea Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelKensingtonScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Kensington and Chelsea',
      baseUrl: 'https://www.rbkc.gov.uk/planning',
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
      // RBKC uses a different system - we'll need to query their planning database
      const searchUrl = 'https://www.rbkc.gov.uk/planning/searches/default.aspx';
      const response = await this.fetch(searchUrl);
      const html = await response.text();
      const $ = cheerio.load(html);

      // Look for pagination or result count
      const resultsText = $('.results-summary, .search-results-count').text();
      const resultsMatch = resultsText.match(/(\d+)\s+results?/i);

      if (resultsMatch) {
        const totalResults = parseInt(resultsMatch[1], 10);
        return Math.min(100, Math.ceil(totalResults / 20)); // Cap at 100 pages, 20 results per page
      }

      // Default to checking first 20 pages
      return 20;
    } catch (error) {
      this.log(`Failed to determine total pages: ${error}`, 'error');
      return 10;
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
      // RBKC uses a different URL pattern
      const detailUrl = `https://www.rbkc.gov.uk/planning/details.aspx?id=${encodeURIComponent(reference)}`;
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

      // RBKC specific selectors
      const address = this.extractText($, '.property-address, .site-address, dt:contains("Site Address") + dd');
      const proposal = this.extractText($, '.proposal-description, dt:contains("Proposal") + dd');
      const status = this.extractText($, '.application-status, dt:contains("Status") + dd');

      // Extract dates using various selectors
      const receivedDate = this.extractDate($, 'dt:contains("Received") + dd, .date-received');
      const validatedDate = this.extractDate($, 'dt:contains("Valid") + dd, .date-validated');
      const decisionDate = this.extractDate($, 'dt:contains("Decision") + dd, .decision-date');

      // Additional information
      const caseOfficer = this.extractText($, 'dt:contains("Case Officer") + dd, .case-officer');
      const ward = this.extractText($, 'dt:contains("Ward") + dd, .ward');
      const applicationType = this.extractText($, 'dt:contains("Type") + dd, .application-type');
      const consultationEndDate = this.extractDate($, 'dt:contains("Consultation") + dd, .consultation-end');

      // Extract postcode from address if possible
      const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        postcode,
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Kensington and Chelsea',
        receivedDate,
        validatedDate,
        decisionDate,
        consultationEndDate,
        caseOfficer,
        ward,
        applicationType,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `https://www.rbkc.gov.uk/planning/details.aspx?id=${encodeURIComponent(reference)}`,
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

    // RBKC specific search result selectors
    $('.planning-result, .search-result-item, .application-item').each((_, element) => {
      try {
        const $elem = $(element);

        // Extract reference number
        const $refLink = $elem.find('a[href*="details.aspx"], .reference-link').first();
        const reference = $refLink.text().trim() || $elem.find('.reference, .app-ref').text().trim();

        if (!reference || reference.length < 5) return;

        // Extract application details
        const address = this.extractText($, $elem.find('.address, .site-address'));
        const proposal = this.extractText($, $elem.find('.description, .proposal'));
        const status = this.extractText($, $elem.find('.status, .app-status'));
        const dateSubmitted = this.extractText($, $elem.find('.date, .submitted-date'));

        // Extract postcode if available
        const postcodeMatch = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
        const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          postcode,
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Kensington and Chelsea',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `https://www.rbkc.gov.uk/planning/details.aspx?id=${encodeURIComponent(reference)}`,
        };

        if (dateSubmitted) {
          const date = new Date(dateSubmitted);
          if (!isNaN(date.getTime())) {
            application.receivedDate = date;
          }
        }

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result`, 'error');
      }
    });

    // Alternative parsing for table format
    if (applications.length === 0) {
      $('table.results tbody tr, .planning-table tr').each((_, element) => {
        try {
          const $row = $(element);
          if ($row.find('th').length > 0) return;

          const cells = $row.find('td');
          if (cells.length < 3) return;

          const reference = this.extractCellText($, cells, 0);
          const address = this.extractCellText($, cells, 1);
          const proposal = this.extractCellText($, cells, 2);
          const status = this.extractCellText($, cells, 3);
          const dateText = this.extractCellText($, cells, 4);

          if (!reference || reference.length < 5) return;

          const application: Partial<PlanningApplication> = {
            reference,
            address: address || 'Unknown Address',
            proposal: proposal || '',
            status: this.normalizeStatus(status),
            council: 'Kensington and Chelsea',
            slug: slugifyPlanningReference(reference),
            sourceUrl: `https://www.rbkc.gov.uk/planning/details.aspx?id=${encodeURIComponent(reference)}`,
          };

          if (dateText) {
            const date = new Date(dateText);
            if (!isNaN(date.getTime())) {
              application.receivedDate = date;
            }
          }

          applications.push(application as PlanningApplication);
        } catch (error) {
          this.log(`Failed to parse table row`, 'error');
        }
      });
    }

    return applications;
  }

  private buildSearchUrl(fromDate: Date, page: number): string {
    const dateStr = fromDate.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    // RBKC specific search URL
    const params = new URLSearchParams({
      'tab': 'search',
      'type': 'advanced',
      'date_from': dateStr,
      'date_to': toDate,
      'page': page.toString(),
      'per_page': '20',
      'sort': 'date_desc'
    });

    return `https://www.rbkc.gov.uk/planning/searches/results.aspx?${params.toString()}`;
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

    // Handle UK date format (DD/MM/YYYY)
    const ukDateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ukDateMatch) {
      const [_, day, month, year] = ukDateMatch;
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }

    // Try standard date parsing
    const date = new Date(text);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeStatus(status: string): string {
    const normalized = status.toLowerCase().trim();

    if (normalized.includes('pending') || normalized.includes('submitted') || normalized.includes('registered')) {
      return 'pending';
    } else if (normalized.includes('grant') || normalized.includes('approve') || normalized.includes('consent')) {
      return 'approved';
    } else if (normalized.includes('refuse') || normalized.includes('reject')) {
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