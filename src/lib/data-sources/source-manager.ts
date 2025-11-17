/**
 * Data Source Manager
 * Manages data sources, decides between APIs and scraping
 */

import dataSourcesConfig from '../../../config/data-sources.json';
import { ethicalScraper } from '../scraping/compliance/ethical-scraper';
import axios from 'axios';

export interface DataSource {
  id: string;
  name: string;
  type: 'api' | 'scraping' | 'hybrid';
  category: string;
  endpoints: Record<string, EndpointConfig>;
  compliance: ComplianceInfo;
  reliability: ReliabilityInfo;
  fallback?: FallbackStrategy;
}

export interface EndpointConfig {
  url: string;
  method: 'api' | 'scraping';
  auth: 'none' | 'api-key' | 'oauth' | 'required';
  rateLimit: number; // requests per second
  cost: number;
  costUnit?: string;
  license: string;
}

export interface ComplianceInfo {
  gdpr: boolean;
  attribution?: string;
  restrictions: string[];
  robotsTxt?: boolean;
  termsChecked?: boolean;
  consentStatus?: 'explicit' | 'implicit' | 'none';
}

export interface ReliabilityInfo {
  uptime: number; // percentage
  updateFrequency: string;
  dataQuality: 'official' | 'verified' | 'unverified';
}

export interface FallbackStrategy {
  method: 'foi-request' | 'alternative-source' | 'cache';
  template?: string;
  alternativeSourceId?: string;
}

export interface DataCollectionDecision {
  sourceId: string;
  method: 'api' | 'scraping' | 'foi' | 'unavailable';
  endpoint?: EndpointConfig;
  cost: number;
  estimatedTime: number; // seconds
  reliability: number;
  compliance: boolean;
  reasons: string[];
}

export class DataSourceManager {
  private sources: Map<string, DataSource>;
  private costTracker: Map<string, number> = new Map();
  private readonly config = dataSourcesConfig;

  constructor() {
    this.sources = new Map();
    this.loadSources();
  }

  /**
   * Load data sources from configuration
   */
  private loadSources(): void {
    for (const source of this.config.sources) {
      this.sources.set(source.id, source as DataSource);
    }
  }

  /**
   * Get a data source by ID
   */
  getSource(id: string): DataSource | undefined {
    return this.sources.get(id);
  }

  /**
   * Get sources by category
   */
  getSourcesByCategory(category: string): DataSource[] {
    return Array.from(this.sources.values()).filter(s => s.category === category);
  }

  /**
   * Decide best method for data collection
   */
  async decideCollectionMethod(
    category: string,
    requirements: {
      freshness?: 'real-time' | 'daily' | 'weekly' | 'monthly';
      budget?: number;
      compliance?: boolean;
      reliability?: number;
    } = {}
  ): Promise<DataCollectionDecision> {
    const sources = this.getSourcesByCategory(category);

    if (sources.length === 0) {
      return {
        sourceId: '',
        method: 'unavailable',
        cost: 0,
        estimatedTime: 0,
        reliability: 0,
        compliance: false,
        reasons: ['No data source available for category']
      };
    }

    // Score each source
    const scoredSources = sources.map(source => {
      let score = 0;
      const reasons: string[] = [];

      // Prefer APIs over scraping
      if (source.type === 'api') {
        score += 50;
        reasons.push('API available');
      }

      // Check compliance
      if (source.compliance.gdpr) {
        score += 20;
      }

      // Check reliability
      if (source.reliability.uptime >= (requirements.reliability || 90)) {
        score += 30;
        reasons.push(`High reliability: ${source.reliability.uptime}%`);
      }

      // Check cost
      const avgCost = this.calculateAverageCost(source);
      if (requirements.budget && avgCost > requirements.budget) {
        score -= 50;
        reasons.push(`Exceeds budget: £${avgCost}`);
      } else if (avgCost === 0) {
        score += 20;
        reasons.push('Free data source');
      }

      // Check data freshness
      if (this.matchesFreshness(source.reliability.updateFrequency, requirements.freshness)) {
        score += 10;
        reasons.push('Meets freshness requirements');
      }

      return { source, score, reasons };
    });

    // Sort by score
    scoredSources.sort((a, b) => b.score - a.score);

    const bestSource = scoredSources[0];

    // Determine method
    let method: DataCollectionDecision['method'] = 'unavailable';
    let endpoint: EndpointConfig | undefined;

    if (bestSource.score > 0) {
      if (bestSource.source.type === 'api') {
        method = 'api';
        // Get first available endpoint
        endpoint = Object.values(bestSource.source.endpoints)[0];
      } else if (bestSource.source.type === 'scraping') {
        method = 'scraping';
        endpoint = Object.values(bestSource.source.endpoints)[0];
      } else if (bestSource.source.fallback) {
        method = 'foi';
      }
    }

    return {
      sourceId: bestSource.source.id,
      method,
      endpoint,
      cost: this.calculateAverageCost(bestSource.source),
      estimatedTime: this.estimateCollectionTime(method),
      reliability: bestSource.source.reliability.uptime,
      compliance: bestSource.source.compliance.gdpr,
      reasons: bestSource.reasons
    };
  }

  /**
   * Check if official API exists
   */
  async checkForOfficialApi(domain: string): Promise<{
    exists: boolean;
    apiUrl?: string;
    documentation?: string;
    requiresAuth?: boolean;
  }> {
    // Check known APIs
    const knownApis: Record<string, any> = {
      'landregistry.gov.uk': {
        exists: true,
        apiUrl: 'https://landregistry.data.gov.uk',
        documentation: 'https://landregistry.data.gov.uk/api',
        requiresAuth: false
      },
      'epc.opendatacommunities.org': {
        exists: true,
        apiUrl: 'https://epc.opendatacommunities.org/api/v1',
        documentation: 'https://epc.opendatacommunities.org/docs/api',
        requiresAuth: true
      },
      'police.uk': {
        exists: true,
        apiUrl: 'https://data.police.uk/api',
        documentation: 'https://data.police.uk/docs',
        requiresAuth: false
      },
      'api.tfl.gov.uk': {
        exists: true,
        apiUrl: 'https://api.tfl.gov.uk',
        documentation: 'https://api-portal.tfl.gov.uk',
        requiresAuth: true
      }
    };

    const normalizedDomain = domain.replace('www.', '');

    if (knownApis[normalizedDomain]) {
      return knownApis[normalizedDomain];
    }

    // Check common API patterns
    const apiPatterns = [
      `https://api.${normalizedDomain}`,
      `https://${normalizedDomain}/api`,
      `https://${normalizedDomain}/api/v1`,
      `https://data.${normalizedDomain}`,
      `https://${normalizedDomain}/opendata`
    ];

    for (const pattern of apiPatterns) {
      try {
        const response = await axios.head(pattern, {
          timeout: 5000,
          validateStatus: (status) => status < 500
        });

        if (response.status === 200 || response.status === 401) {
          return {
            exists: true,
            apiUrl: pattern,
            requiresAuth: response.status === 401
          };
        }
      } catch (error) {
        // Continue checking other patterns
      }
    }

    return { exists: false };
  }

  /**
   * Track API usage costs
   */
  trackCost(sourceId: string, cost: number): void {
    const current = this.costTracker.get(sourceId) || 0;
    this.costTracker.set(sourceId, current + cost);
  }

  /**
   * Get cost report
   */
  getCostReport(): {
    total: number;
    bySource: Record<string, number>;
    projectedMonthly: number;
  } {
    const bySource: Record<string, number> = {};
    let total = 0;

    this.costTracker.forEach((cost, sourceId) => {
      bySource[sourceId] = cost;
      total += cost;
    });

    // Simple projection based on current usage
    const daysTracked = 30; // Assume 30 days
    const projectedMonthly = total;

    return {
      total,
      bySource,
      projectedMonthly
    };
  }

  /**
   * Create audit trail for data collection
   */
  createAuditEntry(
    sourceId: string,
    method: string,
    success: boolean,
    details?: any
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      sourceId,
      method,
      success,
      details,
      compliance: this.sources.get(sourceId)?.compliance
    };

    // In production, write to audit log
    console.log('[Data Source Audit]', JSON.stringify(entry));
  }

  /**
   * Verify compliance for a source
   */
  async verifyCompliance(sourceId: string): Promise<{
    compliant: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const source = this.sources.get(sourceId);

    if (!source) {
      return {
        compliant: false,
        issues: ['Source not found'],
        recommendations: []
      };
    }

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check GDPR compliance
    if (!source.compliance.gdpr) {
      issues.push('Not GDPR compliant');
      recommendations.push('Review data protection requirements');
    }

    // Check consent status
    if (source.type === 'scraping' && source.compliance.consentStatus === 'none') {
      issues.push('No consent for scraping');
      recommendations.push('Obtain consent or use API if available');
    }

    // Check attribution
    if (source.compliance.attribution && !source.compliance.attribution) {
      issues.push('Attribution required but not configured');
      recommendations.push(`Add attribution: ${source.compliance.attribution}`);
    }

    // For scraping sources, check robots.txt
    if (source.type === 'scraping') {
      for (const endpoint of Object.values(source.endpoints)) {
        if (endpoint.method === 'scraping') {
          const compliance = await ethicalScraper.makeScrapingDecision({
            url: endpoint.url,
            respectRobots: true,
            checkTerms: true
          });

          if (!compliance.canScrape) {
            issues.push(`Cannot scrape ${endpoint.url}: ${compliance.reasons.join(', ')}`);
            if (compliance.alternatives) {
              recommendations.push(...compliance.alternatives);
            }
          }
        }
      }
    }

    return {
      compliant: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Helper: Calculate average cost for a source
   */
  private calculateAverageCost(source: DataSource): number {
    const costs = Object.values(source.endpoints).map(e => e.cost);
    return costs.reduce((a, b) => a + b, 0) / costs.length;
  }

  /**
   * Helper: Check if update frequency matches requirements
   */
  private matchesFreshness(
    updateFrequency: string,
    required?: 'real-time' | 'daily' | 'weekly' | 'monthly'
  ): boolean {
    if (!required) return true;

    const freshnessLevels: Record<string, number> = {
      'real-time': 4,
      'daily': 3,
      'weekly': 2,
      'monthly': 1
    };

    const sourceFreshness = freshnessLevels[updateFrequency] || 0;
    const requiredFreshness = freshnessLevels[required] || 0;

    return sourceFreshness >= requiredFreshness;
  }

  /**
   * Helper: Estimate collection time
   */
  private estimateCollectionTime(method: string): number {
    switch (method) {
      case 'api':
        return 1; // 1 second for API
      case 'scraping':
        return 5; // 5 seconds for scraping
      case 'foi':
        return 30 * 24 * 60 * 60; // 30 days for FOI
      default:
        return 0;
    }
  }
}

export const dataSourceManager = new DataSourceManager();