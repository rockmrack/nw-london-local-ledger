/**
 * Queue Dashboard Service
 * Provides comprehensive monitoring and management capabilities for all queues
 */

import { queueService } from './queue.service';
import { logger } from '@/lib/logging/logger';
import { Job } from 'bullmq';

export interface DashboardStats {
  overview: {
    totalQueues: number;
    totalWaiting: number;
    totalActive: number;
    totalCompleted: number;
    totalFailed: number;
    avgProcessingTime: number;
    systemHealth: 'healthy' | 'degraded' | 'critical';
  };
  queues: Array<{
    name: string;
    status: 'active' | 'paused' | 'idle';
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    workersCount: number;
    avgProcessingTime?: number;
    errorRate?: number;
    throughput?: number;
    lastActivityTime?: Date;
  }>;
  recentActivity: Array<{
    queueName: string;
    jobId: string;
    jobName: string;
    status: 'completed' | 'failed' | 'active';
    startTime: Date;
    endTime?: Date;
    duration?: number;
    error?: string;
  }>;
  performance: {
    last24Hours: {
      completed: number;
      failed: number;
      avgProcessingTime: number;
      peakHour: string;
      slowestQueue: string;
    };
    trends: Array<{
      hour: string;
      completed: number;
      failed: number;
      avgTime: number;
    }>;
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    queue?: string;
    message: string;
    timestamp: Date;
  }>;
}

export class DashboardService {
  private static instance: DashboardService;
  private performanceHistory: Map<string, any[]> = new Map();
  private alerts: Array<any> = [];

  private constructor() {
    this.startMetricsCollection();
  }

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  /**
   * Get comprehensive dashboard statistics
   */
  public async getStats(): Promise<DashboardStats> {
    const queueStats = await queueService.getQueueStats();

    // Calculate overview
    const overview = this.calculateOverview(queueStats);

    // Get queue details
    const queues = await this.getQueueDetails(queueStats);

    // Get recent activity
    const recentActivity = await this.getRecentActivity();

    // Get performance metrics
    const performance = await this.getPerformanceMetrics();

    // Get current alerts
    const alerts = this.getAlerts();

    return {
      overview,
      queues,
      recentActivity,
      performance,
      alerts,
    };
  }

  /**
   * Get detailed statistics for a specific queue
   */
  public async getQueueDetails(queueName: string): Promise<{
    info: any;
    jobs: {
      waiting: Job[];
      active: Job[];
      completed: Job[];
      failed: Job[];
      delayed: Job[];
    };
    metrics: {
      throughput: number;
      avgWaitTime: number;
      avgProcessTime: number;
      successRate: number;
      peakLoad: number;
    };
    schedule?: any[];
  }> {
    const queue = queueService.getQueue(queueName);

    // Get job counts and samples
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getJobs(['wait'], 0, 20),
      queue.getJobs(['active'], 0, 20),
      queue.getJobs(['completed'], 0, 20),
      queue.getJobs(['failed'], 0, 20),
      queue.getJobs(['delayed'], 0, 20),
    ]);

    // Get queue info
    const info = await queue.getJobCounts();

    // Calculate metrics
    const metrics = await this.calculateQueueMetrics(queueName, completed);

    // Get repeatable jobs (schedules)
    const schedule = await queueService.getRepeatableJobs(queueName);

    return {
      info,
      jobs: {
        waiting,
        active,
        completed,
        failed,
        delayed,
      },
      metrics,
      schedule,
    };
  }

  /**
   * Trigger manual scraping
   */
  public async triggerScraping(options: {
    council?: string;
    all?: boolean;
    fromDate?: string;
    indexAfterScraping?: boolean;
  }): Promise<{ jobId: string; queue: string }> {
    const job = await queueService.addJob(
      'scraper-queue',
      options.all ? 'scrape-all' : 'scrape-council',
      options,
      {
        priority: -5, // Higher priority for manual triggers
      }
    );

    logger.info('Manual scraping triggered', {
      jobId: job.id,
      options,
    });

    return {
      jobId: job.id!,
      queue: 'scraper-queue',
    };
  }

  /**
   * Trigger cache warming
   */
  public async triggerCacheWarming(options: {
    type: 'popular' | 'areas' | 'properties' | 'planning' | 'search' | 'custom';
    targets?: string[];
    force?: boolean;
  }): Promise<{ jobId: string; queue: string }> {
    const job = await queueService.addJob(
      'cache-warmer-queue',
      `warm-${options.type}`,
      options
    );

    logger.info('Cache warming triggered', {
      jobId: job.id,
      options,
    });

    return {
      jobId: job.id!,
      queue: 'cache-warmer-queue',
    };
  }

  /**
   * Trigger indexing
   */
  public async triggerIndexing(options: {
    type: 'property' | 'planning' | 'area' | 'news';
    operation: 'index' | 'reindex' | 'bulk';
    ids?: number[];
    forceReindex?: boolean;
  }): Promise<{ jobId: string; queue: string }> {
    const job = await queueService.addJob(
      'indexer-queue',
      `${options.operation}-${options.type}`,
      options
    );

    logger.info('Indexing triggered', {
      jobId: job.id,
      options,
    });

    return {
      jobId: job.id!,
      queue: 'indexer-queue',
    };
  }

  /**
   * Trigger cleanup
   */
  public async triggerCleanup(options: {
    task: 'refresh-views' | 'cleanup-old-data' | 'optimize-db' | 'vacuum';
    target?: string;
    daysToKeep?: number;
  }): Promise<{ jobId: string; queue: string }> {
    const job = await queueService.addJob(
      'cleanup-queue',
      options.task,
      options
    );

    logger.info('Cleanup triggered', {
      jobId: job.id,
      options,
    });

    return {
      jobId: job.id!,
      queue: 'cleanup-queue',
    };
  }

  /**
   * Pause/resume queue operations
   */
  public async pauseQueue(queueName: string): Promise<void> {
    await queueService.pauseQueue(queueName);
    this.addAlert('info', `Queue ${queueName} paused`, queueName);
  }

  public async resumeQueue(queueName: string): Promise<void> {
    await queueService.resumeQueue(queueName);
    this.addAlert('info', `Queue ${queueName} resumed`, queueName);
  }

  /**
   * Retry failed jobs
   */
  public async retryFailedJobs(queueName: string, limit?: number): Promise<{
    retried: number;
    message: string;
  }> {
    const retried = await queueService.retryFailedJobs(queueName, limit);

    return {
      retried,
      message: `Successfully retried ${retried} failed jobs in ${queueName}`,
    };
  }

  /**
   * Clean queue
   */
  public async cleanQueue(
    queueName: string,
    options: {
      grace?: number;
      limit?: number;
      status?: 'completed' | 'failed';
    } = {}
  ): Promise<{
    cleaned: number;
    message: string;
  }> {
    const cleaned = await queueService.cleanQueue(
      queueName,
      options.grace || 0,
      options.limit || 100,
      options.status || 'completed'
    );

    return {
      cleaned: cleaned.length,
      message: `Successfully cleaned ${cleaned.length} ${options.status || 'completed'} jobs from ${queueName}`,
    };
  }

  /**
   * Get job details
   */
  public async getJobDetails(queueName: string, jobId: string): Promise<{
    job: Job | null;
    logs?: string[];
    progress?: number;
  }> {
    const job = await queueService.getJob(queueName, jobId);

    if (!job) {
      return { job: null };
    }

    // Get job logs if available
    const logs = await job.getChildrenValues();

    return {
      job,
      logs: Object.values(logs),
      progress: job.progress as number,
    };
  }

  /**
   * Calculate overview statistics
   */
  private calculateOverview(queueStats: any[]): DashboardStats['overview'] {
    const totals = queueStats.reduce(
      (acc, stat) => ({
        waiting: acc.waiting + stat.waiting,
        active: acc.active + stat.active,
        completed: acc.completed + stat.completed,
        failed: acc.failed + stat.failed,
        processingTime: [...acc.processingTime, stat.avgProcessingTime || 0],
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, processingTime: [] as number[] }
    );

    const avgProcessingTime =
      totals.processingTime.filter(t => t > 0).reduce((a, b) => a + b, 0) /
      Math.max(totals.processingTime.filter(t => t > 0).length, 1);

    // Determine system health
    let systemHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const errorRate = totals.failed / Math.max(totals.completed + totals.failed, 1);

    if (errorRate > 0.25 || totals.waiting > 5000) {
      systemHealth = 'critical';
    } else if (errorRate > 0.1 || totals.waiting > 1000) {
      systemHealth = 'degraded';
    }

    return {
      totalQueues: queueStats.length,
      totalWaiting: totals.waiting,
      totalActive: totals.active,
      totalCompleted: totals.completed,
      totalFailed: totals.failed,
      avgProcessingTime,
      systemHealth,
    };
  }

  /**
   * Get detailed queue information
   */
  private async getQueueDetails(queueStats: any[]): Promise<DashboardStats['queues']> {
    return queueStats.map(stat => {
      let status: 'active' | 'paused' | 'idle' = 'idle';
      if (stat.paused) {
        status = 'paused';
      } else if (stat.active > 0) {
        status = 'active';
      }

      // Calculate throughput (jobs per minute)
      const throughput = this.calculateThroughput(stat.name);

      return {
        name: stat.name,
        status,
        waiting: stat.waiting,
        active: stat.active,
        completed: stat.completed,
        failed: stat.failed,
        delayed: stat.delayed,
        workersCount: stat.workersCount,
        avgProcessingTime: stat.avgProcessingTime,
        errorRate: stat.errorRate,
        throughput,
        lastActivityTime: stat.lastJobTime,
      };
    });
  }

  /**
   * Get recent activity across all queues
   */
  private async getRecentActivity(): Promise<DashboardStats['recentActivity']> {
    const activity: DashboardStats['recentActivity'] = [];

    // Get recent jobs from each queue
    for (const [name] of queueService['queues']) {
      const queue = queueService.getQueue(name);

      const [completed, failed, active] = await Promise.all([
        queue.getJobs(['completed'], 0, 5),
        queue.getJobs(['failed'], 0, 5),
        queue.getJobs(['active'], 0, 5),
      ]);

      // Add completed jobs
      for (const job of completed) {
        activity.push({
          queueName: name,
          jobId: job.id!,
          jobName: job.name,
          status: 'completed',
          startTime: new Date(job.processedOn!),
          endTime: job.finishedOn ? new Date(job.finishedOn) : undefined,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
        });
      }

      // Add failed jobs
      for (const job of failed) {
        activity.push({
          queueName: name,
          jobId: job.id!,
          jobName: job.name,
          status: 'failed',
          startTime: new Date(job.processedOn!),
          endTime: job.finishedOn ? new Date(job.finishedOn) : undefined,
          error: job.failedReason,
        });
      }

      // Add active jobs
      for (const job of active) {
        activity.push({
          queueName: name,
          jobId: job.id!,
          jobName: job.name,
          status: 'active',
          startTime: new Date(job.processedOn!),
        });
      }
    }

    // Sort by start time (most recent first)
    activity.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Return only the 20 most recent
    return activity.slice(0, 20);
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<DashboardStats['performance']> {
    // This would typically query from a metrics database
    // For now, return sample data structure

    const last24Hours = {
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
      peakHour: '14:00',
      slowestQueue: '',
    };

    // Calculate from performance history
    for (const [queueName, history] of this.performanceHistory) {
      const recent = history.filter(h => h.timestamp > Date.now() - 24 * 60 * 60 * 1000);
      last24Hours.completed += recent.filter(h => h.status === 'completed').length;
      last24Hours.failed += recent.filter(h => h.status === 'failed').length;
    }

    // Generate hourly trends
    const trends: DashboardStats['performance']['trends'] = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      trends.push({
        hour: hour.toISOString().substring(11, 13) + ':00',
        completed: Math.floor(Math.random() * 100), // Replace with actual data
        failed: Math.floor(Math.random() * 10),
        avgTime: Math.random() * 5000,
      });
    }

    return {
      last24Hours,
      trends,
    };
  }

  /**
   * Calculate queue metrics
   */
  private async calculateQueueMetrics(
    queueName: string,
    completedJobs: Job[]
  ): Promise<any> {
    let totalWaitTime = 0;
    let totalProcessTime = 0;
    let successCount = 0;

    for (const job of completedJobs) {
      if (job.processedOn && job.timestamp) {
        totalWaitTime += job.processedOn - job.timestamp;
      }
      if (job.finishedOn && job.processedOn) {
        totalProcessTime += job.finishedOn - job.processedOn;
      }
      successCount++;
    }

    const avgWaitTime = completedJobs.length > 0 ? totalWaitTime / completedJobs.length : 0;
    const avgProcessTime = completedJobs.length > 0 ? totalProcessTime / completedJobs.length : 0;

    // Calculate throughput
    const throughput = this.calculateThroughput(queueName);

    return {
      throughput,
      avgWaitTime,
      avgProcessTime,
      successRate: successCount / Math.max(completedJobs.length, 1),
      peakLoad: 0, // Would need historical data
    };
  }

  /**
   * Calculate throughput for a queue
   */
  private calculateThroughput(queueName: string): number {
    const history = this.performanceHistory.get(queueName) || [];
    const recentJobs = history.filter(h => h.timestamp > Date.now() - 60000); // Last minute
    return recentJobs.length;
  }

  /**
   * Get current alerts
   */
  private getAlerts(): DashboardStats['alerts'] {
    // Clean old alerts (keep last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    return this.alerts.map(alert => ({
      level: alert.level,
      queue: alert.queue,
      message: alert.message,
      timestamp: alert.timestamp,
    }));
  }

  /**
   * Add an alert
   */
  private addAlert(
    level: 'info' | 'warning' | 'error' | 'critical',
    message: string,
    queue?: string
  ): void {
    this.alerts.push({
      level,
      queue,
      message,
      timestamp: new Date(),
    });

    logger[level === 'critical' ? 'error' : level](`[Dashboard Alert] ${message}`, { queue });
  }

  /**
   * Start collecting metrics
   */
  private startMetricsCollection(): void {
    // Collect metrics every minute
    setInterval(async () => {
      try {
        const stats = await queueService.getQueueStats();

        for (const stat of stats) {
          if (!this.performanceHistory.has(stat.name)) {
            this.performanceHistory.set(stat.name, []);
          }

          const history = this.performanceHistory.get(stat.name)!;
          history.push({
            timestamp: Date.now(),
            ...stat,
          });

          // Keep only last 24 hours of history
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          const filtered = history.filter(h => h.timestamp > cutoff);
          this.performanceHistory.set(stat.name, filtered);

          // Check for alerts
          if (stat.errorRate && stat.errorRate > 0.25) {
            this.addAlert('critical', `High error rate: ${(stat.errorRate * 100).toFixed(2)}%`, stat.name);
          } else if (stat.errorRate && stat.errorRate > 0.1) {
            this.addAlert('warning', `Elevated error rate: ${(stat.errorRate * 100).toFixed(2)}%`, stat.name);
          }

          if (stat.waiting > 5000) {
            this.addAlert('critical', `Queue backlog critical: ${stat.waiting} jobs waiting`, stat.name);
          } else if (stat.waiting > 1000) {
            this.addAlert('warning', `Queue backlog high: ${stat.waiting} jobs waiting`, stat.name);
          }
        }
      } catch (error) {
        logger.error('[Dashboard Service] Error collecting metrics:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Export metrics for external monitoring
   */
  public async exportMetrics(): Promise<{
    prometheus: string;
    json: any;
  }> {
    const stats = await queueService.getQueueStats();

    // Generate Prometheus format
    let prometheus = '';
    prometheus += '# HELP job_queue_waiting Number of waiting jobs\n';
    prometheus += '# TYPE job_queue_waiting gauge\n';

    for (const stat of stats) {
      prometheus += `job_queue_waiting{queue="${stat.name}"} ${stat.waiting}\n`;
      prometheus += `job_queue_active{queue="${stat.name}"} ${stat.active}\n`;
      prometheus += `job_queue_completed{queue="${stat.name}"} ${stat.completed}\n`;
      prometheus += `job_queue_failed{queue="${stat.name}"} ${stat.failed}\n`;

      if (stat.avgProcessingTime) {
        prometheus += `job_queue_avg_processing_time{queue="${stat.name}"} ${stat.avgProcessingTime}\n`;
      }

      if (stat.errorRate) {
        prometheus += `job_queue_error_rate{queue="${stat.name}"} ${stat.errorRate}\n`;
      }
    }

    return {
      prometheus,
      json: stats,
    };
  }
}

// Export singleton instance
export const dashboardService = DashboardService.getInstance();