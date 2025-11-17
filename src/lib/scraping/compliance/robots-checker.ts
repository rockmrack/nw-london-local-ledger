/**
 * Robots.txt Compliance Checker
 * Ensures scraping respects robots.txt directives
 */

import axios from 'axios';

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
  sitemap?: string[];
}

export interface RobotsCheckResult {
  allowed: boolean;
  crawlDelay?: number;
  reason?: string;
  rules?: RobotsRule[];
}

export class RobotsChecker {
  private cache: Map<string, { rules: RobotsRule[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly USER_AGENT = 'NWLondonLedger/1.0 (https://nwlondonledger.com; legal@nwlondonledger.com)';

  /**
   * Check if a URL is allowed according to robots.txt
   */
  async checkUrl(url: string, userAgent: string = '*'): Promise<RobotsCheckResult> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

      // Get and parse robots.txt
      const rules = await this.getRobotsRules(robotsUrl);

      // Find applicable rules
      const applicableRules = this.findApplicableRules(rules, userAgent);

      // Check if path is allowed
      const path = urlObj.pathname + urlObj.search;
      const isAllowed = this.isPathAllowed(path, applicableRules);

      return {
        allowed: isAllowed,
        crawlDelay: applicableRules?.crawlDelay,
        reason: isAllowed ? undefined : `Disallowed by robots.txt for user-agent: ${userAgent}`,
        rules: applicableRules ? [applicableRules] : []
      };
    } catch (error) {
      // If robots.txt doesn't exist or can't be fetched, assume allowed
      console.warn(`Could not fetch robots.txt: ${error}`);
      return {
        allowed: true,
        reason: 'No robots.txt found (assuming allowed)'
      };
    }
  }

  /**
   * Get and parse robots.txt rules
   */
  private async getRobotsRules(robotsUrl: string): Promise<RobotsRule[]> {
    // Check cache
    const cached = this.cache.get(robotsUrl);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.rules;
    }

    // Fetch robots.txt
    const response = await axios.get(robotsUrl, {
      headers: {
        'User-Agent': this.USER_AGENT
      },
      timeout: 5000,
      validateStatus: (status) => status === 200
    });

    const rules = this.parseRobotsTxt(response.data);

    // Cache the parsed rules
    this.cache.set(robotsUrl, {
      rules,
      timestamp: Date.now()
    });

    return rules;
  }

  /**
   * Parse robots.txt content
   */
  private parseRobotsTxt(content: string): RobotsRule[] {
    const lines = content.split('\n').map(line => line.trim());
    const rules: RobotsRule[] = [];
    let currentRule: RobotsRule | null = null;

    for (const line of lines) {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) continue;

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const directive = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();

      switch (directive) {
        case 'user-agent':
          // Start new rule
          if (currentRule) {
            rules.push(currentRule);
          }
          currentRule = {
            userAgent: value,
            allow: [],
            disallow: []
          };
          break;

        case 'disallow':
          if (currentRule && value) {
            currentRule.disallow.push(value);
          }
          break;

        case 'allow':
          if (currentRule && value) {
            currentRule.allow.push(value);
          }
          break;

        case 'crawl-delay':
          if (currentRule) {
            currentRule.crawlDelay = parseInt(value, 10);
          }
          break;

        case 'sitemap':
          if (currentRule) {
            if (!currentRule.sitemap) {
              currentRule.sitemap = [];
            }
            currentRule.sitemap.push(value);
          }
          break;
      }
    }

    // Add last rule
    if (currentRule) {
      rules.push(currentRule);
    }

    return rules;
  }

  /**
   * Find rules applicable to a user agent
   */
  private findApplicableRules(rules: RobotsRule[], userAgent: string): RobotsRule | null {
    // First, try exact match
    let rule = rules.find(r => r.userAgent.toLowerCase() === userAgent.toLowerCase());

    // If no exact match, try wildcard
    if (!rule) {
      rule = rules.find(r => r.userAgent === '*');
    }

    // If still no match, try partial match
    if (!rule) {
      rule = rules.find(r =>
        userAgent.toLowerCase().includes(r.userAgent.toLowerCase()) ||
        r.userAgent.toLowerCase().includes(userAgent.toLowerCase())
      );
    }

    return rule || null;
  }

  /**
   * Check if a path is allowed by rules
   */
  private isPathAllowed(path: string, rules: RobotsRule | null): boolean {
    if (!rules) return true; // No rules = allowed

    // Check Allow rules first (they take precedence)
    for (const pattern of rules.allow) {
      if (this.matchesPattern(path, pattern)) {
        return true;
      }
    }

    // Check Disallow rules
    for (const pattern of rules.disallow) {
      if (this.matchesPattern(path, pattern)) {
        return false;
      }
    }

    // If no rules match, it's allowed
    return true;
  }

  /**
   * Check if a path matches a robots.txt pattern
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Handle empty pattern (disallow nothing)
    if (!pattern || pattern === '') return false;

    // Handle wildcard
    if (pattern === '/') return true;

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}`);
    return regex.test(path);
  }

  /**
   * Generate a robots.txt compliant scraping report
   */
  async generateComplianceReport(urls: string[]): Promise<{
    compliant: boolean;
    results: Array<{ url: string; result: RobotsCheckResult }>;
    summary: {
      total: number;
      allowed: number;
      disallowed: number;
      avgCrawlDelay: number;
    };
  }> {
    const results: Array<{ url: string; result: RobotsCheckResult }> = [];

    for (const url of urls) {
      const result = await this.checkUrl(url);
      results.push({ url, result });
    }

    const allowed = results.filter(r => r.result.allowed).length;
    const disallowed = results.filter(r => !r.result.allowed).length;
    const crawlDelays = results
      .map(r => r.result.crawlDelay)
      .filter(d => d !== undefined) as number[];

    const avgCrawlDelay = crawlDelays.length > 0
      ? crawlDelays.reduce((a, b) => a + b, 0) / crawlDelays.length
      : 0;

    return {
      compliant: disallowed === 0,
      results,
      summary: {
        total: urls.length,
        allowed,
        disallowed,
        avgCrawlDelay
      }
    };
  }
}

export const robotsChecker = new RobotsChecker();