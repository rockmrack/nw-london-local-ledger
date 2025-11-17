/**
 * Alert Manager for detecting and notifying about performance issues
 */

import { EventEmitter } from 'events';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata?: Record<string, any>;
  timestamp: number;
  resolved?: boolean;
  resolvedAt?: number;
}

export enum AlertType {
  SLOW_QUERY = 'slow_query',
  SLOW_API = 'slow_api',
  HIGH_ERROR_RATE = 'high_error_rate',
  HIGH_MEMORY = 'high_memory',
  HIGH_CPU = 'high_cpu',
  CONNECTION_POOL_EXHAUSTED = 'connection_pool_exhausted',
  CACHE_MISS_RATE = 'cache_miss_rate',
  QUEUE_BACKLOG = 'queue_backlog',
  SYSTEM_ERROR = 'system_error'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

interface AlertThreshold {
  value: number;
  severity: AlertSeverity;
  duration?: number; // How long the condition must persist
}

interface AlertRule {
  type: AlertType;
  thresholds: AlertThreshold[];
  cooldown: number; // Minimum time between alerts of this type (ms)
  enabled: boolean;
}

export class AlertManager extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private lastAlertTime: Map<AlertType, number> = new Map();
  private rules: Map<AlertType, AlertRule> = new Map();
  private metricBuffers: Map<string, number[]> = new Map();

  constructor(config: any) {
    super();
    this.initializeRules(config);
  }

  private initializeRules(config: any): void {
    // Slow Query Rules
    this.rules.set(AlertType.SLOW_QUERY, {
      type: AlertType.SLOW_QUERY,
      thresholds: [
        { value: config.slowQueryThreshold, severity: AlertSeverity.WARNING },
        { value: config.slowQueryThreshold * 5, severity: AlertSeverity.ERROR },
        { value: config.slowQueryThreshold * 10, severity: AlertSeverity.CRITICAL }
      ],
      cooldown: 60000, // 1 minute
      enabled: true
    });

    // Slow API Rules
    this.rules.set(AlertType.SLOW_API, {
      type: AlertType.SLOW_API,
      thresholds: [
        { value: config.slowApiThreshold, severity: AlertSeverity.WARNING },
        { value: config.slowApiThreshold * 2, severity: AlertSeverity.ERROR },
        { value: config.slowApiThreshold * 5, severity: AlertSeverity.CRITICAL }
      ],
      cooldown: 30000, // 30 seconds
      enabled: true
    });

    // High Error Rate Rules
    this.rules.set(AlertType.HIGH_ERROR_RATE, {
      type: AlertType.HIGH_ERROR_RATE,
      thresholds: [
        { value: config.errorRateThreshold, severity: AlertSeverity.WARNING },
        { value: config.errorRateThreshold * 2, severity: AlertSeverity.ERROR },
        { value: config.errorRateThreshold * 3, severity: AlertSeverity.CRITICAL }
      ],
      cooldown: 300000, // 5 minutes
      enabled: true
    });

    // High Memory Rules
    this.rules.set(AlertType.HIGH_MEMORY, {
      type: AlertType.HIGH_MEMORY,
      thresholds: [
        { value: config.memoryThreshold, severity: AlertSeverity.WARNING },
        { value: 90, severity: AlertSeverity.ERROR },
        { value: 95, severity: AlertSeverity.CRITICAL }
      ],
      cooldown: 120000, // 2 minutes
      enabled: true
    });

    // High CPU Rules
    this.rules.set(AlertType.HIGH_CPU, {
      type: AlertType.HIGH_CPU,
      thresholds: [
        { value: config.cpuThreshold, severity: AlertSeverity.WARNING },
        { value: 90, severity: AlertSeverity.ERROR },
        { value: 95, severity: AlertSeverity.CRITICAL }
      ],
      cooldown: 120000, // 2 minutes
      enabled: true
    });
  }

  /**
   * Check slow query and create alert if needed
   */
  checkSlowQuery(query: string, duration: number, metadata?: Record<string, any>): void {
    const rule = this.rules.get(AlertType.SLOW_QUERY);
    if (!rule || !rule.enabled) return;

    const severity = this.getSeverityForValue(duration, rule.thresholds);
    if (!severity) return;

    if (!this.canCreateAlert(AlertType.SLOW_QUERY, rule.cooldown)) return;

    const alert = this.createAlert(
      AlertType.SLOW_QUERY,
      severity,
      `Slow database query detected`,
      `Query took ${duration}ms to execute: ${query.substring(0, 100)}...`,
      { query, duration, ...metadata }
    );

    this.triggerAlert(alert);
  }

  /**
   * Check slow API and create alert if needed
   */
  checkSlowApi(endpoint: string, duration: number, metadata?: Record<string, any>): void {
    const rule = this.rules.get(AlertType.SLOW_API);
    if (!rule || !rule.enabled) return;

    const severity = this.getSeverityForValue(duration, rule.thresholds);
    if (!severity) return;

    if (!this.canCreateAlert(AlertType.SLOW_API, rule.cooldown)) return;

    const alert = this.createAlert(
      AlertType.SLOW_API,
      severity,
      `Slow API endpoint detected`,
      `Endpoint ${endpoint} took ${duration}ms to respond`,
      { endpoint, duration, ...metadata }
    );

    this.triggerAlert(alert);
  }

  /**
   * Check memory usage
   */
  checkMemoryUsage(usagePercent: number): void {
    const rule = this.rules.get(AlertType.HIGH_MEMORY);
    if (!rule || !rule.enabled) return;

    // Use moving average to prevent flapping
    this.updateMetricBuffer('memory', usagePercent);
    const avgUsage = this.getBufferAverage('memory');

    const severity = this.getSeverityForValue(avgUsage, rule.thresholds);
    if (!severity) return;

    if (!this.canCreateAlert(AlertType.HIGH_MEMORY, rule.cooldown)) return;

    const alert = this.createAlert(
      AlertType.HIGH_MEMORY,
      severity,
      `High memory usage detected`,
      `Memory usage is at ${avgUsage.toFixed(1)}%`,
      { usagePercent: avgUsage }
    );

    this.triggerAlert(alert);
  }

  /**
   * Check CPU usage
   */
  checkCpuUsage(usagePercent: number): void {
    const rule = this.rules.get(AlertType.HIGH_CPU);
    if (!rule || !rule.enabled) return;

    // Use moving average to prevent flapping
    this.updateMetricBuffer('cpu', usagePercent);
    const avgUsage = this.getBufferAverage('cpu');

    const severity = this.getSeverityForValue(avgUsage, rule.thresholds);
    if (!severity) return;

    if (!this.canCreateAlert(AlertType.HIGH_CPU, rule.cooldown)) return;

    const alert = this.createAlert(
      AlertType.HIGH_CPU,
      severity,
      `High CPU usage detected`,
      `CPU usage is at ${avgUsage.toFixed(1)}%`,
      { usagePercent: avgUsage }
    );

    this.triggerAlert(alert);
  }

  /**
   * Check error rate
   */
  checkErrorRate(errorRate: number, timeWindow: number): void {
    const rule = this.rules.get(AlertType.HIGH_ERROR_RATE);
    if (!rule || !rule.enabled) return;

    const severity = this.getSeverityForValue(errorRate, rule.thresholds);
    if (!severity) return;

    if (!this.canCreateAlert(AlertType.HIGH_ERROR_RATE, rule.cooldown)) return;

    const alert = this.createAlert(
      AlertType.HIGH_ERROR_RATE,
      severity,
      `High error rate detected`,
      `Error rate is ${errorRate.toFixed(1)}% over the last ${timeWindow / 1000}s`,
      { errorRate, timeWindow }
    );

    this.triggerAlert(alert);
  }

  /**
   * Check for errors
   */
  checkError(error: Error, context?: Record<string, any>): void {
    // Always log critical errors
    if (error.name === 'DatabaseError' || error.name === 'ConnectionError') {
      const alert = this.createAlert(
        AlertType.SYSTEM_ERROR,
        AlertSeverity.CRITICAL,
        `System error: ${error.name}`,
        error.message,
        { error: error.stack, ...context }
      );
      this.triggerAlert(alert);
    }
  }

  /**
   * Create an alert
   */
  private createAlert(
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    description: string,
    metadata?: Record<string, any>
  ): Alert {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return {
      id,
      type,
      severity,
      title,
      description,
      metadata,
      timestamp: Date.now(),
      resolved: false
    };
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    this.lastAlertTime.set(alert.type, Date.now());

    // Keep only last 1000 alerts in history
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-500);
    }

    // Emit alert event
    this.emit('alert', alert);

    // Log based on severity
    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        console.error(`[ALERT:CRITICAL] ${alert.title}: ${alert.description}`);
        break;
      case AlertSeverity.ERROR:
        console.error(`[ALERT:ERROR] ${alert.title}: ${alert.description}`);
        break;
      case AlertSeverity.WARNING:
        console.warn(`[ALERT:WARNING] ${alert.title}: ${alert.description}`);
        break;
      default:
        console.log(`[ALERT:INFO] ${alert.title}: ${alert.description}`);
    }

    // Auto-resolve after some time for non-critical alerts
    if (alert.severity !== AlertSeverity.CRITICAL) {
      setTimeout(() => this.resolveAlert(alert.id), 300000); // 5 minutes
    }
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.emit('alert:resolved', alert);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alerts by type
   */
  getAlertsByType(type: AlertType, limit: number = 100): Alert[] {
    return this.alertHistory
      .filter(a => a.type === type)
      .slice(-limit);
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics() {
    const stats: Record<string, any> = {
      total: this.alertHistory.length,
      active: this.getActiveAlerts().length,
      byType: {},
      bySeverity: {}
    };

    // Count by type
    for (const alert of this.alertHistory) {
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
    }

    return stats;
  }

  /**
   * Check if we can create a new alert (respecting cooldown)
   */
  private canCreateAlert(type: AlertType, cooldown: number): boolean {
    const lastAlert = this.lastAlertTime.get(type);
    if (!lastAlert) return true;
    return Date.now() - lastAlert >= cooldown;
  }

  /**
   * Get severity based on value and thresholds
   */
  private getSeverityForValue(value: number, thresholds: AlertThreshold[]): AlertSeverity | null {
    // Sort thresholds by value in descending order
    const sorted = [...thresholds].sort((a, b) => b.value - a.value);

    for (const threshold of sorted) {
      if (value >= threshold.value) {
        return threshold.severity;
      }
    }

    return null;
  }

  /**
   * Update metric buffer for moving averages
   */
  private updateMetricBuffer(key: string, value: number): void {
    const buffer = this.metricBuffers.get(key) || [];
    buffer.push(value);

    // Keep last 6 values (1 minute of data at 10s intervals)
    if (buffer.length > 6) {
      buffer.shift();
    }

    this.metricBuffers.set(key, buffer);
  }

  /**
   * Get buffer average
   */
  private getBufferAverage(key: string): number {
    const buffer = this.metricBuffers.get(key) || [];
    if (buffer.length === 0) return 0;
    return buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts.clear();
    this.alertHistory = [];
    this.lastAlertTime.clear();
  }

  /**
   * Export alerts for external systems
   */
  exportAlerts(format: 'json' | 'csv' = 'json'): string {
    const alerts = this.getAlertHistory();

    if (format === 'csv') {
      const headers = ['id', 'type', 'severity', 'title', 'description', 'timestamp', 'resolved'];
      const rows = alerts.map(a => [
        a.id,
        a.type,
        a.severity,
        a.title,
        a.description,
        new Date(a.timestamp).toISOString(),
        a.resolved ? 'true' : 'false'
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(alerts, null, 2);
  }
}