/**
 * Scraping Consent Tracker
 * Tracks and manages consent for data collection from various sources
 */

export interface ScrapingConsent {
  domain: string;
  consentType: 'explicit' | 'implicit' | 'tos' | 'robots' | 'api-terms';
  granted: boolean;
  timestamp: Date;
  expiresAt?: Date;
  scope?: string[];
  restrictions?: string[];
  contactEmail?: string;
  reference?: string; // Reference to consent document/email
  notes?: string;
}

export interface ConsentRequest {
  id: string;
  domain: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'denied' | 'no-response';
  responseAt?: Date;
  contactMethod: 'email' | 'form' | 'api';
  message?: string;
  response?: string;
}

export class ConsentTracker {
  private consents: Map<string, ScrapingConsent> = new Map();
  private requests: Map<string, ConsentRequest> = new Map();

  constructor() {
    // Initialize with known consents
    this.initializeKnownConsents();
  }

  /**
   * Initialize with known public data consents
   */
  private initializeKnownConsents(): void {
    const knownConsents: ScrapingConsent[] = [
      {
        domain: 'landregistry.gov.uk',
        consentType: 'tos',
        granted: true,
        timestamp: new Date(),
        scope: ['price-paid-data', 'transaction-data'],
        restrictions: ['Attribution required', 'OGL v3.0 compliance'],
        reference: 'Open Government Licence v3.0'
      },
      {
        domain: 'epc.opendatacommunities.org',
        consentType: 'tos',
        granted: true,
        timestamp: new Date(),
        scope: ['energy-certificates'],
        restrictions: ['Rate limiting required'],
        reference: 'Open Government Licence v3.0'
      },
      {
        domain: 'police.uk',
        consentType: 'api-terms',
        granted: true,
        timestamp: new Date(),
        scope: ['crime-statistics'],
        restrictions: ['Use API instead of scraping'],
        reference: 'Police API Terms'
      },
      {
        domain: 'tfl.gov.uk',
        consentType: 'api-terms',
        granted: true,
        timestamp: new Date(),
        scope: ['transport-data'],
        restrictions: ['API key required', 'No scraping allowed'],
        reference: 'TfL Unified API Terms'
      }
    ];

    knownConsents.forEach(consent => {
      this.consents.set(consent.domain, consent);
    });
  }

  /**
   * Check if domain has consent
   */
  hasConsent(domain: string): boolean {
    const consent = this.consents.get(this.normalizeDomain(domain));
    if (!consent) return false;

    // Check if consent has expired
    if (consent.expiresAt && consent.expiresAt < new Date()) {
      return false;
    }

    return consent.granted;
  }

  /**
   * Get consent details for a domain
   */
  getConsent(domain: string): ScrapingConsent | undefined {
    return this.consents.get(this.normalizeDomain(domain));
  }

  /**
   * Add or update consent
   */
  addConsent(consent: ScrapingConsent): void {
    const normalizedDomain = this.normalizeDomain(consent.domain);
    this.consents.set(normalizedDomain, {
      ...consent,
      domain: normalizedDomain,
      timestamp: consent.timestamp || new Date()
    });

    // Log consent for audit trail
    this.logConsentChange(consent, 'added');
  }

  /**
   * Revoke consent for a domain
   */
  revokeConsent(domain: string, reason?: string): void {
    const normalizedDomain = this.normalizeDomain(domain);
    const consent = this.consents.get(normalizedDomain);

    if (consent) {
      consent.granted = false;
      consent.notes = reason || 'Consent revoked';
      this.logConsentChange(consent, 'revoked');
    }
  }

  /**
   * Track consent request
   */
  trackConsentRequest(domain: string, method: 'email' | 'form' | 'api'): string {
    const requestId = this.generateRequestId();
    const request: ConsentRequest = {
      id: requestId,
      domain: this.normalizeDomain(domain),
      requestedAt: new Date(),
      status: 'pending',
      contactMethod: method
    };

    this.requests.set(requestId, request);
    return requestId;
  }

  /**
   * Update consent request status
   */
  updateRequestStatus(
    requestId: string,
    status: ConsentRequest['status'],
    response?: string
  ): void {
    const request = this.requests.get(requestId);
    if (!request) return;

    request.status = status;
    request.responseAt = new Date();
    if (response) {
      request.response = response;
    }

    // If approved, add consent
    if (status === 'approved') {
      this.addConsent({
        domain: request.domain,
        consentType: 'explicit',
        granted: true,
        timestamp: new Date(),
        reference: `Request ${requestId}`
      });
    }
  }

  /**
   * Generate consent request email template
   */
  generateConsentEmail(domain: string, purpose: string = 'property data aggregation'): string {
    return `Subject: Request for Data Collection Permission - NW London Local Ledger

Dear ${domain} Data Controller,

I am writing to request permission to collect publicly available property and planning data from ${domain} for use in NW London Local Ledger (https://nwlondonledger.com), a non-commercial property information platform serving the North West London community.

Purpose of Data Collection:
- Aggregate public property and planning information
- Provide free access to local residents for property research
- Support transparency in local development

Our Commitments:
- Respect robots.txt directives
- Implement appropriate rate limiting
- Provide clear attribution
- Comply with your terms of service
- Not resell or commercially exploit the data

Technical Details:
- User Agent: NWLondonLedger/1.0 (+https://nwlondonledger.com)
- Expected frequency: Daily updates with rate limiting
- Contact: legal@nwlondonledger.com

We would appreciate your consent to access this public data through automated means. If you have an API available, we would prefer to use that instead of web scraping.

Please let us know if you have any specific requirements or restrictions we should follow.

Best regards,
NW London Local Ledger Team
legal@nwlondonledger.com
https://nwlondonledger.com

Note: If you prefer we do not access your data, please respond and we will immediately exclude your domain from our collection process.`;
  }

  /**
   * Check if consent is required for domain
   */
  isConsentRequired(domain: string): {
    required: boolean;
    reason?: string;
    method?: 'email' | 'form' | 'api';
  } {
    const normalizedDomain = this.normalizeDomain(domain);

    // Government sites with OGL typically don't require explicit consent
    if (this.isGovernmentDomain(normalizedDomain)) {
      return {
        required: false,
        reason: 'Government data under Open Government Licence'
      };
    }

    // Check if we already have consent
    if (this.hasConsent(normalizedDomain)) {
      return {
        required: false,
        reason: 'Consent already obtained'
      };
    }

    // Commercial sites typically require consent
    if (this.isCommercialDomain(normalizedDomain)) {
      return {
        required: true,
        reason: 'Commercial website requires explicit consent',
        method: 'email'
      };
    }

    // Default: consent recommended
    return {
      required: true,
      reason: 'Best practice to obtain consent',
      method: 'email'
    };
  }

  /**
   * Generate consent compliance report
   */
  generateComplianceReport(): {
    summary: {
      totalDomains: number;
      consentedDomains: number;
      pendingRequests: number;
      deniedDomains: number;
    };
    consents: ScrapingConsent[];
    requests: ConsentRequest[];
    compliance: {
      percentage: number;
      issues: string[];
    };
  } {
    const consentedDomains = Array.from(this.consents.values()).filter(c => c.granted);
    const deniedDomains = Array.from(this.consents.values()).filter(c => !c.granted);
    const pendingRequests = Array.from(this.requests.values()).filter(r => r.status === 'pending');

    const issues: string[] = [];

    // Check for expired consents
    const expiredConsents = Array.from(this.consents.values()).filter(
      c => c.expiresAt && c.expiresAt < new Date()
    );
    if (expiredConsents.length > 0) {
      issues.push(`${expiredConsents.length} consent(s) have expired`);
    }

    // Check for old pending requests
    const oldRequests = pendingRequests.filter(r => {
      const daysSince = (Date.now() - r.requestedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    });
    if (oldRequests.length > 0) {
      issues.push(`${oldRequests.length} consent request(s) pending for over 30 days`);
    }

    const compliancePercentage = this.consents.size > 0
      ? (consentedDomains.length / this.consents.size) * 100
      : 100;

    return {
      summary: {
        totalDomains: this.consents.size,
        consentedDomains: consentedDomains.length,
        pendingRequests: pendingRequests.length,
        deniedDomains: deniedDomains.length
      },
      consents: Array.from(this.consents.values()),
      requests: Array.from(this.requests.values()),
      compliance: {
        percentage: compliancePercentage,
        issues
      }
    };
  }

  /**
   * Helper: Normalize domain
   */
  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
  }

  /**
   * Helper: Check if government domain
   */
  private isGovernmentDomain(domain: string): boolean {
    return domain.endsWith('.gov.uk') ||
           domain.endsWith('.nhs.uk') ||
           domain.endsWith('.police.uk') ||
           domain.endsWith('.mod.uk');
  }

  /**
   * Helper: Check if commercial domain
   */
  private isCommercialDomain(domain: string): boolean {
    return !this.isGovernmentDomain(domain) &&
           !domain.endsWith('.org') &&
           !domain.endsWith('.ac.uk') &&
           !domain.endsWith('.edu');
  }

  /**
   * Helper: Generate request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper: Log consent changes
   */
  private logConsentChange(consent: ScrapingConsent, action: string): void {
    const log = {
      timestamp: new Date().toISOString(),
      action,
      domain: consent.domain,
      granted: consent.granted,
      reference: consent.reference
    };

    // In production, write to audit log
    console.log('[Consent Tracker]', JSON.stringify(log));
  }
}

export const consentTracker = new ConsentTracker();