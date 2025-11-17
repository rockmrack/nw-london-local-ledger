/**
 * Ethical Scraping Orchestrator
 * Combines all compliance components for ethical data collection
 */

import axios, { AxiosRequestConfig } from 'axios';
import { robotsChecker } from './robots-checker';
import { termsValidator } from './terms-validator';
import { userAgentManager } from './user-agent-manager';
import { proxyManager } from './proxy-manager';
import { consentTracker } from './consent-tracker';
import { RateLimiter, TokenBucketRateLimiter } from '../../../scrapers/utils/rate-limiter';

export interface EthicalScrapingOptions {
  url: string;
  respectRobots?: boolean;
  checkTerms?: boolean;
  requireConsent?: boolean;
  useProxy?: boolean;
  rateLimit?: number; // requests per second
  retries?: number;
  timeout?: number; // milliseconds
  purpose?: string;
}

export interface ScrapingDecision {
  canScrape: boolean;
  method: 'direct' | 'api' | 'proxy' | 'blocked';
  reasons: string[];
  alternatives?: string[];
  headers?: Record<string, string>;
  proxy?: any;
  rateLimit?: number;
  warnings?: string[];
}

export interface ScrapingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  compliance: {
    robotsCompliant: boolean;
    termsCompliant: boolean;
    consentObtained: boolean;
    ethicalScore: number;
  };
  metadata: {
    url: string;
    timestamp: Date;
    responseTime: number;
    method: string;
    userAgent: string;
  };
}

export class EthicalScraper {
  private rateLimiter: RateLimiter;
  private tokenBucket: TokenBucketRateLimiter;

  constructor() {
    // Default conservative rate limits
    this.rateLimiter = new RateLimiter(1); // 1 request per second
    this.tokenBucket = new TokenBucketRateLimiter(10, 0.5); // 10 tokens, 0.5 refill/sec
  }

  /**
   * Make scraping decision based on compliance checks
   */
  async makeScrapingDecision(options: EthicalScrapingOptions): Promise<ScrapingDecision> {
    const decision: ScrapingDecision = {
      canScrape: true,
      method: 'direct',
      reasons: [],
      warnings: []
    };

    const url = new URL(options.url);
    const domain = url.hostname;

    // 1. Check robots.txt
    if (options.respectRobots !== false) {
      const robotsResult = await robotsChecker.checkUrl(options.url);
      if (!robotsResult.allowed) {
        decision.canScrape = false;
        decision.method = 'blocked';
        decision.reasons.push(`Blocked by robots.txt: ${robotsResult.reason}`);
        decision.alternatives = ['Check for API access', 'Request permission'];
        return decision;
      }
      if (robotsResult.crawlDelay) {
        decision.rateLimit = 1 / robotsResult.crawlDelay;
        decision.warnings?.push(`Robots.txt crawl-delay: ${robotsResult.crawlDelay}s`);
      }
    }

    // 2. Check Terms of Service
    if (options.checkTerms !== false) {
      const termsResult = await termsValidator.validateTerms(options.url);
      if (!termsResult.compliant) {
        decision.canScrape = false;
        decision.method = 'blocked';
        decision.reasons.push('Terms of Service prohibit scraping');
        if (termsResult.apiAvailable) {
          decision.alternatives = ['Use official API'];
          decision.method = 'api';
        }
        return decision;
      }
      if (termsResult.requiresAttribution) {
        decision.warnings?.push('Attribution required');
      }
      if (termsResult.apiAvailable) {
        decision.warnings?.push('API available - consider using instead');
      }
    }

    // 3. Check consent
    if (options.requireConsent !== false) {
      const consentCheck = consentTracker.isConsentRequired(domain);
      if (consentCheck.required && !consentTracker.hasConsent(domain)) {
        decision.canScrape = false;
        decision.method = 'blocked';
        decision.reasons.push(`Consent required: ${consentCheck.reason}`);
        decision.alternatives = ['Request consent via email'];
        return decision;
      }
    }

    // 4. Prepare headers
    decision.headers = userAgentManager.getHeaders({
      referer: url.origin,
      dnt: true
    });

    // 5. Setup proxy if requested
    if (options.useProxy) {
      const proxy = proxyManager.getNextProxy();
      if (proxy) {
        decision.proxy = proxyManager.formatProxyForAxios(proxy);
        decision.method = 'proxy';
      } else {
        decision.warnings?.push('No ethical proxies available');
      }
    }

    // 6. Set rate limiting
    decision.rateLimit = decision.rateLimit || options.rateLimit || 1;

    return decision;
  }

  /**
   * Execute ethical scraping with all compliance checks
   */
  async scrape<T = any>(options: EthicalScrapingOptions): Promise<ScrapingResult<T>> {
    const startTime = Date.now();
    const result: ScrapingResult<T> = {
      success: false,
      compliance: {
        robotsCompliant: false,
        termsCompliant: false,
        consentObtained: false,
        ethicalScore: 0
      },
      metadata: {
        url: options.url,
        timestamp: new Date(),
        responseTime: 0,
        method: 'direct',
        userAgent: ''
      }
    };

    try {
      // Make scraping decision
      const decision = await this.makeScrapingDecision(options);

      if (!decision.canScrape) {
        result.error = `Scraping not allowed: ${decision.reasons.join(', ')}`;
        return result;
      }

      // Apply rate limiting
      if (decision.rateLimit) {
        await this.rateLimiter.acquire();
        await this.tokenBucket.acquire();
      }

      // Prepare request config
      const config: AxiosRequestConfig = {
        headers: decision.headers,
        proxy: decision.proxy,
        timeout: options.timeout || 30000,
        validateStatus: (status) => status < 500
      };

      result.metadata.userAgent = config.headers?.['User-Agent'] || '';
      result.metadata.method = decision.method;

      // Log for transparency
      userAgentManager.logUsage(options.url, result.metadata.userAgent);

      // Execute request with retries
      let lastError: any;
      const maxRetries = options.retries || 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await axios.get(options.url, config);

          if (response.status === 200) {
            result.success = true;
            result.data = response.data;
            break;
          } else if (response.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = parseInt(response.headers['retry-after'] || '60');
            await this.sleep(retryAfter * 1000);
            continue;
          } else if (response.status >= 400) {
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
          }
        }
      }

      if (!result.success && lastError) {
        result.error = lastError.message;
      }

      // Update proxy stats if used
      if (decision.proxy && decision.method === 'proxy') {
        const proxy = proxyManager.getNextProxy();
        if (proxy) {
          proxyManager.updateProxyStats(
            proxy,
            result.success,
            Date.now() - startTime
          );
        }
      }

      // Calculate compliance scores
      result.compliance = {
        robotsCompliant: options.respectRobots !== false,
        termsCompliant: options.checkTerms !== false,
        consentObtained: consentTracker.hasConsent(new URL(options.url).hostname),
        ethicalScore: this.calculateEthicalScore(options, decision, result.success)
      };

      result.metadata.responseTime = Date.now() - startTime;

    } catch (error: any) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * Scrape with fallback strategies
   */
  async scrapeWithFallback<T = any>(
    url: string,
    strategies: Array<'direct' | 'proxy' | 'api'>
  ): Promise<ScrapingResult<T>> {
    let lastResult: ScrapingResult<T> | null = null;

    for (const strategy of strategies) {
      const options: EthicalScrapingOptions = {
        url,
        respectRobots: true,
        checkTerms: true,
        requireConsent: true,
        useProxy: strategy === 'proxy',
        purpose: 'Public data aggregation'
      };

      const result = await this.scrape<T>(options);

      if (result.success) {
        return result;
      }

      lastResult = result;

      // If blocked by compliance, don't try other strategies
      if (result.error?.includes('not allowed')) {
        break;
      }

      // Add delay between attempts
      await this.sleep(2000);
    }

    return lastResult || {
      success: false,
      error: 'All strategies failed',
      compliance: {
        robotsCompliant: false,
        termsCompliant: false,
        consentObtained: false,
        ethicalScore: 0
      },
      metadata: {
        url,
        timestamp: new Date(),
        responseTime: 0,
        method: 'blocked',
        userAgent: ''
      }
    };
  }

  /**
   * Batch scraping with compliance
   */
  async batchScrape<T = any>(
    urls: string[],
    options?: Partial<EthicalScrapingOptions>
  ): Promise<ScrapingResult<T>[]> {
    const results: ScrapingResult<T>[] = [];

    // Group URLs by domain for efficient rate limiting
    const urlsByDomain = new Map<string, string[]>();
    urls.forEach(url => {
      const domain = new URL(url).hostname;
      if (!urlsByDomain.has(domain)) {
        urlsByDomain.set(domain, []);
      }
      urlsByDomain.get(domain)!.push(url);
    });

    // Process each domain's URLs
    for (const [domain, domainUrls] of urlsByDomain) {
      // Check consent once per domain
      if (!consentTracker.hasConsent(domain)) {
        console.warn(`No consent for ${domain} - skipping ${domainUrls.length} URLs`);
        domainUrls.forEach(url => {
          results.push({
            success: false,
            error: 'No consent for domain',
            compliance: {
              robotsCompliant: false,
              termsCompliant: false,
              consentObtained: false,
              ethicalScore: 0
            },
            metadata: {
              url,
              timestamp: new Date(),
              responseTime: 0,
              method: 'blocked',
              userAgent: ''
            }
          });
        });
        continue;
      }

      // Process URLs for this domain
      for (const url of domainUrls) {
        const result = await this.scrape<T>({
          url,
          ...options
        });
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Calculate ethical score for scraping
   */
  private calculateEthicalScore(
    options: EthicalScrapingOptions,
    decision: ScrapingDecision,
    success: boolean
  ): number {
    let score = 0;

    // Compliance checks (40 points)
    if (options.respectRobots !== false) score += 15;
    if (options.checkTerms !== false) score += 15;
    if (options.requireConsent !== false) score += 10;

    // Transparency (20 points)
    if (decision.headers?.['User-Agent']?.includes('NWLondonLedger')) score += 10;
    if (decision.headers?.['X-Robot-Contact']) score += 10;

    // Rate limiting (20 points)
    if (decision.rateLimit && decision.rateLimit <= 1) score += 20;
    else if (decision.rateLimit && decision.rateLimit <= 2) score += 10;

    // Method used (10 points)
    if (decision.method === 'api') score += 10;
    else if (decision.method === 'direct') score += 5;

    // Success without errors (10 points)
    if (success) score += 10;

    return Math.min(100, score);
  }

  /**
   * Helper: Sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate scraping audit report
   */
  async generateAuditReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: {
      totalRequests: number;
      successfulRequests: number;
      blockedRequests: number;
      avgEthicalScore: number;
    };
    compliance: {
      robotsCompliance: number;
      termsCompliance: number;
      consentCompliance: number;
    };
    recommendations: string[];
  }> {
    // In production, this would query from audit logs
    return {
      summary: {
        totalRequests: 0,
        successfulRequests: 0,
        blockedRequests: 0,
        avgEthicalScore: 0
      },
      compliance: {
        robotsCompliance: 100,
        termsCompliance: 100,
        consentCompliance: 100
      },
      recommendations: [
        'Continue respecting robots.txt',
        'Maintain transparent user agents',
        'Regular consent review',
        'Prefer APIs over scraping where available'
      ]
    };
  }
}

export const ethicalScraper = new EthicalScraper();