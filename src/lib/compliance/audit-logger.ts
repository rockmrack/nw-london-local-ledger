/**
 * Audit Logger
 * Comprehensive audit logging for compliance tracking
 */

import winston from 'winston';
// Note: Install winston-daily-rotate-file for production use
// import DailyRotateFile from 'winston-daily-rotate-file';

export interface AuditLog {
  id: string;
  timestamp: Date;
  category: 'data-collection' | 'consent' | 'access' | 'modification' | 'deletion' | 'security';
  action: string;
  actor: string;
  subject?: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'partial';
  ipAddress?: string;
  userAgent?: string;
  compliance?: {
    gdpr?: boolean;
    pecr?: boolean;
    foi?: boolean;
  };
}

export class AuditLogger {
  private logger: winston.Logger;
  private readonly logDir = 'logs/audit';

  constructor() {
    // Create Winston logger with rotation
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint()
      ),
      transports: [
        // Audit logs - keep for 7 years for compliance
        // Uncomment when winston-daily-rotate-file is installed
        /* new DailyRotateFile({
          filename: 'audit-%DATE%.log',
          dirname: this.logDir,
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '2555d', // 7 years
          auditFile: 'audit-log-audit.json'
        }), */
        // For now, use regular file transport
        new winston.transports.File({
          filename: 'audit.log',
          dirname: this.logDir,
          maxsize: 100000000, // 100MB
          maxFiles: 10
        }),
        // Error logs
        new winston.transports.File({
          filename: 'audit-errors.log',
          dirname: this.logDir,
          level: 'error'
        })
      ]
    });

    // Add console transport in development
    if (process.env.NODE_ENV === 'development') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  /**
   * Log data collection activity
   */
  async logDataCollection(params: {
    source: string;
    method: 'api' | 'scraping' | 'foi';
    recordsCollected: number;
    success: boolean;
    compliance: {
      robotsTxt?: boolean;
      termsOfService?: boolean;
      consent?: boolean;
      rateLimit?: boolean;
    };
    error?: string;
  }): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category: 'data-collection',
      action: `Collected data from ${params.source}`,
      actor: 'system',
      subject: params.source,
      details: {
        method: params.method,
        recordsCollected: params.recordsCollected,
        compliance: params.compliance,
        error: params.error
      },
      result: params.success ? 'success' : 'failure',
      compliance: {
        gdpr: true,
        pecr: params.compliance.consent !== false
      }
    };

    await this.write(log);
  }

  /**
   * Log consent changes
   */
  async logConsentChange(params: {
    userId?: string;
    domain?: string;
    action: 'grant' | 'revoke' | 'update';
    consentType: 'cookies' | 'scraping' | 'marketing';
    details: Record<string, any>;
  }): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category: 'consent',
      action: `${params.action} consent for ${params.consentType}`,
      actor: params.userId || 'user',
      subject: params.domain,
      details: params.details,
      result: 'success',
      compliance: {
        gdpr: true,
        pecr: true
      }
    };

    await this.write(log);
  }

  /**
   * Log data access requests
   */
  async logDataAccess(params: {
    userId?: string;
    resource: string;
    action: string;
    purpose?: string;
    authorized: boolean;
  }): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category: 'access',
      action: params.action,
      actor: params.userId || 'anonymous',
      subject: params.resource,
      details: {
        purpose: params.purpose,
        authorized: params.authorized
      },
      result: params.authorized ? 'success' : 'failure'
    };

    await this.write(log);
  }

  /**
   * Log security events
   */
  async logSecurityEvent(params: {
    event: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category: 'security',
      action: params.event,
      actor: 'system',
      details: {
        severity: params.severity,
        ...params.details
      },
      result: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    };

    await this.write(log);

    // Alert for high/critical events
    if (params.severity === 'high' || params.severity === 'critical') {
      await this.sendSecurityAlert(log);
    }
  }

  /**
   * Log data retention actions
   */
  async logRetentionAction(params: {
    dataType: string;
    action: 'delete' | 'archive' | 'anonymize';
    recordCount: number;
    reason: string;
    automated: boolean;
  }): Promise<void> {
    const log: AuditLog = {
      id: this.generateId(),
      timestamp: new Date(),
      category: 'deletion',
      action: `${params.action} ${params.dataType}`,
      actor: params.automated ? 'system-retention' : 'admin',
      subject: params.dataType,
      details: {
        recordCount: params.recordCount,
        reason: params.reason,
        automated: params.automated
      },
      result: 'success',
      compliance: {
        gdpr: true
      }
    };

    await this.write(log);
  }

  /**
   * Search audit logs
   */
  async searchLogs(criteria: {
    startDate?: Date;
    endDate?: Date;
    category?: AuditLog['category'];
    actor?: string;
    subject?: string;
    result?: AuditLog['result'];
  }): Promise<AuditLog[]> {
    // In production, this would query from database
    // For now, parse from log files
    const logs: AuditLog[] = [];

    // Implementation would read and filter logs based on criteria
    console.log('Searching logs with criteria:', criteria);

    return logs;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: Record<string, any>;
    details: AuditLog[];
    compliance: {
      gdprCompliant: boolean;
      pecrCompliant: boolean;
      issues: string[];
    };
  }> {
    const logs = await this.searchLogs({ startDate, endDate });

    // Analyze logs for compliance
    const dataCollectionLogs = logs.filter(l => l.category === 'data-collection');
    const consentLogs = logs.filter(l => l.category === 'consent');
    const securityLogs = logs.filter(l => l.category === 'security');

    const issues: string[] = [];

    // Check for unauthorized data collection
    const unauthorizedCollection = dataCollectionLogs.filter(
      l => l.compliance?.gdpr === false
    );
    if (unauthorizedCollection.length > 0) {
      issues.push(`${unauthorizedCollection.length} unauthorized data collection events`);
    }

    // Check for missing consent
    const missingConsent = dataCollectionLogs.filter(
      l => l.compliance?.pecr === false
    );
    if (missingConsent.length > 0) {
      issues.push(`${missingConsent.length} data collection events without consent`);
    }

    // Check for security incidents
    const criticalSecurity = securityLogs.filter(
      l => l.details.severity === 'critical'
    );
    if (criticalSecurity.length > 0) {
      issues.push(`${criticalSecurity.length} critical security events`);
    }

    return {
      summary: {
        totalEvents: logs.length,
        dataCollection: dataCollectionLogs.length,
        consentChanges: consentLogs.length,
        securityEvents: securityLogs.length,
        failures: logs.filter(l => l.result === 'failure').length
      },
      details: logs,
      compliance: {
        gdprCompliant: unauthorizedCollection.length === 0,
        pecrCompliant: missingConsent.length === 0,
        issues
      }
    };
  }

  /**
   * Export logs for regulatory review
   */
  async exportForRegulator(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv'
  ): Promise<string> {
    const logs = await this.searchLogs({ startDate, endDate });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else {
      // Convert to CSV
      const headers = [
        'ID',
        'Timestamp',
        'Category',
        'Action',
        'Actor',
        'Subject',
        'Result',
        'GDPR Compliant',
        'PECR Compliant'
      ];

      const rows = logs.map(log => [
        log.id,
        log.timestamp.toISOString(),
        log.category,
        log.action,
        log.actor,
        log.subject || '',
        log.result,
        log.compliance?.gdpr ? 'Yes' : 'No',
        log.compliance?.pecr ? 'Yes' : 'No'
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }

  /**
   * Write log entry
   */
  private async write(log: AuditLog): Promise<void> {
    this.logger.info('AUDIT', log);

    // Also write to database in production
    if (process.env.NODE_ENV === 'production') {
      // await db.insert('audit_logs', log);
    }
  }

  /**
   * Send security alert
   */
  private async sendSecurityAlert(log: AuditLog): Promise<void> {
    // In production, send email/Slack notification
    console.error('SECURITY ALERT:', log);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();