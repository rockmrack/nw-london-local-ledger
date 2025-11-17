#!/usr/bin/env ts-node

/**
 * Real-time Replication Monitor
 * Continuously monitors database replication health and performance
 */

import { getReadReplicaPool } from '../src/lib/database/read-replica-pool';
import { createConnectionManagerFromEnv } from '../src/lib/database/connection-manager';
import { ReplicationMonitor } from '../src/lib/database/replication-monitor';
import { Pool } from 'pg';
import * as readline from 'readline';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

class ReplicationMonitorDashboard {
  private replicaPool: ReturnType<typeof getReadReplicaPool>;
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning = true;
  private refreshRate = 2000; // 2 seconds

  constructor() {
    this.replicaPool = getReadReplicaPool();
    this.setupKeyboardInput();
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    console.clear();
    console.log(`${colors.bright}${colors.cyan}Database Replication Monitor${colors.reset}`);
    console.log(`${colors.dim}Press 'q' to quit, 'c' to clear cache, 'h' for help${colors.reset}\n`);

    // Initial display
    await this.displayDashboard();

    // Set up refresh interval
    this.refreshInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.displayDashboard();
      }
    }, this.refreshRate);
  }

  /**
   * Display the monitoring dashboard
   */
  private async displayDashboard(): Promise<void> {
    // Clear previous output (keep header)
    process.stdout.write('\x1b[4;0H'); // Move cursor to line 4
    process.stdout.write('\x1b[J'); // Clear from cursor to end of screen

    try {
      // Get current statistics
      const stats = this.replicaPool.getStats();
      const health = await this.replicaPool.healthCheck();

      // Display health status
      this.displayHealthStatus(health);

      // Display connection pools
      this.displayConnectionPools(stats);

      // Display query statistics
      this.displayQueryStatistics(stats);

      // Display cache statistics
      this.displayCacheStatistics(stats);

      // Display replication lag
      this.displayReplicationLag(stats);

      // Display timestamp
      console.log(
        `\n${colors.dim}Last updated: ${new Date().toLocaleTimeString()}${colors.reset}`
      );
    } catch (error) {
      console.error(`${colors.red}Error fetching statistics: ${error}${colors.reset}`);
    }
  }

  /**
   * Display health status
   */
  private displayHealthStatus(health: any): void {
    console.log(`${colors.bright}═══ Health Status ═══${colors.reset}`);

    // Overall health
    const healthIcon = health.healthy ? '✅' : '❌';
    const healthColor = health.healthy ? colors.green : colors.red;
    console.log(`Overall: ${healthIcon} ${healthColor}${health.healthy ? 'Healthy' : 'Unhealthy'}${colors.reset}`);

    // Primary status
    const primaryIcon = health.primary ? '✅' : '❌';
    const primaryColor = health.primary ? colors.green : colors.red;
    console.log(`Primary: ${primaryIcon} ${primaryColor}${health.primary ? 'Online' : 'Offline'}${colors.reset}`);

    // Replicas status
    console.log(`Replicas: ${health.replicas.filter((r: any) => r.healthy).length}/${health.replicas.length} healthy`);

    for (const replica of health.replicas) {
      const icon = replica.healthy ? '✅' : '❌';
      const color = replica.healthy ? colors.green : colors.red;
      const lag = replica.lag !== undefined ? `(lag: ${replica.lag.toFixed(1)}ms)` : '';
      console.log(`  ${icon} ${color}${replica.name}${colors.reset} ${lag}`);
    }

    console.log();
  }

  /**
   * Display connection pool statistics
   */
  private displayConnectionPools(stats: any): void {
    console.log(`${colors.bright}═══ Connection Pools ═══${colors.reset}`);

    if (stats.connectionPoolStats && stats.connectionPoolStats instanceof Map) {
      for (const [pool, poolStats] of stats.connectionPoolStats) {
        const utilizationPercent = poolStats.totalConnections > 0
          ? ((poolStats.activeConnections / poolStats.totalConnections) * 100).toFixed(1)
          : '0.0';

        const utilizationColor =
          parseFloat(utilizationPercent) > 80 ? colors.red :
          parseFloat(utilizationPercent) > 60 ? colors.yellow :
          colors.green;

        console.log(`${pool}:`);
        console.log(`  Connections: ${poolStats.activeConnections}/${poolStats.totalConnections} active`);
        console.log(`  Utilization: ${utilizationColor}${utilizationPercent}%${colors.reset}`);
        console.log(`  Waiting: ${poolStats.waitingRequests || 0}`);

        if (poolStats.errors > 0) {
          console.log(`  ${colors.red}Errors: ${poolStats.errors}${colors.reset}`);
        }
      }
    }

    console.log();
  }

  /**
   * Display query statistics
   */
  private displayQueryStatistics(stats: any): void {
    console.log(`${colors.bright}═══ Query Statistics ═══${colors.reset}`);

    const totalQueries = stats.totalQueries || 0;
    const readQueries = stats.readQueries || 0;
    const writeQueries = stats.writeQueries || 0;

    console.log(`Total Queries: ${totalQueries.toLocaleString()}`);

    if (totalQueries > 0) {
      const readPercent = ((readQueries / totalQueries) * 100).toFixed(1);
      const writePercent = ((writeQueries / totalQueries) * 100).toFixed(1);

      // Create simple bar charts
      const readBar = this.createBar(parseFloat(readPercent), 20);
      const writeBar = this.createBar(parseFloat(writePercent), 20);

      console.log(`Reads:  ${readBar} ${readPercent}% (${readQueries.toLocaleString()})`);
      console.log(`Writes: ${writeBar} ${writePercent}% (${writeQueries.toLocaleString()})`);
    }

    // Display average query times
    console.log(`\nAverage Query Times:`);
    console.log(`  Overall: ${(stats.averageQueryTime || 0).toFixed(2)}ms`);
    console.log(`  Reads:   ${(stats.averageReadTime || 0).toFixed(2)}ms`);
    console.log(`  Writes:  ${(stats.averageWriteTime || 0).toFixed(2)}ms`);

    if (stats.errors > 0) {
      console.log(`\n${colors.red}Query Errors: ${stats.errors}${colors.reset}`);
      if (stats.lastError) {
        console.log(`${colors.red}Last Error: ${stats.lastError.substring(0, 50)}...${colors.reset}`);
      }
    }

    console.log();
  }

  /**
   * Display cache statistics
   */
  private displayCacheStatistics(stats: any): void {
    console.log(`${colors.bright}═══ Cache Statistics ═══${colors.reset}`);

    const cacheHits = stats.cacheHits || 0;
    const cacheMisses = stats.cacheMisses || 0;
    const totalCacheRequests = cacheHits + cacheMisses;

    if (totalCacheRequests > 0) {
      const hitRate = (cacheHits / totalCacheRequests * 100).toFixed(1);
      const hitRateColor =
        parseFloat(hitRate) > 80 ? colors.green :
        parseFloat(hitRate) > 50 ? colors.yellow :
        colors.red;

      const hitBar = this.createBar(parseFloat(hitRate), 20);

      console.log(`Hit Rate: ${hitBar} ${hitRateColor}${hitRate}%${colors.reset}`);
      console.log(`Hits:     ${cacheHits.toLocaleString()}`);
      console.log(`Misses:   ${cacheMisses.toLocaleString()}`);
      console.log(`Cached:   ${stats.cachedQueries || 0} queries`);
    } else {
      console.log(`${colors.dim}No cache activity yet${colors.reset}`);
    }

    console.log();
  }

  /**
   * Display replication lag
   */
  private displayReplicationLag(stats: any): void {
    console.log(`${colors.bright}═══ Replication Lag ═══${colors.reset}`);

    if (stats.replicationLag && stats.replicationLag.size > 0) {
      let totalLag = 0;
      let replicaCount = 0;

      for (const [replica, lag] of stats.replicationLag) {
        const lagMs = lag || 0;
        totalLag += lagMs;
        replicaCount++;

        const lagColor =
          lagMs > 5000 ? colors.red :
          lagMs > 1000 ? colors.yellow :
          colors.green;

        const lagBar = this.createBar(Math.min(lagMs / 100, 100), 15);

        console.log(`${replica}: ${lagBar} ${lagColor}${lagMs.toFixed(1)}ms${colors.reset}`);
      }

      if (replicaCount > 0) {
        const avgLag = totalLag / replicaCount;
        const avgColor =
          avgLag > 5000 ? colors.red :
          avgLag > 1000 ? colors.yellow :
          colors.green;

        console.log(`\nAverage Lag: ${avgColor}${avgLag.toFixed(1)}ms${colors.reset}`);
      }
    } else {
      console.log(`${colors.dim}No replication lag data available${colors.reset}`);
    }

    console.log();
  }

  /**
   * Create a simple ASCII bar chart
   */
  private createBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const filledChar = '█';
    const emptyChar = '░';

    return `${colors.cyan}${filledChar.repeat(filled)}${colors.dim}${emptyChar.repeat(empty)}${colors.reset}`;
  }

  /**
   * Setup keyboard input handling
   */
  private setupKeyboardInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key: string) => {
      switch (key) {
        case 'q':
        case '\x03': // Ctrl+C
          await this.stop();
          break;

        case 'c':
          await this.clearCache();
          break;

        case 'h':
          this.showHelp();
          break;

        case 'r':
          console.log('\nRefreshing...');
          await this.displayDashboard();
          break;

        case '+':
          this.refreshRate = Math.max(500, this.refreshRate - 500);
          console.log(`\n${colors.green}Refresh rate: ${this.refreshRate}ms${colors.reset}`);
          break;

        case '-':
          this.refreshRate = Math.min(10000, this.refreshRate + 500);
          console.log(`\n${colors.green}Refresh rate: ${this.refreshRate}ms${colors.reset}`);
          break;
      }
    });
  }

  /**
   * Clear cache
   */
  private async clearCache(): Promise<void> {
    console.log(`\n${colors.yellow}Clearing cache...${colors.reset}`);
    await this.replicaPool.clearCache();
    console.log(`${colors.green}Cache cleared!${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Show help
   */
  private showHelp(): void {
    console.clear();
    console.log(`${colors.bright}${colors.cyan}Replication Monitor - Help${colors.reset}\n`);
    console.log('Keyboard shortcuts:');
    console.log('  q, Ctrl+C - Quit');
    console.log('  c         - Clear cache');
    console.log('  r         - Refresh display');
    console.log('  +         - Increase refresh rate');
    console.log('  -         - Decrease refresh rate');
    console.log('  h         - Show this help');
    console.log('\nPress any key to return to dashboard...');

    // Wait for key press then return to dashboard
    const handler = async () => {
      process.stdin.removeListener('data', handler);
      console.clear();
      console.log(`${colors.bright}${colors.cyan}Database Replication Monitor${colors.reset}`);
      console.log(`${colors.dim}Press 'q' to quit, 'c' to clear cache, 'h' for help${colors.reset}\n`);
      await this.displayDashboard();
    };
    process.stdin.once('data', handler);
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    console.log(`\n${colors.yellow}Stopping monitor...${colors.reset}`);

    // Get final stats
    const stats = this.replicaPool.getStats();
    console.log(`\n${colors.bright}Final Statistics:${colors.reset}`);
    console.log(`Total Queries: ${stats.totalQueries}`);
    console.log(`Cache Hit Rate: ${((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)}%`);
    console.log(`Average Query Time: ${stats.averageQueryTime.toFixed(2)}ms`);

    await this.replicaPool.shutdown();

    console.log(`\n${colors.green}Monitor stopped. Goodbye!${colors.reset}\n`);
    process.exit(0);
  }
}

// Run the monitor
if (require.main === module) {
  const monitor = new ReplicationMonitorDashboard();

  monitor.start().catch((error) => {
    console.error(`${colors.red}Failed to start monitor: ${error}${colors.reset}`);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await monitor.stop();
  });

  process.on('SIGTERM', async () => {
    await monitor.stop();
  });
}