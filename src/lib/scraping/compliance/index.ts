/**
 * Ethical Scraping Compliance Module
 * Central export for all scraping compliance tools
 */

export { RobotsChecker, robotsChecker } from './robots-checker';
export type { RobotsRule, RobotsCheckResult } from './robots-checker';

export { TermsValidator, termsValidator } from './terms-validator';
export type { TermsValidationResult, SiteTerms } from './terms-validator';

export { UserAgentManager, userAgentManager } from './user-agent-manager';
export type { UserAgentConfig } from './user-agent-manager';

export { ProxyManager, proxyManager } from './proxy-manager';
export type { ProxyConfig, ProxyStats } from './proxy-manager';

export { ConsentTracker, consentTracker } from './consent-tracker';
export type { ScrapingConsent, ConsentRequest } from './consent-tracker';

export { EthicalScraper, ethicalScraper } from './ethical-scraper';
export type {
  EthicalScrapingOptions,
  ScrapingDecision,
  ScrapingResult
} from './ethical-scraper';

// Re-export rate limiters
export { RateLimiter, TokenBucketRateLimiter } from '../../../scrapers/utils/rate-limiter';

/**
 * Initialize all scraping compliance systems
 */
export function initializeScrapingCompliance() {
  // Set up default ethical scraping configuration
  const config = {
    respectRobots: true,
    checkTerms: true,
    requireConsent: true,
    transparentUserAgent: true,
    rateLimit: 1, // 1 request per second default
    ethicalThreshold: 80 // Minimum ethical score
  };

  console.log('Scraping compliance initialized with config:', config);

  return {
    robotsChecker,
    termsValidator,
    userAgentManager,
    proxyManager,
    consentTracker,
    ethicalScraper
  };
}

/**
 * Run compliance check for a URL
 */
export async function checkUrlCompliance(url: string): Promise<{
  compliant: boolean;
  checks: {
    robots: boolean;
    terms: boolean;
    consent: boolean;
  };
  recommendations: string[];
}> {
  const domain = new URL(url).hostname;

  const robotsCheck = await robotsChecker.checkUrl(url);
  const termsCheck = await termsValidator.validateTerms(url);
  const consentCheck = consentTracker.hasConsent(domain);

  const compliant = robotsCheck.allowed && termsCheck.compliant && consentCheck;

  const recommendations: string[] = [];

  if (!robotsCheck.allowed) {
    recommendations.push('URL blocked by robots.txt');
  }

  if (!termsCheck.compliant) {
    recommendations.push('Review terms of service');
    if (termsCheck.apiAvailable) {
      recommendations.push('Use official API instead');
    }
  }

  if (!consentCheck) {
    recommendations.push('Obtain consent before scraping');
  }

  return {
    compliant,
    checks: {
      robots: robotsCheck.allowed,
      terms: termsCheck.compliant,
      consent: consentCheck
    },
    recommendations
  };
}