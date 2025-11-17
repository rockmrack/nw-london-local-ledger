/**
 * Replication Monitor
 * Monitors PostgreSQL replication lag and health across all replicas
 */

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface ReplicationStatus {
  replicaName: string;
  isHealthy: boolean;
  lagBytes: number;
  lagTime: number; // milliseconds
  lastCheckTime: Date;
  writeLocation?: string;
  flushLocation?: string;
  replayLocation?: string;
  syncState?: string;
  syncPriority?: number;
  applicationName?: string;
}

export interface ReplicationMetrics {
  avgLagTime: number;
  maxLagTime: number;
  minLagTime: number;
  unhealthyReplicas: number;
  totalReplicas: number;
  lastUpdateTime: Date;
  replicationSlots?: ReplicationSlot[];
}

export interface ReplicationSlot {
  slotName: string;
  slotType: string;
  active: boolean;
  restartLsn?: string;
  confirmedFlushLsn?: string;
  lagBytes?: number;
}

export interface MonitorConfig {
  checkInterval?: number; // milliseconds
  maxAcceptableLag?: number; // milliseconds
  alertThreshold?: number; // milliseconds
  enableDetailedMetrics?: boolean;
}

export class ReplicationMonitor extends EventEmitter {
  private primaryPool: Pool;
  private replicaPools: Map<string, Pool> = new Map();
  private replicationStatus: Map<string, ReplicationStatus> = new Map();
  private metrics: ReplicationMetrics;
  private checkTimer?: NodeJS.Timeout;
  private config: MonitorConfig;
  private isRunning = false;

  constructor(primaryPool: Pool, config?: MonitorConfig) {
    super();
    this.primaryPool = primaryPool;
    this.config = {
      checkInterval: config?.checkInterval || 10000, // 10 seconds
      maxAcceptableLag: config?.maxAcceptableLag || 1000, // 1 second
      alertThreshold: config?.alertThreshold || 5000, // 5 seconds
      enableDetailedMetrics: config?.enableDetailedMetrics || true,
    };

    this.metrics = {
      avgLagTime: 0,
      maxLagTime: 0,
      minLagTime: 0,
      unhealthyReplicas: 0,
      totalReplicas: 0,
      lastUpdateTime: new Date(),
    };
  }

  /**
   * Add a replica pool to monitor
   */
  public addReplicaPool(name: string, pool: Pool): void {
    this.replicaPools.set(name, pool);
    this.replicationStatus.set(name, {
      replicaName: name,
      isHealthy: false,
      lagBytes: 0,
      lagTime: 0,
      lastCheckTime: new Date(),
    });

    this.metrics.totalReplicas = this.replicaPools.size;
  }

  /**
   * Remove a replica from monitoring
   */
  public removeReplicaPool(name: string): void {
    this.replicaPools.delete(name);
    this.replicationStatus.delete(name);
    this.metrics.totalReplicas = this.replicaPools.size;
  }

  /**
   * Start monitoring replication
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('Replication monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting replication monitoring...');

    // Run initial check immediately
    this.checkReplication();

    // Set up periodic checks
    this.checkTimer = setInterval(() => {
      this.checkReplication();
    }, this.config.checkInterval!);

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (!this.isRunning) {
      console.warn('Replication monitor is not running');
      return;
    }

    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    console.log('Stopped replication monitoring');
    this.emit('stopped');
  }

  /**
   * Perform replication check
   */
  private async checkReplication(): Promise<void> {
    const startTime = performance.now();

    try {
      // Check replication status from primary
      await this.checkPrimaryReplicationStatus();

      // Check each replica
      const checkPromises = Array.from(this.replicaPools.entries()).map(([name, pool]) =>
        this.checkReplicaStatus(name, pool)
      );

      await Promise.all(checkPromises);

      // Update metrics
      this.updateMetrics();

      // Check for alerts
      this.checkAlerts();

      const checkDuration = performance.now() - startTime;
      this.emit('check-complete', { duration: checkDuration, metrics: this.metrics });
    } catch (error) {
      console.error('Error during replication check:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check replication status from the primary's perspective
   */
  private async checkPrimaryReplicationStatus(): Promise<void> {
    let client: PoolClient | null = null;

    try {
      client = await this.primaryPool.connect();

      // Query to get replication status from primary
      const replicationQuery = `
        SELECT
          application_name,
          client_addr,
          state,
          sync_state,
          sync_priority,
          pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS sent_lag_bytes,
          pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
          pg_wal_lsn_diff(write_lsn, flush_lsn) AS flush_lag_bytes,
          pg_wal_lsn_diff(flush_lsn, replay_lsn) AS replay_lag_bytes,
          pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS total_lag_bytes,
          sent_lsn,
          write_lsn,
          flush_lsn,
          replay_lsn,
          EXTRACT(EPOCH FROM (NOW() - reply_time)) * 1000 AS reply_lag_ms
        FROM pg_stat_replication
        WHERE application_name IS NOT NULL
      `;

      const result = await client.query(replicationQuery);

      // Update status for each replica found
      for (const row of result.rows) {
        const replicaName = this.findReplicaNameByAppName(row.application_name);
        if (replicaName) {
          const status = this.replicationStatus.get(replicaName);
          if (status) {
            status.lagBytes = Math.max(0, parseFloat(row.total_lag_bytes) || 0);
            status.lagTime = Math.max(0, parseFloat(row.reply_lag_ms) || 0);
            status.syncState = row.sync_state;
            status.syncPriority = row.sync_priority;
            status.applicationName = row.application_name;
            status.writeLocation = row.write_lsn;
            status.flushLocation = row.flush_lsn;
            status.replayLocation = row.replay_lsn;
          }
        }
      }

      // Check replication slots if detailed metrics enabled
      if (this.config.enableDetailedMetrics) {
        await this.checkReplicationSlots(client);
      }
    } catch (error) {
      console.error('Error checking primary replication status:', error);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Check replication slots
   */
  private async checkReplicationSlots(client: PoolClient): Promise<void> {
    try {
      const slotsQuery = `
        SELECT
          slot_name,
          slot_type,
          active,
          restart_lsn,
          confirmed_flush_lsn,
          pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes
        FROM pg_replication_slots
      `;

      const result = await client.query(slotsQuery);

      this.metrics.replicationSlots = result.rows.map(row => ({
        slotName: row.slot_name,
        slotType: row.slot_type,
        active: row.active,
        restartLsn: row.restart_lsn,
        confirmedFlushLsn: row.confirmed_flush_lsn,
        lagBytes: parseFloat(row.lag_bytes) || 0,
      }));

      // Check for inactive slots (potential issue)
      const inactiveSlots = this.metrics.replicationSlots.filter(slot => !slot.active);
      if (inactiveSlots.length > 0) {
        this.emit('warning', {
          type: 'inactive-slots',
          message: `Found ${inactiveSlots.length} inactive replication slots`,
          slots: inactiveSlots,
        });
      }
    } catch (error) {
      console.error('Error checking replication slots:', error);
    }
  }

  /**
   * Check individual replica status
   */
  private async checkReplicaStatus(name: string, pool: Pool): Promise<void> {
    const status = this.replicationStatus.get(name);
    if (!status) return;

    let client: PoolClient | null = null;

    try {
      client = await pool.connect();

      // Query to check if replica is in recovery mode and get lag
      const recoveryQuery = `
        SELECT
          pg_is_in_recovery() AS is_standby,
          CASE
            WHEN pg_is_in_recovery() THEN
              EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) * 1000
            ELSE
              0
          END AS replication_lag_ms,
          pg_last_wal_receive_lsn() AS receive_lsn,
          pg_last_wal_replay_lsn() AS replay_lsn,
          pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) AS apply_lag_bytes
      `;

      const result = await client.query(recoveryQuery);
      const row = result.rows[0];

      if (row && row.is_standby) {
        const lagMs = parseFloat(row.replication_lag_ms) || 0;

        status.isHealthy = lagMs < this.config.maxAcceptableLag!;
        status.lagTime = lagMs;
        status.lastCheckTime = new Date();

        // Additional metrics
        if (row.apply_lag_bytes) {
          status.lagBytes = Math.max(0, parseFloat(row.apply_lag_bytes) || 0);
        }
      } else {
        // Not a standby or query failed
        status.isHealthy = false;
        status.lastCheckTime = new Date();
      }
    } catch (error) {
      console.error(`Error checking replica ${name}:`, error);
      status.isHealthy = false;
      status.lastCheckTime = new Date();

      this.emit('replica-error', { replica: name, error });
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Update aggregated metrics
   */
  private updateMetrics(): void {
    const statuses = Array.from(this.replicationStatus.values());
    const healthyStatuses = statuses.filter(s => s.isHealthy);

    this.metrics.unhealthyReplicas = statuses.length - healthyStatuses.length;

    if (healthyStatuses.length > 0) {
      const lagTimes = healthyStatuses.map(s => s.lagTime);

      this.metrics.avgLagTime =
        lagTimes.reduce((sum, lag) => sum + lag, 0) / lagTimes.length;
      this.metrics.maxLagTime = Math.max(...lagTimes);
      this.metrics.minLagTime = Math.min(...lagTimes);
    } else {
      this.metrics.avgLagTime = 0;
      this.metrics.maxLagTime = 0;
      this.metrics.minLagTime = 0;
    }

    this.metrics.lastUpdateTime = new Date();
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(): void {
    // Check for high lag
    for (const [name, status] of this.replicationStatus) {
      if (status.lagTime > this.config.alertThreshold!) {
        this.emit('high-lag', {
          replica: name,
          lag: status.lagTime,
          threshold: this.config.alertThreshold,
        });
      }

      if (!status.isHealthy) {
        this.emit('unhealthy-replica', {
          replica: name,
          status,
        });
      }
    }

    // Check for too many unhealthy replicas
    const unhealthyPercentage = (this.metrics.unhealthyReplicas / this.metrics.totalReplicas) * 100;
    if (unhealthyPercentage > 50) {
      this.emit('critical', {
        type: 'high-failure-rate',
        message: `${this.metrics.unhealthyReplicas} of ${this.metrics.totalReplicas} replicas are unhealthy`,
        percentage: unhealthyPercentage,
      });
    }
  }

  /**
   * Find replica name by application name
   */
  private findReplicaNameByAppName(appName: string): string | null {
    // Try to match based on common naming patterns
    for (const name of this.replicaPools.keys()) {
      if (appName.includes(name) || name.includes(appName)) {
        return name;
      }
    }

    // Try to match by replica number
    const match = appName.match(/replica[_-]?(\d+)/i);
    if (match) {
      const replicaNum = match[1];
      const possibleName = `replica-${replicaNum}`;
      if (this.replicaPools.has(possibleName)) {
        return possibleName;
      }
    }

    return null;
  }

  /**
   * Get current replication status for all replicas
   */
  public getStatus(): Map<string, ReplicationStatus> {
    return new Map(this.replicationStatus);
  }

  /**
   * Get current metrics
   */
  public getMetrics(): ReplicationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get status for specific replica
   */
  public getReplicaStatus(name: string): ReplicationStatus | undefined {
    return this.replicationStatus.get(name);
  }

  /**
   * Check if a replica is healthy
   */
  public isReplicaHealthy(name: string): boolean {
    return this.replicationStatus.get(name)?.isHealthy || false;
  }

  /**
   * Get list of healthy replicas sorted by lag
   */
  public getHealthyReplicas(): ReplicationStatus[] {
    return Array.from(this.replicationStatus.values())
      .filter(s => s.isHealthy)
      .sort((a, b) => a.lagTime - b.lagTime);
  }

  /**
   * Get the replica with the lowest lag
   */
  public getBestReplica(): ReplicationStatus | null {
    const healthy = this.getHealthyReplicas();
    return healthy.length > 0 ? healthy[0] : null;
  }

  /**
   * Force an immediate replication check
   */
  public async forceCheck(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Monitor is not running');
    }

    await this.checkReplication();
  }

  /**
   * Export metrics in Prometheus format
   */
  public getPrometheusMetrics(): string {
    const lines: string[] = [];

    // Overall metrics
    lines.push(`# HELP postgres_replication_lag_avg Average replication lag in milliseconds`);
    lines.push(`# TYPE postgres_replication_lag_avg gauge`);
    lines.push(`postgres_replication_lag_avg ${this.metrics.avgLagTime}`);

    lines.push(`# HELP postgres_replication_lag_max Maximum replication lag in milliseconds`);
    lines.push(`# TYPE postgres_replication_lag_max gauge`);
    lines.push(`postgres_replication_lag_max ${this.metrics.maxLagTime}`);

    lines.push(`# HELP postgres_replication_unhealthy_replicas Number of unhealthy replicas`);
    lines.push(`# TYPE postgres_replication_unhealthy_replicas gauge`);
    lines.push(`postgres_replication_unhealthy_replicas ${this.metrics.unhealthyReplicas}`);

    // Per-replica metrics
    for (const [name, status] of this.replicationStatus) {
      lines.push(`# HELP postgres_replica_lag_ms Replication lag for ${name}`);
      lines.push(`# TYPE postgres_replica_lag_ms gauge`);
      lines.push(`postgres_replica_lag_ms{replica="${name}"} ${status.lagTime}`);

      lines.push(`# HELP postgres_replica_lag_bytes Replication lag in bytes for ${name}`);
      lines.push(`# TYPE postgres_replica_lag_bytes gauge`);
      lines.push(`postgres_replica_lag_bytes{replica="${name}"} ${status.lagBytes}`);

      lines.push(`# HELP postgres_replica_healthy Health status for ${name}`);
      lines.push(`# TYPE postgres_replica_healthy gauge`);
      lines.push(`postgres_replica_healthy{replica="${name}"} ${status.isHealthy ? 1 : 0}`);
    }

    return lines.join('\n');
  }
}

// Export helper function to create monitor from connection manager
export function createReplicationMonitor(
  primaryPool: Pool,
  replicaPools: Map<string, Pool>,
  config?: MonitorConfig
): ReplicationMonitor {
  const monitor = new ReplicationMonitor(primaryPool, config);

  for (const [name, pool] of replicaPools) {
    monitor.addReplicaPool(name, pool);
  }

  return monitor;
}