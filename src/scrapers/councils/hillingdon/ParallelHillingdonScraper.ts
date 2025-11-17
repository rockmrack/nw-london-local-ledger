/**
 * Parallel version of Hillingdon Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelHillingdonScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Hillingdon',
      baseUrl: 'https://planning.hillingdon.gov.uk/OcellaWeb',
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

      // Look for pagination in Hillingdon's Ocella system
      const paginationText = $('.pagination-info, .results-info').text();
      const totalMatch = paginationText.match(/of\s+(\d+)\s+results?/i);

      if (totalMatch) {
        const totalResults = parseInt(totalMatch[1], 10);
        return Math.min(50, Math.ceil(totalResults / 25)); // 25 results per page, cap at 50 pages
      }

      // Check page links
      const lastPageLink = $('.pagination a:last-child, .pager a:last-child').attr('href');
      if (lastPageLink) {
        const pageMatch = lastPageLink.match(/page=(\d+)/);
        if (pageMatch) {
          return parseInt(pageMatch[1], 10);
        }
      }

      // Count current page results
      const resultsCount = $('.result-item, .planning-app-row').length;
      return resultsCount > 0 ? Math.min(30, Math.ceil(resultsCount / 25)) : 0;
    } catch (error) {
      this.log(`Failed to determine total pages: ${error}`, 'error');
      return 15; // Default for Hillingdon
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
      // Hillingdon Ocella system URL pattern
      const detailUrl = `${this.config.baseUrl}/planningDetails?reference=${encodeURIComponent(reference)}`;
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

      // Hillingdon specific selectors for Ocella system
      const address = this.extractText($, '.property-address, .location-details, label:contains("Location") + .value');
      const proposal = this.extractText($, '.proposal-text, label:contains("Proposal") + .value');
      const status = this.extractText($, '.status-badge, label:contains("Status") + .value');

      // Extract dates
      const receivedDate = this.extractDate($, 'label:contains("Received") + .value, .received-date');
      const validatedDate = this.extractDate($, 'label:contains("Valid") + .value, .validated-date');
      const decisionDate = this.extractDate($, 'label:contains("Decision") + .value, .decision-date');
      const targetDate = this.extractDate($, 'label:contains("Target") + .value, .target-date');

      // Extract additional details
      const caseOfficer = this.extractText($, 'label:contains("Officer") + .value, .case-officer');
      const ward = this.extractText($, 'label:contains("Ward") + .value, .ward-name');
      const applicationType = this.extractText($, 'label:contains("Application Type") + .value');
      const decision = this.extractText($, 'label:contains("Decision") + .value, .decision-text');

      // Extract postcode (UB postcodes for Hillingdon)
      const postcodeMatch = address.match(/\b(UB\d{1,2}\s*\d[A-Z]{2})\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

      // Development type inference
      const developmentType = this.inferDevelopmentType(proposal);

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        postcode,
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Hillingdon',
        receivedDate,
        validatedDate,
        decisionDate,
        decision,
        caseOfficer,
        ward,
        applicationType,
        developmentType,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `${this.config.baseUrl}/planningDetails?reference=${encodeURIComponent(reference)}`,
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

    // Hillingdon Ocella system result selectors
    $('.planning-application, .result-item, .application-summary').each((_, element) => {
      try {
        const $elem = $(element);

        // Extract reference
        const $refLink = $elem.find('a[href*="reference="], .reference-link').first();
        const reference = $refLink.text().trim() || $elem.find('.ref-number').text().trim();

        if (!reference || reference.length < 5) return;

        // Extract details
        const address = this.extractText($, $elem.find('.address, .location'));
        const proposal = this.extractText($, $elem.find('.proposal, .description'));
        const status = this.extractText($, $elem.find('.status, .app-status'));
        const dateSubmitted = this.extractText($, $elem.find('.date, .submitted'));

        // Extract postcode (UB postcodes)
        const postcodeMatch = address.match(/\b(UB\d{1,2}\s*\d[A-Z]{2})\b/i);
        const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          postcode,
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Hillingdon',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/planningDetails?reference=${encodeURIComponent(reference)}`,
        };

        if (dateSubmitted) {
          const date = this.parseDate(dateSubmitted);
          if (date) {
            application.receivedDate = date;
          }
        }

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result`, 'error');
      }
    });

    // Alternative table format parsing
    if (applications.length === 0) {
      $('table.results tbody tr').each((_, element) => {
        try {
          const $row = $(element);
          if ($row.find('th').length > 0) return;

          const cells = $row.find('td');
          if (cells.length < 4) return;

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
            council: 'Hillingdon',
            slug: slugifyPlanningReference(reference),
            sourceUrl: `${this.config.baseUrl}/planningDetails?reference=${encodeURIComponent(reference)}`,
          };

          if (dateText) {
            const date = this.parseDate(dateText);
            if (date) {
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

    // Hillingdon Ocella search parameters
    const params = new URLSearchParams({
      'searchType': 'planning',
      'dateFrom': dateStr,
      'dateTo': toDate,
      'page': page.toString(),
      'pageSize': '25',
      'sortBy': 'DateReceived',
      'sortOrder': 'desc'
    });

    return `${this.config.baseUrl}/planningSearch?${params.toString()}`;
  }

  private extractText($: cheerio.CheerioAPI, selector: cheerio.Cheerio | string): string {
    if (typeof selector === 'string') {
      const elements = selector.split(',').map(s => s.trim());
      for (const elem of elements) {
        const text = $(elem).first().text().trim();
        if (text) return text;
      }
      return '';
    }
    return selector.text().trim();
  }

  private extractCellText($: cheerio.CheerioAPI, cells: cheerio.Cheerio, index: number): string {
    return cells.eq(index).text().trim();
  }

  private extractDate($: cheerio.CheerioAPI, selector: string): Date | undefined {
    const text = this.extractText($, selector);
    return this.parseDate(text);
  }

  private parseDate(text: string): Date | undefined {
    if (!text) return undefined;

    // Handle UK date format (DD/MM/YYYY or DD-MM-YYYY)
    const ukDateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
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

    if (normalized.includes('pending') || normalized.includes('awaiting') || normalized.includes('under consideration')) {
      return 'pending';
    } else if (normalized.includes('approve') || normalized.includes('permit') || normalized.includes('grant')) {
      return 'approved';
    } else if (normalized.includes('refuse') || normalized.includes('reject') || normalized.includes('decline')) {
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

  private inferDevelopmentType(proposal: string): string {
    const proposalLower = proposal.toLowerCase();

    if (proposalLower.includes('extension')) {
      return 'extension';
    } else if (proposalLower.includes('loft') || proposalLower.includes('roof')) {
      return 'loft_conversion';
    } else if (proposalLower.includes('basement') || proposalLower.includes('cellar')) {
      return 'basement';
    } else if (proposalLower.includes('new dwelling') || proposalLower.includes('new build')) {
      return 'new_build';
    } else if (proposalLower.includes('change of use')) {
      return 'change_of_use';
    } else if (proposalLower.includes('demolit')) {
      return 'demolition';
    } else if (proposalLower.includes('tree') || proposalLower.includes('fell')) {
      return 'tree_work';
    }

    return 'other';
  }
}