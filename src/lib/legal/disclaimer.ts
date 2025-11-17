/**
 * Legal Disclaimer System
 * Dynamic legal disclaimer generation and management
 */

export type DisclaimerType =
  | 'general'
  | 'property-data'
  | 'planning'
  | 'investment'
  | 'third-party'
  | 'accuracy'
  | 'api-usage';

export interface DisclaimerConfig {
  type: DisclaimerType;
  context?: string;
  severity?: 'info' | 'warning' | 'critical';
  displayLocation?: 'header' | 'footer' | 'inline' | 'modal';
}

export class LegalDisclaimerSystem {
  private readonly disclaimers: Record<DisclaimerType, (context?: string) => string> = {
    general: () => `
**Legal Disclaimer:** The information provided on this platform is for general informational purposes only.
While we strive to keep information up to date and accurate, we make no representations or warranties of any kind,
express or implied, about the completeness, accuracy, reliability, suitability, or availability of the information.`,

    'property-data': (context) => `
**Property Data Disclaimer:** Property information is sourced from HM Land Registry and other public sources.
${context ? `Regarding ${context}: ` : ''}Data may not reflect recent transactions or changes.
Always verify important information with official sources before making decisions.
Historical prices are not indicative of current values or future performance.`,

    planning: (context) => `
**Planning Information Notice:** Planning application data is sourced from local council websites and may be subject to change.
${context ? `For ${context}: ` : ''}The status shown may not reflect the most recent decisions.
For official planning information, please consult the relevant local planning authority directly.
We are not responsible for decisions made based on this information.`,

    investment: () => `
**Investment Warning:** Nothing on this website constitutes financial, investment, legal, tax or other advice.
Property values can fall as well as rise. Past performance is not a guarantee of future results.
You should conduct your own research and seek independent professional advice before making any investment decisions.
We accept no liability for any loss or damage arising from the use of this information.`,

    'third-party': (context) => `
**Third-Party Data Notice:** This platform aggregates data from various third-party sources including
government databases, public registers, and open data portals. ${context ? `Source: ${context}. ` : ''}
We do not control or verify third-party data and cannot guarantee its accuracy, completeness, or timeliness.
Each data source retains its own terms and conditions which users must comply with.`,

    accuracy: () => `
**Accuracy Disclaimer:** While we make every effort to ensure data accuracy, information may contain errors or omissions.
Data processing, technical issues, or source errors may affect accuracy. Users should independently verify critical information.
Report suspected errors to support@nwlondonledger.com. We reserve the right to correct errors without notice.`,

    'api-usage': () => `
**API Usage Terms:** API access is provided subject to rate limits and usage restrictions.
Automated access must comply with our robots.txt and Terms of Service. Commercial use requires a license.
We reserve the right to suspend or terminate access for violations. API availability is not guaranteed.`
  };

  /**
   * Get disclaimer text
   */
  getDisclaimer(config: DisclaimerConfig): string {
    const disclaimer = this.disclaimers[config.type];
    if (!disclaimer) {
      throw new Error(`Unknown disclaimer type: ${config.type}`);
    }

    return disclaimer(config.context);
  }

  /**
   * Generate comprehensive disclaimer for a page
   */
  generatePageDisclaimer(pageType: 'property' | 'planning' | 'area' | 'search'): string {
    const disclaimers: string[] = [];

    switch (pageType) {
      case 'property':
        disclaimers.push(
          this.getDisclaimer({ type: 'property-data' }),
          this.getDisclaimer({ type: 'investment' }),
          this.getDisclaimer({ type: 'third-party', context: 'HM Land Registry' })
        );
        break;

      case 'planning':
        disclaimers.push(
          this.getDisclaimer({ type: 'planning' }),
          this.getDisclaimer({ type: 'accuracy' })
        );
        break;

      case 'area':
        disclaimers.push(
          this.getDisclaimer({ type: 'general' }),
          this.getDisclaimer({ type: 'third-party' })
        );
        break;

      case 'search':
        disclaimers.push(
          this.getDisclaimer({ type: 'general' }),
          this.getDisclaimer({ type: 'accuracy' })
        );
        break;
    }

    return disclaimers.join('\n\n');
  }

  /**
   * Generate HTML disclaimer component
   */
  generateHTMLDisclaimer(config: DisclaimerConfig): string {
    const disclaimer = this.getDisclaimer(config);
    const severityClass = config.severity || 'info';
    const icon = this.getSeverityIcon(severityClass);

    return `
<div class="legal-disclaimer disclaimer-${severityClass} disclaimer-${config.displayLocation || 'inline'}"
     role="alert"
     aria-label="Legal disclaimer">
  <div class="disclaimer-icon">${icon}</div>
  <div class="disclaimer-content">
    ${disclaimer.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
  </div>
  <button class="disclaimer-dismiss" aria-label="Dismiss disclaimer" onclick="this.parentElement.remove()">
    <span aria-hidden="true">&times;</span>
  </button>
</div>

<style>
.legal-disclaimer {
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: 6px;
  display: flex;
  align-items: start;
  gap: 12px;
  position: relative;
  font-size: 14px;
  line-height: 1.5;
}

.disclaimer-info {
  background-color: #e3f2fd;
  border-left: 4px solid #2196f3;
  color: #1565c0;
}

.disclaimer-warning {
  background-color: #fff3e0;
  border-left: 4px solid #ff9800;
  color: #e65100;
}

.disclaimer-critical {
  background-color: #ffebee;
  border-left: 4px solid #f44336;
  color: #c62828;
}

.disclaimer-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.disclaimer-content {
  flex: 1;
}

.disclaimer-content strong {
  font-weight: 600;
}

.disclaimer-dismiss {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.disclaimer-dismiss:hover {
  opacity: 1;
}

.disclaimer-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  z-index: 1000;
}
</style>
`;
  }

  /**
   * Generate JSON disclaimer for API responses
   */
  generateJSONDisclaimer(types: DisclaimerType[]): object {
    const disclaimers: Record<string, string> = {};

    for (const type of types) {
      disclaimers[type] = this.getDisclaimer({ type })
        .replace(/\*\*/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    }

    return {
      disclaimers,
      generated: new Date().toISOString(),
      contact: 'support@nwlondonledger.com',
      termsUrl: 'https://nwlondonledger.com/terms',
      privacyUrl: 'https://nwlondonledger.com/privacy'
    };
  }

  /**
   * Check if disclaimer should be shown
   */
  shouldShowDisclaimer(
    pageType: string,
    userConsent?: boolean,
    lastShown?: Date
  ): boolean {
    // Always show critical disclaimers
    if (pageType === 'investment' || pageType === 'property') {
      return true;
    }

    // Show if no consent recorded
    if (userConsent === undefined) {
      return true;
    }

    // Show periodically (every 30 days)
    if (lastShown) {
      const daysSinceShown = Math.floor(
        (Date.now() - lastShown.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceShown > 30;
    }

    return false;
  }

  /**
   * Get severity icon
   */
  private getSeverityIcon(severity: 'info' | 'warning' | 'critical'): string {
    switch (severity) {
      case 'info':
        return `<svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>`;

      case 'warning':
        return `<svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>`;

      case 'critical':
        return `<svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>`;
    }
  }
}

export const legalDisclaimerSystem = new LegalDisclaimerSystem();