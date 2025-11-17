/**
 * Parallel version of Ealing Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { ParallelBaseScraper, ParallelScraperConfig } from '../base/ParallelBaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class ParallelEalingScraper extends ParallelBaseScraper {
  constructor() {
    const config: ParallelScraperConfig = {
      council: 'Ealing',
      baseUrl: 'https://pam.ealing.gov.uk',
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

      const paginationText = $('.pagination, .pager').text();
      const pageMatch = paginationText.match(/Page \d+ of (\d+)/i);

      if (pageMatch) {
        return parseInt(pageMatch[1], 10);
      }

      const resultsCount = $('.result-item, .planning-app').length;
      return resultsCount > 0 ? Math.min(50, Math.ceil(resultsCount / 15)) : 0;
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
      const detailUrl = `${this.config.baseUrl}/application/${encodeURIComponent(reference)}`;
      const response = await this.fetch(detailUrl);
      const html = await response.text();
      return this.parsePlanningApplication(html);
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  private parsePlanningApplication(html: string): PlanningApplication | null {
    try {
      const $ = cheerio.load(html);

      const reference = this.extractText($, '.app-reference, #reference');
      if (!reference) return null;

      const address = this.extractText($, '.app-address, #site-address');
      const proposal = this.extractText($, '.app-proposal, #proposal');
      const status = this.extractText($, '.app-status, #status');
      const receivedDate = this.extractDate($, '.date-received');
      const validatedDate = this.extractDate($, '.date-validated');
      const decisionDate = this.extractDate($, '.date-decision');
      const caseOfficer = this.extractText($, '.case-officer');
      const ward = this.extractText($, '.ward-name');

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Ealing',
        receivedDate,
        validatedDate,
        decisionDate,
        caseOfficer,
        ward,
        slug: slugifyPlanningReference(reference),
        sourceUrl: `${this.config.baseUrl}/application/${encodeURIComponent(reference)}`,
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

    $('.result-item, .planning-app').each((_, element) => {
      try {
        const $elem = $(element);

        const $link = $elem.find('a[href*="/application/"]').first();
        const reference = this.extractText($, $link) || this.extractText($, $elem.find('.ref'));
        if (!reference || reference.length < 5) return;

        const address = this.extractText($, $elem.find('.address'));
        const proposal = this.extractText($, $elem.find('.proposal'));
        const status = this.extractText($, $elem.find('.status'));

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Ealing',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/application/${encodeURIComponent(reference)}`,
        };

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result`, 'error');
      }
    });

    return applications;
  }

  private buildSearchUrl(fromDate: Date, page: number): string {
    const dateStr = fromDate.toISOString().split('T')[0];
    return `${this.config.baseUrl}/search?submitted_after=${dateStr}&page=${page}`;
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
    } else if (normalized.includes('approve') || normalized.includes('granted')) {
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