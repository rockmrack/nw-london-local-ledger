/**
 * Compliance System Initialization
 * Central initialization for all legal and compliance systems
 */

import { initializeLegalCompliance } from '../legal';
import { initializeScrapingCompliance } from '../scraping/compliance';
import { dataSourceManager } from '../data-sources/source-manager';
import { auditLogger } from './audit-logger';

export interface ComplianceConfig {
  enableCookieConsent: boolean;
  enableDataRetention: boolean;
  enableAuditLogging: boolean;
  enableScrapingCompliance: boolean;
  strictMode: boolean;
  environment: 'development' | 'staging' | 'production';
}

export class ComplianceSystem {
  private config: ComplianceConfig;
  private initialized = false;

  constructor(config: Partial<ComplianceConfig> = {}) {
    this.config = {
      enableCookieConsent: true,
      enableDataRetention: true,
      enableAuditLogging: true,
      enableScrapingCompliance: true,
      strictMode: process.env.NODE_ENV === 'production',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...config
    };
  }

  /**
   * Initialize all compliance systems
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('Compliance system already initialized');
      return;
    }

    console.log('🔒 Initializing Compliance Systems...');

    try {
      // 1. Initialize legal compliance
      if (this.config.enableCookieConsent || this.config.enableDataRetention) {
        const legal = initializeLegalCompliance();
        console.log('✅ Legal compliance initialized');

        await auditLogger.logSecurityEvent({
          event: 'Legal compliance initialized',
          severity: 'low',
          details: {
            cookieConsent: this.config.enableCookieConsent,
            dataRetention: this.config.enableDataRetention
          }
        });
      }

      // 2. Initialize scraping compliance
      if (this.config.enableScrapingCompliance) {
        const scraping = initializeScrapingCompliance();
        console.log('✅ Scraping compliance initialized');

        await auditLogger.logSecurityEvent({
          event: 'Scraping compliance initialized',
          severity: 'low',
          details: {
            respectRobots: true,
            checkTerms: true,
            requireConsent: true
          }
        });
      }

      // 3. Verify data sources compliance
      await this.verifyDataSources();

      // 4. Start audit logging
      if (this.config.enableAuditLogging) {
        console.log('✅ Audit logging active');

        await auditLogger.logSecurityEvent({
          event: 'Audit logging started',
          severity: 'low',
          details: {
            environment: this.config.environment,
            strictMode: this.config.strictMode
          }
        });
      }

      // 5. Schedule compliance checks
      this.scheduleComplianceChecks();

      this.initialized = true;
      console.log('🎉 Compliance systems initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize compliance systems:', error);

      await auditLogger.logSecurityEvent({
        event: 'Compliance initialization failed',
        severity: 'critical',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      if (this.config.strictMode) {
        throw new Error('Compliance initialization failed in strict mode');
      }
    }
  }

  /**
   * Verify all data sources are compliant
   */
  private async verifyDataSources(): Promise<void> {
    const sources = ['land-registry', 'epc-register', 'police-api', 'tfl-api'];

    for (const sourceId of sources) {
      const compliance = await dataSourceManager.verifyCompliance(sourceId);

      if (!compliance.compliant) {
        console.warn(`⚠️ Data source ${sourceId} has compliance issues:`, compliance.issues);

        await auditLogger.logDataCollection({
          source: sourceId,
          method: 'api',
          recordsCollected: 0,
          success: false,
          compliance: {
            robotsTxt: false,
            termsOfService: false
          },
          error: compliance.issues.join(', ')
        });

        if (this.config.strictMode) {
          throw new Error(`Data source ${sourceId} is not compliant`);
        }
      } else {
        console.log(`✅ Data source ${sourceId} is compliant`);
      }
    }
  }

  /**
   * Schedule regular compliance checks
   */
  private scheduleComplianceChecks(): void {
    // Daily compliance check
    setInterval(async () => {
      await this.runComplianceCheck();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Weekly comprehensive audit
    setInterval(async () => {
      await this.runComprehensiveAudit();
    }, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  /**
   * Run daily compliance check
   */
  async runComplianceCheck(): Promise<{
    compliant: boolean;
    issues: string[];
  }> {
    console.log('🔍 Running compliance check...');
    const issues: string[] = [];

    try {
      // Check cookie consent
      if (this.config.enableCookieConsent) {
        // Verify cookie consent banner is working
        // This would be implemented with actual checks
      }

      // Check data retention
      if (this.config.enableDataRetention) {
        const { dataRetentionManager } = await import('../legal/data-retention');
        const result = await dataRetentionManager.executeRetentionPolicies(true); // dry run

        if (result.errors.length > 0) {
          issues.push(...result.errors);
        }
      }

      // Check scraping compliance
      if (this.config.enableScrapingCompliance) {
        const { robotsChecker } = await import('../scraping/compliance/robots-checker');
        // Sample check on key domains
        const testDomains = [
          'https://landregistry.gov.uk',
          'https://epc.opendatacommunities.org'
        ];

        for (const url of testDomains) {
          const result = await robotsChecker.checkUrl(url);
          if (!result.allowed) {
            issues.push(`Robots.txt blocks access to ${url}`);
          }
        }
      }

      await auditLogger.logSecurityEvent({
        event: 'Daily compliance check completed',
        severity: issues.length > 0 ? 'medium' : 'low',
        details: {
          issues,
          compliant: issues.length === 0
        }
      });

      return {
        compliant: issues.length === 0,
        issues
      };

    } catch (error) {
      console.error('Compliance check failed:', error);
      issues.push('Compliance check failed to complete');

      return {
        compliant: false,
        issues
      };
    }
  }

  /**
   * Run comprehensive weekly audit
   */
  async runComprehensiveAudit(): Promise<void> {
    console.log('📊 Running comprehensive audit...');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    try {
      // Generate compliance report
      const report = await auditLogger.generateComplianceReport(startDate, endDate);

      // Log audit results
      await auditLogger.logSecurityEvent({
        event: 'Weekly compliance audit completed',
        severity: report.compliance.issues.length > 0 ? 'medium' : 'low',
        details: {
          summary: report.summary,
          issues: report.compliance.issues,
          gdprCompliant: report.compliance.gdprCompliant,
          pecrCompliant: report.compliance.pecrCompliant
        }
      });

      // Send report if issues found
      if (report.compliance.issues.length > 0) {
        await this.sendComplianceAlert(report);
      }

    } catch (error) {
      console.error('Comprehensive audit failed:', error);

      await auditLogger.logSecurityEvent({
        event: 'Weekly compliance audit failed',
        severity: 'high',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * Send compliance alert
   */
  private async sendComplianceAlert(report: any): Promise<void> {
    // In production, send email/Slack notification
    console.warn('⚠️ Compliance issues detected:', report.compliance.issues);
  }

  /**
   * Get compliance status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    config: ComplianceConfig;
    currentStatus: {
      legal: boolean;
      scraping: boolean;
      audit: boolean;
      dataSources: boolean;
    };
    lastCheck?: Date;
    issues: string[];
  }> {
    const checkResult = await this.runComplianceCheck();

    return {
      initialized: this.initialized,
      config: this.config,
      currentStatus: {
        legal: this.config.enableCookieConsent && this.config.enableDataRetention,
        scraping: this.config.enableScrapingCompliance,
        audit: this.config.enableAuditLogging,
        dataSources: checkResult.compliant
      },
      lastCheck: new Date(),
      issues: checkResult.issues
    };
  }

  /**
   * Shutdown compliance systems
   */
  async shutdown(): Promise<void> {
    console.log('🔒 Shutting down compliance systems...');

    await auditLogger.logSecurityEvent({
      event: 'Compliance system shutdown',
      severity: 'low',
      details: {
        environment: this.config.environment
      }
    });

    this.initialized = false;
  }
}

// Export singleton instance
export const complianceSystem = new ComplianceSystem();

// Auto-initialize in production
if (process.env.NODE_ENV === 'production') {
  complianceSystem.initialize().catch(error => {
    console.error('Failed to auto-initialize compliance:', error);
    process.exit(1); // Exit in production if compliance fails
  });
}