/**
 * Terms of Service Validator
 * Checks and validates compliance with website terms of service
 */

export interface TermsValidationResult {
  compliant: boolean;
  restrictions: string[];
  commercialUseAllowed?: boolean;
  scrapingAllowed?: boolean;
  requiresAttribution?: boolean;
  requiresLicense?: boolean;
  apiAvailable?: boolean;
  contactRequired?: boolean;
  notes: string[];
}

export interface SiteTerms {
  domain: string;
  lastChecked: Date;
  termsUrl?: string;
  restrictions: string[];
  commercialUse: 'allowed' | 'restricted' | 'prohibited';
  scraping: 'allowed' | 'restricted' | 'prohibited';
  attribution?: string;
  licenseRequired?: boolean;
  apiUrl?: string;
  contactEmail?: string;
  notes?: string[];
}

export class TermsValidator {
  // Pre-configured terms for common UK government sites
  private readonly knownSiteTerms: Map<string, SiteTerms> = new Map([
    ['landregistry.gov.uk', {
      domain: 'landregistry.gov.uk',
      lastChecked: new Date('2024-01-01'),
      termsUrl: 'https://www.gov.uk/government/organisations/land-registry/about/personal-information-charter',
      restrictions: [
        'Must comply with Open Government Licence v3.0',
        'Attribution required: © Crown copyright',
        'Bulk downloads require separate agreement'
      ],
      commercialUse: 'allowed',
      scraping: 'restricted',
      attribution: '© Crown copyright and database rights [year] OS [number]',
      licenseRequired: false,
      apiUrl: 'https://landregistry.data.gov.uk/',
      notes: [
        'Price Paid Data available under OGL',
        'Title register data requires payment'
      ]
    }],
    ['epc.opendatacommunities.org', {
      domain: 'epc.opendatacommunities.org',
      lastChecked: new Date('2024-01-01'),
      termsUrl: 'https://epc.opendatacommunities.org/docs/copyright',
      restrictions: [
        'Open Government Licence v3.0',
        'No warranty provided'
      ],
      commercialUse: 'allowed',
      scraping: 'allowed',
      attribution: 'Contains public sector information licensed under the Open Government Licence v3.0',
      licenseRequired: false,
      apiUrl: 'https://epc.opendatacommunities.org/docs/api',
      notes: ['Bulk downloads available', 'Rate limits apply to API']
    }],
    ['police.uk', {
      domain: 'police.uk',
      lastChecked: new Date('2024-01-01'),
      termsUrl: 'https://www.police.uk/terms-and-conditions/',
      restrictions: [
        'Open Government Licence v3.0',
        'Data may be incomplete'
      ],
      commercialUse: 'allowed',
      scraping: 'allowed',
      attribution: 'Contains public sector information licensed under the Open Government Licence v3.0',
      licenseRequired: false,
      apiUrl: 'https://data.police.uk/docs/',
      notes: ['API preferred over scraping', 'Monthly data updates']
    }],
    ['tfl.gov.uk', {
      domain: 'tfl.gov.uk',
      lastChecked: new Date('2024-01-01'),
      termsUrl: 'https://tfl.gov.uk/corporate/terms-and-conditions/',
      restrictions: [
        'Must register for API access',
        'Rate limits apply',
        'No service guarantee'
      ],
      commercialUse: 'restricted',
      scraping: 'prohibited',
      attribution: 'Powered by TfL Open Data',
      licenseRequired: true,
      apiUrl: 'https://api.tfl.gov.uk/',
      contactEmail: 'opendata@tfl.gov.uk',
      notes: ['API key required', 'Must use API instead of scraping']
    }]
  ]);

  // Council-specific terms patterns
  private readonly councilTermsPatterns = {
    restrictedPhrases: [
      'no automated access',
      'scraping prohibited',
      'robots excluded',
      'no data harvesting',
      'written permission required'
    ],
    commercialRestrictions: [
      'non-commercial use only',
      'personal use only',
      'commercial license required'
    ],
    attributionPhrases: [
      'attribution required',
      'must acknowledge',
      'crown copyright'
    ]
  };

  /**
   * Validate terms for a URL
   */
  async validateTerms(url: string): Promise<TermsValidationResult> {
    const domain = new URL(url).hostname.replace('www.', '');

    // Check known site terms
    const knownTerms = this.knownSiteTerms.get(domain);
    if (knownTerms) {
      return this.convertToValidationResult(knownTerms);
    }

    // Check for council websites
    if (this.isCouncilWebsite(domain)) {
      return this.getCouncilTerms(domain);
    }

    // Default validation for unknown sites
    return {
      compliant: true,
      restrictions: ['Terms of service should be reviewed manually'],
      commercialUseAllowed: undefined,
      scrapingAllowed: undefined,
      notes: [
        'Unable to automatically validate terms',
        'Manual review recommended before scraping'
      ]
    };
  }

  /**
   * Check if domain is a UK council website
   */
  private isCouncilWebsite(domain: string): boolean {
    return domain.endsWith('.gov.uk') &&
           (domain.includes('council') ||
            domain.includes('borough') ||
            ['barnet', 'brent', 'camden', 'ealing', 'harrow', 'westminster'].some(
              council => domain.includes(council)
            ));
  }

  /**
   * Get generic council terms
   */
  private getCouncilTerms(domain: string): TermsValidationResult {
    return {
      compliant: true,
      restrictions: [
        'Council data typically under Open Government Licence',
        'Planning data is public record',
        'Check individual council terms for specifics'
      ],
      commercialUseAllowed: true,
      scrapingAllowed: true,
      requiresAttribution: true,
      apiAvailable: false,
      notes: [
        'Most council planning data is public',
        'Respect server resources and rate limits',
        `Check https://${domain}/terms for specific terms`
      ]
    };
  }

  /**
   * Convert SiteTerms to TermsValidationResult
   */
  private convertToValidationResult(terms: SiteTerms): TermsValidationResult {
    return {
      compliant: terms.scraping !== 'prohibited',
      restrictions: terms.restrictions,
      commercialUseAllowed: terms.commercialUse !== 'prohibited',
      scrapingAllowed: terms.scraping !== 'prohibited',
      requiresAttribution: !!terms.attribution,
      requiresLicense: terms.licenseRequired,
      apiAvailable: !!terms.apiUrl,
      contactRequired: !!terms.contactEmail,
      notes: terms.notes || []
    };
  }

  /**
   * Add or update site terms
   */
  addSiteTerms(terms: SiteTerms): void {
    this.knownSiteTerms.set(terms.domain, {
      ...terms,
      lastChecked: new Date()
    });
  }

  /**
   * Generate compliance decision
   */
  async makeComplianceDecision(url: string): Promise<{
    decision: 'proceed' | 'use-api' | 'contact-required' | 'prohibited';
    reason: string;
    alternatives?: string[];
  }> {
    const validation = await this.validateTerms(url);

    if (!validation.compliant) {
      return {
        decision: 'prohibited',
        reason: 'Scraping not allowed by terms of service',
        alternatives: validation.apiAvailable
          ? ['Use official API instead']
          : ['Contact site owner for permission']
      };
    }

    if (validation.apiAvailable && !validation.scrapingAllowed) {
      return {
        decision: 'use-api',
        reason: 'API available and should be used instead of scraping',
        alternatives: ['Register for API access']
      };
    }

    if (validation.contactRequired) {
      return {
        decision: 'contact-required',
        reason: 'Contact required before automated access',
        alternatives: ['Send request to site owner']
      };
    }

    return {
      decision: 'proceed',
      reason: 'Compliant with terms of service'
    };
  }

  /**
   * Check all URLs for compliance
   */
  async validateMultipleUrls(urls: string[]): Promise<{
    compliant: boolean;
    results: Array<{
      url: string;
      validation: TermsValidationResult;
      decision: string;
    }>;
    summary: {
      total: number;
      compliant: number;
      requireApi: number;
      prohibited: number;
    };
  }> {
    const results = [];
    let compliantCount = 0;
    let requireApiCount = 0;
    let prohibitedCount = 0;

    for (const url of urls) {
      const validation = await this.validateTerms(url);
      const decision = await this.makeComplianceDecision(url);

      results.push({ url, validation, decision: decision.decision });

      if (validation.compliant) compliantCount++;
      if (decision.decision === 'use-api') requireApiCount++;
      if (decision.decision === 'prohibited') prohibitedCount++;
    }

    return {
      compliant: prohibitedCount === 0,
      results,
      summary: {
        total: urls.length,
        compliant: compliantCount,
        requireApi: requireApiCount,
        prohibited: prohibitedCount
      }
    };
  }
}

export const termsValidator = new TermsValidator();