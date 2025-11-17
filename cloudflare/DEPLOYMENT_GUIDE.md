# Cloudflare Workers Edge Caching Deployment Guide

## Overview

This guide walks you through deploying the edge caching layer using Cloudflare Workers to achieve global <50ms latency and 95%+ cache hit rates.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install with `npm install -g wrangler`
3. **Domain on Cloudflare**: Your domain must be using Cloudflare DNS

## Step 1: Initial Setup

### 1.1 Install Dependencies

```bash
cd workers
npm install
```

### 1.2 Authenticate Wrangler

```bash
wrangler login
```

### 1.3 Get Your Account Details

```bash
# Get account ID
wrangler whoami

# List your zones to get zone ID
wrangler zones list
```

## Step 2: Configure Workers

### 2.1 Update wrangler.toml

Edit `/workers/wrangler.toml` with your details:

```toml
account_id = "YOUR_ACCOUNT_ID"
zone_id = "YOUR_ZONE_ID"

[env.production.vars]
ORIGIN_URL = "https://your-vercel-app.vercel.app"
CLOUDFLARE_API_TOKEN = "YOUR_API_TOKEN"
CLOUDFLARE_ZONE_ID = "YOUR_ZONE_ID"
```

### 2.2 Create KV Namespace

```bash
# Create KV namespace for cache metadata
wrangler kv:namespace create "CACHE_METADATA"

# For staging/preview
wrangler kv:namespace create "CACHE_METADATA" --preview
```

Update `wrangler.toml` with the generated IDs:

```toml
kv_namespaces = [
  { binding = "CACHE_METADATA", id = "GENERATED_ID", preview_id = "PREVIEW_ID" }
]
```

### 2.3 Generate API Tokens

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create token with permissions:
   - Zone:Cache Purge:Edit
   - Zone:Zone:Read
   - Account:Cloudflare Workers:Edit

## Step 3: Deploy Workers

### 3.1 Deploy Edge Cache Worker

```bash
# Deploy to production
wrangler publish edge-cache.ts

# Deploy to staging
wrangler publish edge-cache.ts --env staging
```

### 3.2 Deploy Cache Invalidation Worker

```bash
wrangler publish cache-invalidation.ts --name nw-london-cache-invalidation
```

### 3.3 Configure Routes

Add routes in Cloudflare Dashboard or via wrangler:

```bash
# Add production route
wrangler route add "nw-london.example.com/*" edge-cache

# Add staging route
wrangler route add "staging.nw-london.example.com/*" edge-cache --env staging
```

## Step 4: Configure Next.js Application

### 4.1 Update Environment Variables

Add to `.env.production`:

```env
# Cloudflare Configuration
CLOUDFLARE_ZONE_ID=your_zone_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_PURGE_TOKEN=your_secure_purge_token
EDGE_CACHE_URL=https://edge.nw-london.example.com
```

### 4.2 Update Next.js Config

Edit `next.config.js`:

```javascript
module.exports = {
  // ... existing config

  // Add cache headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, stale-while-revalidate=600',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // For Vercel deployment
  experimental: {
    incrementalCacheHandlerPath: './cache-handler.js',
  },
};
```

### 4.3 Implement Request Deduplication

Add to your API routes:

```typescript
// /src/pages/api/properties/[id].ts
import { withDeduplication } from '@/lib/deduplication/middleware';

export default withDeduplication(
  async (req, res) => {
    // Your API logic here
  },
  {
    ttl: 5000,
    enableMetrics: true,
  }
);
```

## Step 5: Configure DNS

### 5.1 Create CNAME Records

In Cloudflare DNS:

```
Type: CNAME
Name: edge
Value: your-zone.workers.dev
Proxy: Yes (Orange Cloud)
```

### 5.2 Configure SSL/TLS

1. Go to SSL/TLS → Overview
2. Set encryption mode to "Full (strict)"
3. Enable "Always Use HTTPS"

## Step 6: Testing

### 6.1 Test Edge Cache

```bash
# Test cache hit
curl -I https://edge.nw-london.example.com/api/properties

# Check headers
curl -I https://edge.nw-london.example.com/api/properties | grep -E "X-Cache|CF-Cache-Status"
```

### 6.2 Test Cache Invalidation

```bash
# Purge by tag
curl -X POST https://edge.nw-london.example.com/purge \
  -H "Authorization: Bearer YOUR_PURGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["property"]}'

# Purge specific URL
curl -X POST https://edge.nw-london.example.com/purge \
  -H "Authorization: Bearer YOUR_PURGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["/api/properties/123"]}'
```

### 6.3 Monitor Performance

```bash
# Tail worker logs
wrangler tail edge-cache

# View metrics in dashboard
open https://dash.cloudflare.com/?to=/:account/workers/services/view/edge-cache/production
```

## Step 7: Performance Optimization

### 7.1 Enable Argo Smart Routing

1. Go to Traffic → Argo
2. Enable Argo Smart Routing (~30% performance improvement)

### 7.2 Configure Page Rules

Create page rules for specific patterns:

```
URL: nw-london.example.com/api/*
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 hour
- Browser Cache TTL: 5 minutes
```

### 7.3 Enable Automatic Platform Optimization

1. Go to Speed → Optimization
2. Enable APO for WordPress/static sites

## Step 8: Monitoring & Analytics

### 8.1 Set Up Analytics

```bash
# View worker analytics
wrangler tail edge-cache --format pretty

# Export metrics
wrangler tail edge-cache --format json > metrics.json
```

### 8.2 Create Dashboards

Use Cloudflare Analytics or integrate with:
- Datadog
- New Relic
- Grafana

### 8.3 Set Up Alerts

Configure alerts for:
- Cache hit rate < 90%
- Origin latency > 500ms
- Error rate > 1%

## Step 9: Cache Invalidation Strategies

### 9.1 Automatic Invalidation

Set up webhooks from your CMS/database:

```typescript
// On data change
await fetch('https://edge.nw-london.example.com/purge', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${PURGE_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tags: ['property', `property-${id}`],
  }),
});
```

### 9.2 Scheduled Invalidation

Use Cloudflare Workers Cron Triggers:

```toml
[[triggers.crons]]
name = "daily-cache-refresh"
crons = ["0 0 * * *"]
```

### 9.3 Manual Invalidation

Via Cloudflare Dashboard or API:

```bash
# Purge everything (use sparingly)
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything": true}'
```

## Step 10: Production Checklist

- [ ] Workers deployed to production
- [ ] KV namespaces configured
- [ ] Routes configured correctly
- [ ] SSL/TLS set to Full (strict)
- [ ] Environment variables set
- [ ] Request deduplication implemented
- [ ] Cache headers configured
- [ ] Monitoring set up
- [ ] Alerts configured
- [ ] Cache invalidation tested
- [ ] Performance benchmarks met

## Performance Expectations

After deployment, you should see:

- **Global Latency**: <50ms from 200+ locations
- **Cache Hit Rate**: 95%+ for static content, 80%+ for API
- **Origin Offload**: 90%+ reduction in origin requests
- **Bandwidth Savings**: 85%+ reduction
- **Response Times**:
  - Cache hits: 10-50ms
  - Cache misses: 100-300ms
  - Stale-while-revalidate: 10-50ms

## Troubleshooting

### Common Issues

1. **Cache not working**: Check routes and DNS configuration
2. **High origin load**: Verify cache headers and TTLs
3. **Stale content**: Check cache invalidation and TTLs
4. **403 errors**: Verify API tokens and permissions

### Debug Commands

```bash
# Check worker status
wrangler tail edge-cache --status

# View real-time logs
wrangler tail edge-cache --format pretty

# Test specific route
curl -I -H "CF-Debug: true" https://your-domain.com/api/test
```

## Cost Optimization

- Workers: 100,000 requests/day free
- KV: 100,000 reads/day free
- Additional: $0.50 per million requests
- Bandwidth: Included with Cloudflare plan

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/cli-wrangler/)
- [Community Discord](https://discord.gg/cloudflaredev)