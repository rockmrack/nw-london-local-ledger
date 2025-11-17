/**
 * Data Retention Policy Management
 * Automated data retention and deletion policies
 */

export interface RetentionPolicy {
  dataType: string;
  category: 'personal' | 'public' | 'operational' | 'legal';
  retentionPeriod: number; // days
  legalBasis?: string;
  autoDelete: boolean;
  archiveBeforeDelete?: boolean;
}

export interface DataRetentionLog {
  id: string;
  dataType: string;
  action: 'retained' | 'deleted' | 'archived' | 'anonymized';
  recordCount: number;
  timestamp: Date;
  reason: string;
  performedBy: string;
}

export class DataRetentionManager {
  private readonly policies: RetentionPolicy[] = [
    {
      dataType: 'user_sessions',
      category: 'operational',
      retentionPeriod: 30,
      autoDelete: true,
      legalBasis: 'Legitimate interest for security'
    },
    {
      dataType: 'access_logs',
      category: 'operational',
      retentionPeriod: 90,
      autoDelete: true,
      archiveBeforeDelete: true,
      legalBasis: 'Security and fraud prevention'
    },
    {
      dataType: 'scraping_logs',
      category: 'operational',
      retentionPeriod: 180,
      autoDelete: true,
      legalBasis: 'Compliance monitoring'
    },
    {
      dataType: 'error_logs',
      category: 'operational',
      retentionPeriod: 365,
      autoDelete: true,
      legalBasis: 'System improvement'
    },
    {
      dataType: 'user_accounts',
      category: 'personal',
      retentionPeriod: -1, // Until deletion requested
      autoDelete: false,
      legalBasis: 'User consent'
    },
    {
      dataType: 'email_communications',
      category: 'personal',
      retentionPeriod: 365 * 2, // 2 years
      autoDelete: true,
      archiveBeforeDelete: true,
      legalBasis: 'Legal obligation and legitimate interest'
    },
    {
      dataType: 'property_data',
      category: 'public',
      retentionPeriod: -1, // Continuously updated from source
      autoDelete: false,
      legalBasis: 'Public information'
    },
    {
      dataType: 'planning_applications',
      category: 'public',
      retentionPeriod: -1, // Kept indefinitely as historical record
      autoDelete: false,
      legalBasis: 'Public record'
    },
    {
      dataType: 'financial_records',
      category: 'legal',
      retentionPeriod: 365 * 6, // 6 years UK requirement
      autoDelete: false,
      archiveBeforeDelete: true,
      legalBasis: 'Legal requirement (HMRC)'
    },
    {
      dataType: 'consent_records',
      category: 'legal',
      retentionPeriod: 365 * 6, // 6 years for evidence
      autoDelete: false,
      legalBasis: 'Legal compliance (GDPR)'
    },
    {
      dataType: 'data_subject_requests',
      category: 'legal',
      retentionPeriod: 365 * 3, // 3 years
      autoDelete: false,
      archiveBeforeDelete: true,
      legalBasis: 'Regulatory compliance'
    },
    {
      dataType: 'cached_api_responses',
      category: 'operational',
      retentionPeriod: 7,
      autoDelete: true,
      legalBasis: 'Performance optimization'
    }
  ];

  /**
   * Get retention policy for a data type
   */
  getPolicy(dataType: string): RetentionPolicy | undefined {
    return this.policies.find(p => p.dataType === dataType);
  }

  /**
   * Get all policies by category
   */
  getPoliciesByCategory(category: RetentionPolicy['category']): RetentionPolicy[] {
    return this.policies.filter(p => p.category === category);
  }

  /**
   * Check if data should be deleted
   */
  shouldDelete(dataType: string, dataAge: number): boolean {
    const policy = this.getPolicy(dataType);
    if (!policy || !policy.autoDelete) return false;
    if (policy.retentionPeriod === -1) return false;

    return dataAge > policy.retentionPeriod;
  }

  /**
   * Generate retention schedule SQL
   */
  generateRetentionSQL(): string {
    const queries: string[] = [];

    for (const policy of this.policies) {
      if (policy.autoDelete && policy.retentionPeriod > 0) {
        const tableName = this.dataTypeToTable(policy.dataType);

        if (policy.archiveBeforeDelete) {
          // Archive before deletion
          queries.push(`
-- Archive ${policy.dataType} older than ${policy.retentionPeriod} days
INSERT INTO archive.${tableName}
SELECT * FROM public.${tableName}
WHERE created_at < CURRENT_DATE - INTERVAL '${policy.retentionPeriod} days'
ON CONFLICT DO NOTHING;
`);
        }

        // Delete old records
        queries.push(`
-- Delete ${policy.dataType} older than ${policy.retentionPeriod} days
DELETE FROM public.${tableName}
WHERE created_at < CURRENT_DATE - INTERVAL '${policy.retentionPeriod} days';
`);
      }
    }

    return queries.join('\n');
  }

  /**
   * Generate data retention report
   */
  async generateRetentionReport(): Promise<{
    policies: RetentionPolicy[];
    summary: Record<string, any>;
    compliance: {
      gdprCompliant: boolean;
      ukLawCompliant: boolean;
      issues: string[];
    };
  }> {
    const summary = {
      totalPolicies: this.policies.length,
      autoDeleteEnabled: this.policies.filter(p => p.autoDelete).length,
      indefiniteRetention: this.policies.filter(p => p.retentionPeriod === -1).length,
      byCategory: {
        personal: this.policies.filter(p => p.category === 'personal').length,
        public: this.policies.filter(p => p.category === 'public').length,
        operational: this.policies.filter(p => p.category === 'operational').length,
        legal: this.policies.filter(p => p.category === 'legal').length
      }
    };

    const issues: string[] = [];

    // Check for compliance issues
    const personalDataPolicies = this.getPoliciesByCategory('personal');
    for (const policy of personalDataPolicies) {
      if (!policy.legalBasis) {
        issues.push(`No legal basis specified for ${policy.dataType}`);
      }
      if (policy.retentionPeriod === -1 && policy.autoDelete) {
        issues.push(`Indefinite retention with auto-delete for ${policy.dataType}`);
      }
    }

    // Check legal requirements
    const financialPolicy = this.getPolicy('financial_records');
    if (!financialPolicy || financialPolicy.retentionPeriod < 365 * 6) {
      issues.push('Financial records must be retained for 6 years (UK law)');
    }

    return {
      policies: this.policies,
      summary,
      compliance: {
        gdprCompliant: issues.length === 0,
        ukLawCompliant: !issues.some(i => i.includes('UK law')),
        issues
      }
    };
  }

  /**
   * Log retention action
   */
  async logRetentionAction(log: Omit<DataRetentionLog, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: DataRetentionLog = {
      ...log,
      id: this.generateId(),
      timestamp: new Date()
    };

    // In production, this would write to database
    console.log('[Data Retention]', JSON.stringify(logEntry));
  }

  /**
   * Execute retention policies
   */
  async executeRetentionPolicies(dryRun: boolean = true): Promise<{
    processed: number;
    deleted: number;
    archived: number;
    errors: string[];
  }> {
    const results = {
      processed: 0,
      deleted: 0,
      archived: 0,
      errors: [] as string[]
    };

    for (const policy of this.policies) {
      if (!policy.autoDelete || policy.retentionPeriod === -1) continue;

      try {
        results.processed++;

        if (!dryRun) {
          // In production, this would execute actual deletion/archival
          if (policy.archiveBeforeDelete) {
            results.archived++;
            await this.logRetentionAction({
              dataType: policy.dataType,
              action: 'archived',
              recordCount: 0, // Would be actual count
              reason: `Retention policy: ${policy.retentionPeriod} days`,
              performedBy: 'system'
            });
          }

          results.deleted++;
          await this.logRetentionAction({
            dataType: policy.dataType,
            action: 'deleted',
            recordCount: 0, // Would be actual count
            reason: `Retention policy: ${policy.retentionPeriod} days`,
            performedBy: 'system'
          });
        }
      } catch (error) {
        results.errors.push(`Failed to process ${policy.dataType}: ${error}`);
      }
    }

    return results;
  }

  /**
   * Helper: Convert data type to table name
   */
  private dataTypeToTable(dataType: string): string {
    return dataType.replace(/_/g, '_');
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return `ret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const dataRetentionManager = new DataRetentionManager();