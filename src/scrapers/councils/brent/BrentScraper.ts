/**
 * Brent Council Planning Portal Scraper
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScraperConfig } from '../base/BaseScraper';
import type { PlanningApplication } from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class BrentScraper extends BaseScraper {
  constructor() {
    const config: ScraperConfig = {
      council: 'Brent',
      baseUrl: 'https://pa.brent.gov.uk/online-applications',
      rateLimit: 1,
      maxRetries: 3,
      timeout: 30000,
      userAgent: process.env.SCRAPER_USER_AGENT || 'NWLondonLedger-Bot/1.0',
    };

    super(config);
  }

  async scrapePlanningApplications(fromDate: Date): Promise<PlanningApplication[]> {
    if (!this.validateConfig()) {
      throw new Error('Invalid scraper configuration');
    }

    this.log(`Starting scrape from ${fromDate.toISOString()}`);

    try {
      const applications: PlanningApplication[] = [];
      let page = 1;
      const maxPages = 50;

      while (page <= maxPages) {
        this.log(`Scraping page ${page}`);

        const searchUrl = this.buildSearchUrl(fromDate, page);
        const html = await this.fetchPage(searchUrl);
        if (!html) break;

        const pageApplications = this.parseSearchResults(html);

        if (pageApplications.length === 0) {
          this.log(`No more results found on page ${page}`);
          break;
        }

        applications.push(...pageApplications);
        this.log(`Found ${pageApplications.length} applications on page ${page}`);

        const $ = cheerio.load(html);
        const hasNextPage = $('.next a, a.next').length > 0;

        if (!hasNextPage) break;

        page++;
        await this.delay(1000);
      }

      this.log(`Scraped ${applications.length} applications total`);
      return applications;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

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

      const reference = this.extractText($, '#simpleDetailsTable td:contains("Reference") + td');
      if (!reference) return null;

      const address = this.extractText($, '#simpleDetailsTable td:contains("Address") + td');
      const proposal = this.extractText($, '#simpleDetailsTable td:contains("Proposal") + td');
      const status = this.extractText($, '#simpleDetailsTable td:contains("Status") + td');
      const receivedDateText = this.extractText($, '#simpleDetailsTable td:contains("Received") + td');
      const decisionDateText = this.extractText($, '#simpleDetailsTable td:contains("Decision") + td');
      const ward = this.extractText($, '#simpleDetailsTable td:contains("Ward") + td');

      const application: Partial<PlanningApplication> = {
        reference,
        address: address || 'Unknown Address',
        proposal: proposal || '',
        status: this.normalizeStatus(status),
        council: 'Brent',
        receivedDate: receivedDateText ? new Date(receivedDateText) : undefined,
        decisionDate: decisionDateText ? new Date(decisionDateText) : undefined,
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

    $('#searchresults li, .searchresults li').each((_, element) => {
      try {
        const $item = $(element);

        const $link = $item.find('a.searchresult').first();
        const reference = $link.text().trim();
        if (!reference || reference.length < 5) return;

        const address = this.extractText($, $item.find('.address'));
        const proposal = this.extractText($, $item.find('.description'));
        const status = this.extractText($, $item.find('.status'));

        const application: Partial<PlanningApplication> = {
          reference,
          address: address || 'Unknown Address',
          proposal: proposal || '',
          status: this.normalizeStatus(status),
          council: 'Brent',
          slug: slugifyPlanningReference(reference),
          sourceUrl: `${this.config.baseUrl}/applicationDetails.do?keyVal=${encodeURIComponent(reference)}`,
        };

        applications.push(application as PlanningApplication);
      } catch (error) {
        this.log(`Failed to parse search result item`, 'error');
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
