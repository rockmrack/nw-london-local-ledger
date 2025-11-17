# Parallel Council Scraping System

## Overview

This directory contains an optimized parallel scraping system for collecting planning applications from all North West London council websites. The system has been upgraded from sequential to parallel processing, achieving significant performance improvements.

## Performance Improvements

### Before (Sequential Processing)
- **Processing Model**: Pages scraped one-by-one, councils processed sequentially
- **Rate Limiting**: 1 request per second per council
- **Estimated Time**: ~30 minutes for all councils (30 days of data)
- **Resource Usage**: Low CPU utilization, mostly waiting for network I/O

### After (Parallel Processing)
- **Processing Model**:
  - All 6 councils scrape simultaneously
  - Each council processes 5-10 pages in parallel
  - Smart chunking prevents overwhelming servers
- **Rate Limiting**:
  - 5 requests per second per council
  - Token bucket algorithm for burst handling
  - Automatic backoff on rate limit errors
- **Estimated Time**: ~5 minutes for all councils (30 days of data)
- **Resource Usage**: Efficient CPU and network utilization

**Expected Performance Gain**: **6x faster** (30 minutes → 5 minutes)

## Architecture

### Core Components

1. **ParallelBaseScraper** (`/councils/base/ParallelBaseScraper.ts`)
   - Enhanced base class with parallel processing capabilities
   - Token bucket rate limiting for burst handling
   - Real-time progress tracking and statistics
   - Automatic retry with exponential backoff

2. **ScraperOrchestrator** (`/orchestrator/ScraperOrchestrator.ts`)
   - Master controller for all council scrapers
   - Runs all scrapers in parallel using `Promise.all()`
   - Consolidated reporting and error handling
   - Graceful shutdown support

3. **ParallelProcessor** (`/utils/parallel-processor.ts`)
   - Generic parallel processing utility
   - Chunking support for controlled concurrency
   - Per-item error recovery
   - Progress callbacks

4. **Council Scrapers** (`/councils/*/Parallel*.ts`)
   - Individual scrapers for each council
   - Inherit from ParallelBaseScraper
   - Custom parsing logic per council website

## Usage

### Command Line

```bash
# Run all scrapers in parallel (last 30 days by default)
npm run scraper:parallel

# Run with specific date
npm run scraper:parallel 2024-01-01

# Build for production
npm run scraper:parallel:build
```

### Programmatic Usage

```typescript
import { ScraperOrchestrator } from '@/scrapers/orchestrator/ScraperOrchestrator';

const orchestrator = new ScraperOrchestrator();
const fromDate = new Date('2024-01-01');

// Run all scrapers
const stats = await orchestrator.scrapeAll(fromDate);

console.log(`Scraped ${stats.totalApplications} applications`);
console.log(`Time taken: ${stats.totalDuration}s`);
```

### Single Council Scraping

```typescript
import { ParallelBarnetScraper } from '@/scrapers/councils/barnet/ParallelBarnetScraper';

const scraper = new ParallelBarnetScraper();
const applications = await scraper.scrapePlanningApplications(new Date('2024-01-01'));
```

## Configuration

Each scraper can be configured with:

```typescript
const config: ParallelScraperConfig = {
  council: 'Barnet',
  baseUrl: 'https://...',
  rateLimit: 5,              // Requests per second
  maxRetries: 3,              // Retry failed requests
  timeout: 30000,             // Request timeout (ms)
  parallelPages: 10,          // Pages to process in parallel
  parallelDetails: 5,         // Detail pages to fetch in parallel
  useBurstRateLimit: true,    // Enable token bucket
  burstCapacity: 20           // Max burst size
};
```

## Error Handling

The system includes comprehensive error handling:

1. **Network Errors**: Automatic retry with exponential backoff
2. **Rate Limiting**: Token bucket prevents overwhelming servers
3. **Parse Errors**: Individual failures don't stop the scraper
4. **Graceful Degradation**: Failed scrapers don't affect others
5. **Detailed Logging**: Progress and error tracking per council

## Monitoring

Real-time monitoring during execution:

```
[Barnet] Progress: 25/50 pages (50%) | Speed: 5.2 pages/sec | ETA: 5s | Errors: 0
[Brent] Progress: 30/40 pages (75%) | Speed: 4.8 pages/sec | ETA: 2s | Errors: 1
```

Final consolidated report:

```
📊 OVERALL STATISTICS:
Total Applications: 2,847
Successful Scrapers: 6/6
Failed Scrapers: 0/6
Total Duration: 4m 32s
Average Speed: 10.5 applications/sec

📈 COUNCIL BREAKDOWN:
✅ Westminster  |  623 apps |   45.2s | 13.8 apps/s
✅ Barnet       |  542 apps |   48.1s | 11.3 apps/s
✅ Camden       |  498 apps |   42.3s | 11.8 apps/s
✅ Brent        |  456 apps |   44.5s | 10.2 apps/s
✅ Ealing       |  412 apps |   40.8s | 10.1 apps/s
✅ Harrow       |  316 apps |   38.2s |  8.3 apps/s
```

## Best Practices

1. **Respect Rate Limits**: Don't increase parallelism beyond configured limits
2. **Monitor Performance**: Check logs for rate limit errors or failures
3. **Graceful Shutdown**: Use Ctrl+C to stop scrapers cleanly
4. **Database Integration**: Process results in batches to avoid overwhelming the database
5. **Error Recovery**: Failed pages are retried automatically

## Troubleshooting

### Common Issues

1. **Rate Limit Errors**
   - Reduce `parallelPages` configuration
   - Increase delay between requests

2. **Memory Issues**
   - Process results in smaller batches
   - Reduce parallel concurrency

3. **Network Timeouts**
   - Increase `timeout` configuration
   - Check network connectivity

4. **Parse Errors**
   - Council website may have changed structure
   - Update selector patterns in scraper

## Development

### Adding a New Council

1. Create a new scraper extending `ParallelBaseScraper`
2. Implement `scrapePage()` and `getTotalPages()` methods
3. Add to `ScraperOrchestrator`
4. Test with small date range first

### Testing

```bash
# Run examples
tsx src/scrapers/examples/parallel-scraping-example.ts

# Test single council
npm run scraper:parallel 2024-12-01
```

## Files Modified/Created

### New Files
- `/src/scrapers/utils/parallel-processor.ts` - Parallel processing utilities
- `/src/scrapers/councils/base/ParallelBaseScraper.ts` - Enhanced base scraper
- `/src/scrapers/councils/*/Parallel*.ts` - Parallel versions of all council scrapers
- `/src/scrapers/orchestrator/ScraperOrchestrator.ts` - Master orchestrator
- `/src/scrapers/run-parallel-scrapers.ts` - CLI runner
- `/src/scrapers/examples/parallel-scraping-example.ts` - Usage examples
- `/src/scrapers/index.ts` - Module exports
- `/src/scrapers/README.md` - This documentation

### Modified Files
- `/home/user/nw-london-local-ledger/package.json` - Added npm scripts
- `/src/scrapers/councils/barnet/BarnetScraper.ts` - Added fetchPage method

## Future Improvements

1. **Database Integration**: Direct database writes during scraping
2. **Webhook Notifications**: Real-time updates on scraping progress
3. **Distributed Scraping**: Multiple machines for even faster processing
4. **Smart Scheduling**: Adaptive scraping based on council update patterns
5. **Data Deduplication**: Avoid re-scraping unchanged applications