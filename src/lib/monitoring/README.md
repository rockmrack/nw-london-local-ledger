# Application Performance Monitoring (APM) System

A comprehensive performance monitoring system for the NW London Local Ledger application, providing real-time insights into system performance, database queries, API endpoints, and resource utilization.

## Features

### Core Capabilities
- **Real-time Performance Tracking**: Monitor API response times, database queries, and cache operations
- **Prometheus-Compatible Metrics**: Export metrics in Prometheus format for integration with existing monitoring stacks
- **Automatic Error Detection**: Capture and categorize errors with full context
- **N+1 Query Detection**: Automatically detect and alert on N+1 database query patterns
- **Resource Monitoring**: Track CPU, memory, and connection pool usage
- **Performance Dashboards**: Built-in dashboard with real-time visualizations
- **Smart Alerting**: Configurable thresholds with severity levels and cooldown periods

### Key Metrics Tracked
- HTTP request duration and counts
- Database query performance and slow queries
- Cache hit/miss rates
- Queue job processing times and success rates
- Memory and CPU utilization
- Error rates and types
- Connection pool statistics

## Quick Start

### Basic Integration

```typescript
import { monitoringService, initializeMonitoring } from '@/lib/monitoring';

// Initialize monitoring on application start
initializeMonitoring({
  sampleRate: 1.0, // Sample 100% of requests
  slowQueryThreshold: 100, // ms
  slowApiThreshold: 1000, // ms
});
```

### Monitoring API Routes

```typescript
import { withMonitoring } from '@/lib/monitoring';

// Wrap your API handler
export const handler = withMonitoring(
  async (req, res) => {
    // Your API logic here
    return { success: true };
  },
  { operation: 'api.getUser' }
);
```

### Database Query Monitoring

```typescript
import { monitorDatabasePool, monitorQuery } from '@/lib/monitoring';
import { Pool } from 'pg';

// Wrap your database pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const monitoredPool = monitorDatabasePool(pool);

// Monitor individual queries
export const findUser = monitorQuery(
  async (id: string) => {
    const result = await monitoredPool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },
  'findUser'
);
```

### Cache Monitoring

```typescript
import { monitorCache } from '@/lib/monitoring';

export const getCached = monitorCache(
  async (key: string) => {
    return await redis.get(key);
  },
  (args) => args[0] // Extract key for monitoring
);
```

## API Endpoints

### Health Check
```
GET /api/monitoring/health
```
Returns overall system health status with individual component checks.

### Metrics Export
```
GET /api/monitoring/metrics?format=prometheus
GET /api/monitoring/metrics?format=json
```
Export metrics in Prometheus or JSON format.

### Performance Dashboard
```
GET /api/monitoring/performance?hours=24
```
Get comprehensive performance data for the specified time range.

### Alerts Management
```
GET /api/monitoring/alerts?active=true
POST /api/monitoring/alerts { action: 'resolve', alertId: '...' }
```
View and manage system alerts.

### Error Tracking
```
GET /api/monitoring/errors?hours=24
POST /api/monitoring/errors { error: {...}, context: {...} }
```
Track and analyze application errors.

### Dashboard Data
```
GET /api/monitoring/dashboard?hours=24
```
Get all dashboard data in a single request.

## Dashboard Access

Navigate to `/monitoring` in your browser to access the real-time monitoring dashboard.

Dashboard features:
- System health overview
- Key performance metrics
- Active alerts
- Resource utilization graphs
- Slow query analysis
- Error tracking

## Advanced Usage

### Custom Metrics

```typescript
import { metrics } from '@/lib/monitoring';

// Create custom counter
const userSignups = metrics.createCounter(
  'user_signups_total',
  'Total number of user signups'
);

// Increment counter
userSignups.inc(1, { source: 'web' });

// Create custom histogram
const searchLatency = metrics.createHistogram(
  'search_latency_seconds',
  'Search operation latency',
  [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5]
);

// Record observation
searchLatency.observe(0.234);
```

### Performance Spans

```typescript
import { monitoringService, createSpan } from '@/lib/monitoring';

async function complexOperation() {
  const requestId = monitoringService.startOperation('complexOperation');

  // Create nested spans
  const dbSpan = createSpan(requestId, 'database.query');
  const result = await db.query('...');
  dbSpan.end();

  const cacheSpan = createSpan(requestId, 'cache.write');
  await cache.set('key', result);
  cacheSpan.end();

  monitoringService.endOperation(requestId);
}
```

### Class Method Monitoring

```typescript
import { Monitor } from '@/lib/monitoring';

class UserService {
  @Monitor('UserService.findAll')
  async findAll() {
    return await db.query('SELECT * FROM users');
  }
}
```

### Batch Operations

```typescript
import { BatchMonitor } from '@/lib/monitoring';

async function batchProcess(items: any[]) {
  const batch = new BatchMonitor('batchProcess');

  for (const item of items) {
    batch.addOperation({
      id: item.id,
      processed: true
    });
  }

  batch.complete({ totalItems: items.length });
}
```

### Memory Leak Detection

```typescript
import { MemoryMonitor } from '@/lib/monitoring';

const memMonitor = new MemoryMonitor();

// Take snapshots
memMonitor.takeSnapshot('before');
// ... perform operations ...
memMonitor.takeSnapshot('after');

// Check for leaks
if (memMonitor.detectLeak()) {
  console.warn('Potential memory leak detected');
}
```

## Configuration

Environment variables for configuration:

```env
# Monitoring Configuration
MONITORING_ENABLED=true
MONITORING_SAMPLE_RATE=1.0        # 0-1, percentage of requests to sample
SLOW_QUERY_THRESHOLD=100          # ms
SLOW_API_THRESHOLD=1000           # ms
ERROR_RATE_THRESHOLD=5            # percentage
MEMORY_THRESHOLD=85               # percentage
CPU_THRESHOLD=80                  # percentage
METRICS_RETENTION_DAYS=30         # days to keep historical data
PERFORMANCE_DATA_DIR=./performance_data  # directory for storing metrics
```

## Alert Types

The system automatically generates alerts for:

- **SLOW_QUERY**: Database queries exceeding threshold
- **SLOW_API**: API endpoints with high response times
- **HIGH_ERROR_RATE**: Error rate exceeding threshold
- **HIGH_MEMORY**: Memory usage above threshold
- **HIGH_CPU**: CPU usage above threshold
- **CONNECTION_POOL_EXHAUSTED**: Database connection pool issues
- **CACHE_MISS_RATE**: Poor cache performance
- **QUEUE_BACKLOG**: Queue processing delays
- **SYSTEM_ERROR**: Critical system errors

## Performance Impact

The monitoring system is designed to have minimal overhead:

- **Memory**: ~10-50MB depending on buffer sizes
- **CPU**: <5% overhead in normal operation
- **Latency**: <1ms added to request processing
- **Storage**: Configurable retention with automatic cleanup

## Best Practices

1. **Sampling in Production**: Use sampling (0.1-0.5) to reduce overhead
2. **Custom Metrics**: Create business-specific metrics for KPIs
3. **Alert Tuning**: Adjust thresholds based on your application's normal behavior
4. **Regular Review**: Check dashboard weekly for performance trends
5. **Error Context**: Always provide context when recording errors
6. **Span Usage**: Use spans for complex operations to identify bottlenecks

## Troubleshooting

### High Memory Usage
- Check `METRICS_RETENTION_DAYS` setting
- Reduce sampling rate
- Clear old performance data: `rm -rf ./performance_data/*`

### Missing Metrics
- Verify `MONITORING_ENABLED=true`
- Check sampling rate isn't too low
- Ensure middleware is properly integrated

### Alert Fatigue
- Adjust alert thresholds
- Increase cooldown periods
- Use severity levels to prioritize

## Integration with External Tools

### Prometheus
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'nw-london-app'
    metrics_path: '/api/monitoring/metrics'
    params:
      format: ['prometheus']
    static_configs:
      - targets: ['localhost:3000']
```

### Grafana
Import the metrics into Grafana using the Prometheus data source for advanced visualizations.

## Security Considerations

- Monitoring endpoints should be protected in production
- Sensitive data should be excluded from error context
- Use environment variables for configuration
- Regular cleanup of old performance data

## Support

For issues or questions about the monitoring system, check:
- Dashboard at `/monitoring` for current status
- Logs for detailed error information
- Performance data directory for historical metrics