#!/usr/bin/env ts-node

/**
 * Database Performance Benchmark
 * Compares performance between single database and read replica architecture
 */

import { performance } from 'perf_hooks';
import { Pool } from 'pg';
import { getReadReplicaPool } from '../src/lib/database/read-replica-pool';
import { ConsistencyLevel } from '../src/lib/database/query-analyzer';

interface BenchmarkResult {
  name: string;
  operations: number;
  duration: number;
  opsPerSecond: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errors: number;
}

class DatabaseBenchmark {
  private singlePool: Pool;
  private replicaPool: ReturnType<typeof getReadReplicaPool>;
  private results: BenchmarkResult[] = [];

  constructor() {
    // Single database connection (old approach)
    this.singlePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });

    // Read replica pool (new approach)
    this.replicaPool = getReadReplicaPool();
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<void> {
    console.log('🚀 Starting Database Performance Benchmarks\n');
    console.log('=' .repeat(80));

    // Warmup
    await this.warmup();

    // Run benchmarks
    await this.benchmarkSimpleReads();
    await this.benchmarkComplexQueries();
    await this.benchmarkWrites();
    await this.benchmarkMixedWorkload();
    await this.benchmarkConcurrentLoad();
    await this.benchmarkCachedQueries();
    await this.benchmarkTransactions();

    // Print results
    this.printResults();

    // Cleanup
    await this.cleanup();
  }

  /**
   * Warmup connections
   */
  private async warmup(): Promise<void> {
    console.log('Warming up connections...\n');

    // Warmup single pool
    for (let i = 0; i < 5; i++) {
      const client = await this.singlePool.connect();
      await client.query('SELECT 1');
      client.release();
    }

    // Warmup replica pool
    for (let i = 0; i < 5; i++) {
      await this.replicaPool.query('SELECT 1');
    }

    console.log('Warmup complete\n');
  }

  /**
   * Benchmark simple read queries
   */
  private async benchmarkSimpleReads(): Promise<void> {
    console.log('📖 Benchmarking Simple Reads...');

    const query = 'SELECT * FROM properties WHERE council_id = $1 LIMIT 10';
    const params = [1];
    const operations = 1000;

    // Test single pool
    const singleResult = await this.runBenchmark(
      'Simple Reads - Single DB',
      operations,
      async () => {
        const result = await this.singlePool.query(query, params);
        return result.rows;
      }
    );

    // Test replica pool
    const replicaResult = await this.runBenchmark(
      'Simple Reads - Replica Pool',
      operations,
      async () => {
        const result = await this.replicaPool.query(query, params);
        return result.rows;
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark complex queries with joins
   */
  private async benchmarkComplexQueries(): Promise<void> {
    console.log('🔍 Benchmarking Complex Queries...');

    const query = `
      SELECT
        p.*,
        c.name as council_name,
        COUNT(a.*) as amenity_count
      FROM properties p
      JOIN councils c ON p.council_id = c.id
      LEFT JOIN amenities a ON ST_DWithin(p.location, a.location, 1000)
      WHERE p.price BETWEEN $1 AND $2
      GROUP BY p.id, c.name
      LIMIT 20
    `;
    const params = [500000, 1000000];
    const operations = 100;

    const singleResult = await this.runBenchmark(
      'Complex Queries - Single DB',
      operations,
      async () => {
        const result = await this.singlePool.query(query, params);
        return result.rows;
      }
    );

    const replicaResult = await this.runBenchmark(
      'Complex Queries - Replica Pool',
      operations,
      async () => {
        const result = await this.replicaPool.query(query, params, {
          cached: true,
          cacheTimeout: 60000,
        });
        return result.rows;
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark write operations
   */
  private async benchmarkWrites(): Promise<void> {
    console.log('✍️  Benchmarking Write Operations...');

    const operations = 100;

    const singleResult = await this.runBenchmark(
      'Writes - Single DB',
      operations,
      async () => {
        const result = await this.singlePool.query(
          `INSERT INTO property_views (property_id, viewed_at, session_id)
           VALUES ($1, NOW(), $2)
           ON CONFLICT (property_id, session_id)
           DO UPDATE SET viewed_at = NOW()
           RETURNING *`,
          [Math.floor(Math.random() * 1000), `session_${Math.random()}`]
        );
        return result.rows[0];
      }
    );

    const replicaResult = await this.runBenchmark(
      'Writes - Replica Pool (Smart Routing)',
      operations,
      async () => {
        const result = await this.replicaPool.query(
          `INSERT INTO property_views (property_id, viewed_at, session_id)
           VALUES ($1, NOW(), $2)
           ON CONFLICT (property_id, session_id)
           DO UPDATE SET viewed_at = NOW()
           RETURNING *`,
          [Math.floor(Math.random() * 1000), `session_${Math.random()}`],
          { forceWrite: true }
        );
        return result.rows[0];
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark mixed read/write workload
   */
  private async benchmarkMixedWorkload(): Promise<void> {
    console.log('🔄 Benchmarking Mixed Workload (90% reads, 10% writes)...');

    const operations = 1000;

    const singleResult = await this.runBenchmark(
      'Mixed - Single DB',
      operations,
      async () => {
        const isWrite = Math.random() < 0.1;

        if (isWrite) {
          await this.singlePool.query(
            'UPDATE properties SET views = views + 1 WHERE id = $1',
            [Math.floor(Math.random() * 1000)]
          );
        } else {
          await this.singlePool.query(
            'SELECT * FROM properties WHERE id = $1',
            [Math.floor(Math.random() * 1000)]
          );
        }
      }
    );

    const replicaResult = await this.runBenchmark(
      'Mixed - Replica Pool',
      operations,
      async () => {
        const isWrite = Math.random() < 0.1;

        if (isWrite) {
          await this.replicaPool.query(
            'UPDATE properties SET views = views + 1 WHERE id = $1',
            [Math.floor(Math.random() * 1000)]
          );
        } else {
          await this.replicaPool.query(
            'SELECT * FROM properties WHERE id = $1',
            [Math.floor(Math.random() * 1000)],
            { cached: true }
          );
        }
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark concurrent load
   */
  private async benchmarkConcurrentLoad(): Promise<void> {
    console.log('⚡ Benchmarking Concurrent Load (50 parallel connections)...');

    const concurrency = 50;
    const operationsPerConnection = 20;

    const singleResult = await this.runConcurrentBenchmark(
      'Concurrent - Single DB',
      concurrency,
      operationsPerConnection,
      async () => {
        const result = await this.singlePool.query(
          'SELECT * FROM councils ORDER BY RANDOM() LIMIT 5'
        );
        return result.rows;
      }
    );

    const replicaResult = await this.runConcurrentBenchmark(
      'Concurrent - Replica Pool',
      concurrency,
      operationsPerConnection,
      async () => {
        const result = await this.replicaPool.query(
          'SELECT * FROM councils ORDER BY RANDOM() LIMIT 5'
        );
        return result.rows;
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark cached queries
   */
  private async benchmarkCachedQueries(): Promise<void> {
    console.log('💾 Benchmarking Cached Queries...');

    const query = 'SELECT * FROM councils WHERE active = true';
    const operations = 1000;

    // Prime the cache
    await this.replicaPool.query(query, [], { cached: true });

    const singleResult = await this.runBenchmark(
      'Cached - Single DB (No Cache)',
      operations,
      async () => {
        const result = await this.singlePool.query(query);
        return result.rows;
      }
    );

    const replicaResult = await this.runBenchmark(
      'Cached - Replica Pool (With Cache)',
      operations,
      async () => {
        const result = await this.replicaPool.query(query, [], {
          cached: true,
          cacheTimeout: 300000,
        });
        return result.rows;
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Benchmark transactions
   */
  private async benchmarkTransactions(): Promise<void> {
    console.log('🔒 Benchmarking Transactions...');

    const operations = 50;

    const singleResult = await this.runBenchmark(
      'Transactions - Single DB',
      operations,
      async () => {
        const client = await this.singlePool.connect();
        try {
          await client.query('BEGIN');
          await client.query('INSERT INTO audit_log (action) VALUES ($1)', ['test']);
          await client.query('UPDATE stats SET count = count + 1');
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    );

    const replicaResult = await this.runBenchmark(
      'Transactions - Replica Pool',
      operations,
      async () => {
        await this.replicaPool.transaction(async (client) => {
          await client.query('INSERT INTO audit_log (action) VALUES ($1)', ['test']);
          await client.query('UPDATE stats SET count = count + 1');
        });
      }
    );

    this.results.push(singleResult, replicaResult);
    this.compareResults(singleResult, replicaResult);
  }

  /**
   * Run a benchmark
   */
  private async runBenchmark(
    name: string,
    operations: number,
    fn: () => Promise<any>
  ): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    let errors = 0;

    const startTime = performance.now();

    for (let i = 0; i < operations; i++) {
      const opStart = performance.now();
      try {
        await fn();
        latencies.push(performance.now() - opStart);
      } catch (error) {
        errors++;
      }
    }

    const duration = performance.now() - startTime;

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    return {
      name,
      operations,
      duration,
      opsPerSecond: (operations / duration) * 1000,
      avgLatency,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      errors,
    };
  }

  /**
   * Run a concurrent benchmark
   */
  private async runConcurrentBenchmark(
    name: string,
    concurrency: number,
    operationsPerConnection: number,
    fn: () => Promise<any>
  ): Promise<BenchmarkResult> {
    const startTime = performance.now();
    const allLatencies: number[] = [];
    let totalErrors = 0;

    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(
        (async () => {
          const latencies: number[] = [];
          let errors = 0;

          for (let j = 0; j < operationsPerConnection; j++) {
            const opStart = performance.now();
            try {
              await fn();
              latencies.push(performance.now() - opStart);
            } catch (error) {
              errors++;
            }
          }

          return { latencies, errors };
        })()
      );
    }

    const results = await Promise.all(promises);

    // Aggregate results
    for (const result of results) {
      allLatencies.push(...result.latencies);
      totalErrors += result.errors;
    }

    const duration = performance.now() - startTime;
    const totalOperations = concurrency * operationsPerConnection;

    // Calculate percentiles
    allLatencies.sort((a, b) => a - b);
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)];
    const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)];
    const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;

    return {
      name,
      operations: totalOperations,
      duration,
      opsPerSecond: (totalOperations / duration) * 1000,
      avgLatency,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      errors: totalErrors,
    };
  }

  /**
   * Compare two benchmark results
   */
  private compareResults(single: BenchmarkResult, replica: BenchmarkResult): void {
    const improvement = replica.opsPerSecond / single.opsPerSecond;
    const latencyReduction = ((single.avgLatency - replica.avgLatency) / single.avgLatency) * 100;

    console.log(`  📊 Performance Improvement: ${improvement.toFixed(2)}x`);
    console.log(`  ⏱️  Latency Reduction: ${latencyReduction.toFixed(1)}%`);
    console.log();
  }

  /**
   * Print all results
   */
  private printResults(): void {
    console.log('=' .repeat(80));
    console.log('\n📈 BENCHMARK RESULTS SUMMARY\n');
    console.log('=' .repeat(80));

    // Create comparison table
    console.log('\n| Benchmark | Single DB (ops/s) | Replica Pool (ops/s) | Improvement |');
    console.log('|-----------|-------------------|----------------------|-------------|');

    for (let i = 0; i < this.results.length; i += 2) {
      const single = this.results[i];
      const replica = this.results[i + 1];
      const improvement = replica.opsPerSecond / single.opsPerSecond;

      console.log(
        `| ${single.name.padEnd(25).substring(0, 25)} | ${single.opsPerSecond
          .toFixed(2)
          .padStart(17)} | ${replica.opsPerSecond
          .toFixed(2)
          .padStart(20)} | ${improvement.toFixed(2).padStart(11)}x |`
      );
    }

    // Calculate overall improvement
    const singleTotal = this.results
      .filter((_, i) => i % 2 === 0)
      .reduce((sum, r) => sum + r.opsPerSecond, 0);
    const replicaTotal = this.results
      .filter((_, i) => i % 2 === 1)
      .reduce((sum, r) => sum + r.opsPerSecond, 0);
    const overallImprovement = replicaTotal / singleTotal;

    console.log('\n' + '=' .repeat(80));
    console.log(`\n🎯 OVERALL PERFORMANCE IMPROVEMENT: ${overallImprovement.toFixed(2)}x`);
    console.log('\n' + '=' .repeat(80));

    // Print latency statistics
    console.log('\n📊 LATENCY STATISTICS (ms)\n');
    console.log('| Benchmark | P50 Single | P50 Replica | P95 Single | P95 Replica | P99 Single | P99 Replica |');
    console.log('|-----------|------------|-------------|------------|-------------|------------|-------------|');

    for (let i = 0; i < this.results.length; i += 2) {
      const single = this.results[i];
      const replica = this.results[i + 1];

      console.log(
        `| ${single.name.padEnd(25).substring(0, 25)} | ${single.p50Latency
          .toFixed(2)
          .padStart(10)} | ${replica.p50Latency
          .toFixed(2)
          .padStart(11)} | ${single.p95Latency
          .toFixed(2)
          .padStart(10)} | ${replica.p95Latency
          .toFixed(2)
          .padStart(11)} | ${single.p99Latency
          .toFixed(2)
          .padStart(10)} | ${replica.p99Latency.toFixed(2).padStart(11)} |`
      );
    }

    // Get replica pool stats
    const stats = this.replicaPool.getStats();
    console.log('\n📊 REPLICA POOL STATISTICS\n');
    console.log(`  Total Queries: ${stats.totalQueries}`);
    console.log(`  Read Queries: ${stats.readQueries} (${((stats.readQueries / stats.totalQueries) * 100).toFixed(1)}%)`);
    console.log(`  Write Queries: ${stats.writeQueries} (${((stats.writeQueries / stats.totalQueries) * 100).toFixed(1)}%)`);
    console.log(`  Cache Hits: ${stats.cacheHits}`);
    console.log(`  Cache Misses: ${stats.cacheMisses}`);
    console.log(`  Cache Hit Rate: ${((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100).toFixed(1)}%`);
    console.log(`  Average Query Time: ${stats.averageQueryTime.toFixed(2)}ms`);
  }

  /**
   * Cleanup connections
   */
  private async cleanup(): Promise<void> {
    await this.singlePool.end();
    await this.replicaPool.shutdown();
  }
}

// Run benchmarks
if (require.main === module) {
  const benchmark = new DatabaseBenchmark();

  benchmark
    .runAll()
    .then(() => {
      console.log('\n✅ Benchmarks completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark failed:', error);
      process.exit(1);
    });
}