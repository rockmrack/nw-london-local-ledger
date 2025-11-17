/**
 * User Agent Rotation Manager
 * Transparent user agent management with proper identification
 */

export interface UserAgentConfig {
  botName: string;
  version: string;
  website: string;
  contactEmail: string;
}

export class UserAgentManager {
  private readonly config: UserAgentConfig = {
    botName: 'NWLondonLedger',
    version: '1.0',
    website: 'https://nwlondonledger.com',
    contactEmail: 'legal@nwlondonledger.com'
  };

  // Transparent bot user agents with clear identification
  private readonly userAgents: string[] = [
    // Primary bot identifier
    `${this.config.botName}/${this.config.version} (+${this.config.website}; ${this.config.contactEmail})`,

    // Alternative formats following industry standards
    `Mozilla/5.0 (compatible; ${this.config.botName}/${this.config.version}; +${this.config.website})`,

    // With additional metadata
    `${this.config.botName}/${this.config.version} (Property Data Aggregator; +${this.config.website}; ${this.config.contactEmail}) Mozilla/5.0 compatible`,

    // Following Googlebot pattern
    `Mozilla/5.0 (compatible; ${this.config.botName}/${this.config.version}; +${this.config.website}) AppleWebKit/537.36 (KHTML, like Gecko)`,

    // With purpose declaration
    `${this.config.botName}/${this.config.version} (Public Data Aggregation; Non-Commercial; +${this.config.website})`
  ];

  // Browser user agents for testing only (not for production scraping)
  private readonly testUserAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  private currentIndex: number = 0;
  private useTransparent: boolean = true;

  /**
   * Get a user agent string (rotates through list)
   */
  getUserAgent(transparent: boolean = true): string {
    this.useTransparent = transparent;
    const agents = transparent ? this.userAgents : this.testUserAgents;

    const agent = agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % agents.length;

    return agent;
  }

  /**
   * Get a specific user agent by index
   */
  getUserAgentByIndex(index: number, transparent: boolean = true): string {
    const agents = transparent ? this.userAgents : this.testUserAgents;
    return agents[index % agents.length];
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent(transparent: boolean = true): string {
    const agents = transparent ? this.userAgents : this.testUserAgents;
    const randomIndex = Math.floor(Math.random() * agents.length);
    return agents[randomIndex];
  }

  /**
   * Get the primary bot identifier
   */
  getPrimaryUserAgent(): string {
    return this.userAgents[0];
  }

  /**
   * Generate custom user agent with specific purpose
   */
  generateCustomUserAgent(purpose: string): string {
    return `${this.config.botName}/${this.config.version} (${purpose}; +${this.config.website}; ${this.config.contactEmail})`;
  }

  /**
   * Get headers for transparent scraping
   */
  getHeaders(options: {
    referer?: string;
    acceptLanguage?: string;
    dnt?: boolean;
  } = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.getUserAgent(this.useTransparent),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': options.acceptLanguage || 'en-GB,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'X-Robot-Name': this.config.botName,
      'X-Robot-Contact': this.config.contactEmail,
      'X-Robot-Website': this.config.website,
      'X-Robot-Purpose': 'Public Data Aggregation'
    };

    if (options.referer) {
      headers['Referer'] = options.referer;
    }

    if (options.dnt) {
      headers['DNT'] = '1';
    }

    return headers;
  }

  /**
   * Validate if a user agent is properly formatted
   */
  validateUserAgent(userAgent: string): boolean {
    // Check if it contains bot identification
    const hasIdentification = userAgent.includes(this.config.botName) ||
                             userAgent.includes(this.config.website) ||
                             userAgent.includes(this.config.contactEmail);

    // Check format
    const validFormat = userAgent.length > 0 && userAgent.length < 500;

    return hasIdentification && validFormat;
  }

  /**
   * Log user agent usage for transparency
   */
  logUsage(url: string, userAgent: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      url,
      userAgent,
      transparent: this.useTransparent,
      purpose: 'data_collection'
    };

    // In production, this would write to a transparency log
    if (process.env.NODE_ENV === 'development') {
      console.log('[User Agent Log]', JSON.stringify(logEntry));
    }
  }

  /**
   * Get user agent policy for transparency page
   */
  getUserAgentPolicy(): object {
    return {
      botName: this.config.botName,
      version: this.config.version,
      website: this.config.website,
      contact: this.config.contactEmail,
      policy: {
        identification: 'All requests include clear bot identification',
        transparency: 'User agent includes website and contact information',
        purpose: 'Public data aggregation for property information service',
        compliance: 'Respects robots.txt and rate limits',
        optOut: `Contact ${this.config.contactEmail} to opt out`
      },
      examples: [
        this.userAgents[0],
        this.generateCustomUserAgent('Planning Data Collection')
      ],
      lastUpdated: new Date().toISOString()
    };
  }
}

export const userAgentManager = new UserAgentManager();