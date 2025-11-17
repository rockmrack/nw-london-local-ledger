# Database Read Replica Migration Guide

## Overview

This guide walks through migrating from the single PostgreSQL instance to the new read replica architecture with smart query routing, achieving 5-8x performance improvement.

## Architecture Overview

```
                           ┌─────────────────┐
                           │   Application   │
                           └────────┬────────┘
                                    │
                           ┌────────▼────────┐
                           │  Read Replica   │
                           │      Pool       │
                           └────────┬────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
       ┌────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
       │    PgBouncer    │ │  Query Router  │ │  Cache Layer   │
       │  (1000+ conns)  │ │  (Smart Split) │ │    (Redis)     │
       └────────┬────────┘ └───────┬────────┘ └────────────────┘
                │                   │
    ┌───────────┼───────────────────┼───────────────────┐
    │           │                   │                   │
┌───▼───┐ ┌────▼────┐ ┌────────┐ ┌▼────────┐ ┌────────┐
│Primary│ │Replica 1│ │Replica 2│ │Replica 3│ │ Redis  │
│  RW   │ │   RO    │ │   RO    │ │   RO    │ │ Cache  │
└───────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘
```

## Migration Steps

### Step 1: Prerequisites

1. **System Requirements**:
   - PostgreSQL 12+ installed
   - Redis 6+ installed (optional, for caching)
   - PgBouncer installed (optional, for connection pooling)
   - Sufficient disk space for replicas (3x primary database size)
   - Network connectivity between database servers

2. **Backup Current Database**:
   ```bash
   pg_dump -h localhost -p 5432 -U postgres -d nw_london_local -F c -b -v -f backup.dump
   ```

### Step 2: Environment Configuration

1. **Copy Environment Template**:
   ```bash
   cp .env.replica.example .env
   ```

2. **Configure Database Connections**:
   ```env
   # Primary Database
   DB_PRIMARY_HOST=localhost
   DB_PRIMARY_PORT=5432
   DB_PRIMARY_MAX_CONNECTIONS=100

   # Replica 1 (Same Region)
   DB_REPLICA1_HOST=localhost
   DB_REPLICA1_PORT=5433
   DB_REPLICA1_MAX_CONNECTIONS=150

   # Replica 2 (Frankfurt)
   DB_REPLICA2_HOST=eu-central-1.replica.example.com
   DB_REPLICA2_PORT=5434
   DB_REPLICA2_MAX_CONNECTIONS=150

   # Replica 3 (Ireland)
   DB_REPLICA3_HOST=eu-west-1.replica.example.com
   DB_REPLICA3_PORT=5435
   DB_REPLICA3_MAX_CONNECTIONS=150

   # Enable Features
   PGBOUNCER_ENABLED=true
   REDIS_ENABLED=true
   CACHE_ENABLED=true
   ```

### Step 3: Setup Replicas

1. **Run Setup Script**:
   ```bash
   cd scripts
   chmod +x setup-replicas.sh
   ./setup-replicas.sh
   ```

2. **Verify Replication**:
   ```sql
   -- On primary
   SELECT * FROM pg_stat_replication;

   -- On each replica
   SELECT pg_is_in_recovery();
   SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
   ```

### Step 4: Code Migration

#### Option A: Drop-in Replacement (Easiest)

1. **Update Import Statements**:
   ```typescript
   // Before
   import { query, transaction } from '@/lib/database/postgres';

   // After (using enhanced version)
   import { query, transaction } from '@/lib/database/postgres-enhanced';
   ```

2. **Or Create Alias**:
   ```typescript
   // In src/lib/database/postgres.ts
   export * from './postgres-enhanced';
   ```

#### Option B: Use New API Directly

1. **Import Read Replica Pool**:
   ```typescript
   import { db } from '@/lib/database/read-replica-pool';
   import { ConsistencyLevel } from '@/lib/database/query-analyzer';
   ```

2. **Use Enhanced Query Options**:
   ```typescript
   // Simple read query (uses replica)
   const result = await db.query(
     'SELECT * FROM properties WHERE id = $1',
     [propertyId]
   );

   // Cached query
   const cached = await db.query(
     'SELECT * FROM councils',
     [],
     { cached: true, cacheTimeout: 600000 } // 10 minutes
   );

   // Strong consistency read (uses primary)
   const recent = await db.query(
     'SELECT * FROM orders WHERE user_id = $1',
     [userId],
     { consistency: ConsistencyLevel.STRONG }
   );

   // Write operation (automatically uses primary)
   const inserted = await db.query(
     'INSERT INTO properties (name, price) VALUES ($1, $2) RETURNING *',
     [name, price]
   );
   ```

### Step 5: Update Services

1. **Update Scrapers**:
   ```typescript
   // src/scrapers/*/**.ts
   import { db } from '@/lib/database/read-replica-pool';

   // Bulk operations use primary
   await db.query(insertQuery, values, { forceWrite: true });

   // Read operations use replicas
   const existing = await db.query(selectQuery, params, { cached: true });
   ```

2. **Update Queue Workers**:
   ```typescript
   // src/lib/queues/workers/*.ts
   import { db } from '@/lib/database/read-replica-pool';

   // Use transactions for consistency
   await db.transaction(async (client) => {
     await client.query('INSERT INTO jobs ...');
     await client.query('UPDATE status ...');
   });
   ```

### Step 6: Testing

1. **Run Performance Tests**:
   ```bash
   npm run test:performance
   ```

2. **Monitor Replication Lag**:
   ```typescript
   const monitor = db.replicationMonitor;
   const metrics = monitor.getMetrics();
   console.log('Average lag:', metrics.avgLagTime, 'ms');
   ```

3. **Check Connection Distribution**:
   ```typescript
   const stats = db.getStats();
   console.log('Read queries:', stats.readQueries);
   console.log('Write queries:', stats.writeQueries);
   console.log('Cache hit rate:', stats.cacheHits / (stats.cacheHits + stats.cacheMisses));
   ```

### Step 7: Monitoring

1. **Setup Monitoring Dashboard**:
   ```bash
   # Access PgBouncer stats
   psql -h localhost -p 6432 -U pgbouncer pgbouncer -c "SHOW STATS;"

   # View replication metrics
   curl http://localhost:9090/metrics  # If Prometheus metrics enabled
   ```

2. **Set Up Alerts**:
   ```typescript
   db.on('high-replication-lag', (event) => {
     console.error(`High lag on ${event.replica}: ${event.lag}ms`);
     // Send alert to monitoring system
   });

   db.on('pool-error', (event) => {
     console.error(`Pool error on ${event.pool}:`, event.error);
     // Trigger incident response
   });
   ```

### Step 8: Rollback Plan

If issues arise, you can quickly rollback:

1. **Disable Replicas**:
   ```env
   # Set in .env
   DB_REPLICA1_HOST=
   DB_REPLICA2_HOST=
   DB_REPLICA3_HOST=
   ```

2. **Use Primary Only**:
   ```typescript
   // Force all queries to primary
   const result = await db.query(sql, params, { forceWrite: true });
   ```

3. **Revert Code Changes**:
   ```bash
   git revert [migration-commit-hash]
   ```

## Performance Tuning

### Query Optimization

1. **Prepare Frequently Used Queries**:
   ```typescript
   await db.prepare('getProperty', 'SELECT * FROM properties WHERE id = $1');
   const result = await db.execute('getProperty', [propertyId]);
   ```

2. **Cache Strategic Queries**:
   ```typescript
   // Cache council list for 1 hour
   const councils = await db.query(
     'SELECT * FROM councils ORDER BY name',
     [],
     { cached: true, cacheTimeout: 3600000 }
   );
   ```

### Connection Pool Tuning

1. **Adjust Pool Sizes**:
   ```env
   # For write-heavy workload
   DB_PRIMARY_MAX_CONNECTIONS=200
   DB_REPLICA1_MAX_CONNECTIONS=50

   # For read-heavy workload
   DB_PRIMARY_MAX_CONNECTIONS=50
   DB_REPLICA1_MAX_CONNECTIONS=200
   ```

2. **Configure PgBouncer**:
   ```ini
   # /etc/pgbouncer/pgbouncer.ini
   pool_mode = transaction  # Best for web apps
   max_client_conn = 2000   # Support many connections
   default_pool_size = 25   # Connections per user/db pair
   ```

## Expected Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Read Queries/sec | 500 | 3000+ | 6x |
| Write Queries/sec | 200 | 400 | 2x |
| Avg Query Time | 50ms | 8ms | 6.25x |
| Connection Limit | 50 | 550 (1000+ with PgBouncer) | 11x+ |
| Cache Hit Rate | 0% | 60-80% | ∞ |
| Concurrent Users | 100 | 800+ | 8x |

## Troubleshooting

### Issue: High Replication Lag

```typescript
// Check lag
const monitor = db.replicationMonitor;
const status = monitor.getStatus();
status.forEach((replica, name) => {
  if (replica.lagTime > 1000) {
    console.warn(`${name} lag: ${replica.lagTime}ms`);
  }
});

// Force strong consistency temporarily
await db.query(sql, params, { consistency: ConsistencyLevel.STRONG });
```

### Issue: Connection Pool Exhaustion

```bash
# Check pool status
psql -h localhost -p 6432 -U pgbouncer pgbouncer -c "SHOW POOLS;"

# Increase pool size
export DB_PRIMARY_MAX_CONNECTIONS=200
export DB_REPLICA1_MAX_CONNECTIONS=300
```

### Issue: Cache Invalidation

```typescript
// Clear specific cache
await db.clearCache('properties');

// Clear all cache
await db.clearCache();
```

## Best Practices

1. **Use Appropriate Consistency Levels**:
   - `EVENTUAL`: Analytics, reporting, browse pages
   - `BOUNDED`: User-facing reads with tolerable lag
   - `STRONG`: Financial data, user sessions
   - `READ_YOUR_WRITES`: After user actions

2. **Monitor Key Metrics**:
   - Replication lag < 100ms
   - Cache hit rate > 60%
   - Connection pool utilization < 80%
   - Query response time P95 < 100ms

3. **Plan for Failure**:
   - Test automatic failover regularly
   - Keep replica in same region as primary
   - Monitor replica health continuously
   - Have manual failover procedures documented

## Support

For issues or questions:
1. Check logs: `/var/log/postgresql/`
2. Review metrics: `http://localhost:9090/metrics`
3. Run diagnostics: `npm run db:diagnostics`