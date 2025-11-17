/**
 * Parallel version of Hounslow Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelHounslowScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Hounslow',
      baseUrl: 'https://planning.hounslow.gov.uk/planning',
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

      // Look for pagination elements
      const paginationText = $('.page-info, .pagination-summary, .results-count').text();

      // Try to extract total results
      const totalMatch = paginationText.match(/(\d+)\s+(?:results?|applications?)/i);
      if (totalMatch) {
        const totalResults = parseInt(totalMatch[1], 10);
        return Math.min(40, Math.ceil(totalResults / 15)); // 15 results per page, cap at 40 pages
      }

      // Check for page navigation
      const pageLinks = $('.pagination a, .pager a');
      const lastPageNum = pageLinks
        .map((_, el) => {
          const text = $(el).text();
          const pageNum = parseInt(text, 10);
          return isNaN(pageNum) ? 0 : pageNum;
        })
        .get()
        .reduce((max, num) => Math.max(max, num), 0);

      if (lastPageNum > 0) {
        return lastPageNum;
      }

      // Default for Hounslow
      const resultsCount = $('.application-item, .search-result').length;
      return resultsCount > 0 ? Math.min(25, Math.ceil(resultsCount / 15)) : 0;
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
      // Hounslow planning system URL
      const detailUrl = `${this.config.baseUrl}/application/details/${encodeURIComponent(reference)}`;
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

      // Hounslow specific selectors
      const address = this.extractText($, '.site-address, .property-details, dt:contains("Site Address") + dd');
      const proposal = this.extractText($, '.development-description, dt:contains("Development") + dd');
      const status = this.extractText($, '.app-status, .status-label, dt:contains("Status") + dd');

      // Extract dates
      const receivedDate = this.extractDate($, 'dt:contains("Received") + dd, .date-received');
      const validatedDate = this.extractDate($, 'dt:contains("Validated") + dd, .date-validated');
      const decisionDate = this.extractDate($, 'dt:contains("Decision") + dd, .date-decided');
      const targetDate = this.extractDate($, 'dt:contains("Target") + dd, .target-date');

      // Extract additional details
      const caseOfficer = this.extractText($, 'dt:contains("Case Officer") + dd, .officer-name');
      const ward = this.extractText($, 'dt:contains("Ward") + dd, .ward');
      const applicationType = this.extractText($, 'dt:contains("Type") + dd, .app-type');
      const decision = this.extractText($, 'dt:contains("Decision") + dd, .decision');
      const applicant = this.extractText($, 'dt:contains("Applicant") + dd, .applicant-name');

      // Consultation details
      const consultationStartDate = this.extractDate($, 'dt:contains("Consultation Start") + dd');
      const consultationEndDate = this.extractDate($, 'dt:contains("Consultation End") + dd');

      // Extract postcode (TW postcodes for Hounslow)
      const postcodeMatch = address.match(/\b(TW\d{1,2}\s*\d[A-Z]{2})\b/i);
      const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

      // Infer development type
      const developmentType = this.inferDevelopmentType(proposal);

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        postcode,
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Hounslow',
        receivedDate,
        validatedDate,
        decisionDate,
        decision,
        caseOfficer,
        ward,
        applicationType,
        developmentType,
        consultationStartDate,
        consultationEndDate,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `${this.config.baseUrl}/application/details/${encodeURIComponent(reference)}`,
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

    // Hounslow search result selectors
    $('.search-result, .application-summary, .planning-item').each((_, element) => {
      try {
        const $elem = $(element);

        // Extract reference
        const $refLink = $elem.find('a[href*="/application/"], .ref-link').first();
        const reference = $refLink.text().trim() || $elem.find('.reference').text().trim();

        if (!reference || reference.length < 5) return;

        // Extract details
        const address = this.extractText($, $elem.find('.address, .site-location'));
        const proposal = this.extractText($, $elem.find('.description, .proposal-text'));
        const status = this.extractText($, $elem.find('.status, .app-status'));
        const dateSubmitted = this.extractText($, $elem.find('.submitted-date, .date'));

        // Extract postcode
        const postcodeMatch = address.match(/\b(TW\d{1,2}\s*\d[A-Z]{2})\b/i);
        const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          postcode,
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Hounslow',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/application/details/${encodeURIComponent(reference)}`,
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

    // Alternative parsing for table format
    if (applications.length === 0) {
      $('table.results tbody tr, .applications-table tr').each((_, element) => {
        try {
          const $row = $(element);

          // Skip header rows
          if ($row.find('th').length > 0 || $row.hasClass('header')) return;

          const cells = $row.find('td');
          if (cells.length < 3) return;

          const reference = this.extractCellText($, cells, 0);
          const address = this.extractCellText($, cells, 1);
          const proposal = this.extractCellText($, cells, 2);
          const status = this.extractCellText($, cells, 3);
          const dateText = this.extractCellText($, cells, 4);

          if (!reference || reference.length < 5) return;

          // Extract postcode
          const postcodeMatch = address.match(/\b(TW\d{1,2}\s*\d[A-Z]{2})\b/i);
          const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : undefined;

          const application: Partial<PlanningApplication> = {
            reference,
            address: address || 'Unknown Address',
            postcode,
            proposal: proposal || '',
            status: this.normalizeStatus(status),
            council: 'Hounslow',
            slug: slugifyPlanningReference(reference),
            sourceUrl: `${this.config.baseUrl}/application/details/${encodeURIComponent(reference)}`,
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

    // Hounslow search parameters
    const params = new URLSearchParams({
      'search_type': 'applications',
      'date_type': 'received',
      'date_from': dateStr,
      'date_to': toDate,
      'status': 'all',
      'page': page.toString(),
      'per_page': '15',
      'sort': 'date_desc'
    });

    return `${this.config.baseUrl}/search?${params.toString()}`;
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

    // Handle UK date format (DD/MM/YYYY or DD-MM-YYYY or DD MMM YYYY)
    const ukDateMatch = text.match(/(\d{1,2})[\/\-\s](\d{1,2}|[A-Za-z]{3})[\/\-\s](\d{4})/);
    if (ukDateMatch) {
      const [_, day, monthPart, year] = ukDateMatch;

      // Check if month is numeric or text
      let month: string;
      if (/^\d+$/.test(monthPart)) {
        month = monthPart.padStart(2, '0');
      } else {
        // Convert month name to number
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = monthNames.findIndex(m => monthPart.toLowerCase().startsWith(m));
        if (monthIndex === -1) return undefined;
        month = (monthIndex + 1).toString().padStart(2, '0');
      }

      return new Date(`${year}-${month}-${day.padStart(2, '0')}`);
    }

    // Try standard date parsing
    const date = new Date(text);
    return isNaN(date.getTime()) ? undefined : date;
  }

  private normalizeStatus(status: string): string {
    const normalized = status.toLowerCase().trim();

    if (normalized.includes('pending') || normalized.includes('submitted') || normalized.includes('received')) {
      return 'pending';
    } else if (normalized.includes('approve') || normalized.includes('grant') || normalized.includes('permit')) {
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

  private inferDevelopmentType(proposal: string): string {
    const proposalLower = proposal.toLowerCase();

    if (proposalLower.includes('extension')) {
      return 'extension';
    } else if (proposalLower.includes('loft') || proposalLower.includes('dormer')) {
      return 'loft_conversion';
    } else if (proposalLower.includes('basement') || proposalLower.includes('excavation')) {
      return 'basement';
    } else if (proposalLower.includes('new dwelling') || proposalLower.includes('new house') || proposalLower.includes('erection of')) {
      return 'new_build';
    } else if (proposalLower.includes('change of use') || proposalLower.includes('conversion')) {
      return 'change_of_use';
    } else if (proposalLower.includes('demolit')) {
      return 'demolition';
    } else if (proposalLower.includes('tree') || proposalLower.includes('fell') || proposalLower.includes('pruning')) {
      return 'tree_work';
    }

    return 'other';
  }
}