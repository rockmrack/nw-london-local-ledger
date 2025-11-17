# API Usage Guidelines

## 🎯 Overview

This document outlines our policies and best practices for using external APIs to collect property and planning data. We prioritize APIs over web scraping wherever possible.

## 📋 API Priority List

### Tier 1: Government APIs (Preferred)
| API | Purpose | Auth | Rate Limit | Cost |
|-----|---------|------|------------|------|
| HM Land Registry | Property transactions | None/API Key | 10 req/s | Free (OGL) / £3 per title |
| EPC Register | Energy certificates | API Key | 100 req/s | Free |
| Police.uk | Crime statistics | None | 15 req/s | Free |
| ONS API | Demographics | None | 100 req/s | Free |

### Tier 2: Transport APIs
| API | Purpose | Auth | Rate Limit | Cost |
|-----|---------|------|------------|------|
| TfL Unified API | Transport data | API Key | 500 req/s | Free |
| National Rail | Train services | API Key | 50 req/s | Free |
| Citymapper | Journey planning | API Key | Variable | Paid tiers |

### Tier 3: Council APIs (Limited Availability)
| Council | API Available | Alternative |
|---------|--------------|-------------|
| Barnet | No | Web scraping / FOI |
| Brent | No | Web scraping / FOI |
| Camden | Partial | Planning portal |
| Ealing | No | Web scraping / FOI |
| Harrow | No | Web scraping / FOI |
| Westminster | Partial | Open data portal |

## 🔑 Authentication Management

### API Key Storage
```javascript
// Environment variables (recommended)
LAND_REGISTRY_API_KEY=xxx
EPC_API_KEY=xxx
TFL_API_KEY=xxx
POLICE_API_KEY=xxx

// Secure vault for production
const vault = new SecureVault();
const apiKey = await vault.getSecret('land-registry-api-key');
```

### Key Rotation Policy
- **Frequency:** Every 90 days
- **Method:** Automated rotation where supported
- **Backup:** Maintain previous key for 7 days
- **Documentation:** Log all rotations

## ⚡ Rate Limiting Best Practices

### Implementation Strategy
```javascript
class APIRateLimiter {
  constructor(requestsPerSecond) {
    this.rateLimit = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire() {
    // Token bucket algorithm
    this.refillTokens();

    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) * (1000 / this.rateLimit);
      await this.sleep(waitTime);
      return this.acquire();
    }

    this.tokens -= 1;
  }

  refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.rateLimit,
      this.tokens + (timePassed * this.rateLimit)
    );
    this.lastRefill = now;
  }
}
```

### Rate Limit Headers
```javascript
// Respect rate limit headers
const remaining = response.headers['x-ratelimit-remaining'];
const reset = response.headers['x-ratelimit-reset'];

if (remaining === '0') {
  const waitTime = reset - Date.now();
  await sleep(waitTime);
}
```

## 📊 Cost Management

### Budget Allocation
| Service | Monthly Budget | Alert Threshold | Hard Limit |
|---------|---------------|-----------------|------------|
| Land Registry Titles | £100 | £80 | £100 |
| Premium APIs | £50 | £40 | £50 |
| Total | £150 | £120 | £150 |

### Cost Tracking
```javascript
class APIUsageTracker {
  async trackUsage(api, endpoint, cost = 0) {
    const usage = {
      api,
      endpoint,
      cost,
      timestamp: new Date(),
      month: new Date().toISOString().slice(0, 7)
    };

    await this.db.insert('api_usage', usage);

    // Check budget
    const monthlyTotal = await this.getMonthlyTotal(api);
    if (monthlyTotal > BUDGET_LIMITS[api]) {
      await this.alertBudgetExceeded(api, monthlyTotal);
    }
  }
}
```

## 🔄 Failover Strategy

### API Failover Chain
```javascript
const failoverChain = {
  'property-data': [
    { method: 'api', service: 'land-registry' },
    { method: 'api', service: 'alternative-provider' },
    { method: 'scraping', service: 'council-website' },
    { method: 'cache', service: 'local-cache' },
    { method: 'foi', service: 'foi-request' }
  ],
  'planning-data': [
    { method: 'api', service: 'council-api' },
    { method: 'scraping', service: 'planning-portal' },
    { method: 'foi', service: 'bulk-request' }
  ]
};

async function getDataWithFailover(dataType, params) {
  const chain = failoverChain[dataType];

  for (const option of chain) {
    try {
      return await fetchData(option, params);
    } catch (error) {
      console.log(`Failed with ${option.service}, trying next...`);
      continue;
    }
  }

  throw new Error('All failover options exhausted');
}
```

## 📝 API Response Caching

### Caching Strategy
| Data Type | Cache Duration | Invalidation |
|-----------|---------------|--------------|
| Property prices | 24 hours | On update |
| Planning apps | 6 hours | Status change |
| Crime stats | 30 days | Monthly update |
| Transport | 5 minutes | Real-time |
| Demographics | 90 days | Quarterly |

### Cache Implementation
```javascript
class APICache {
  constructor(redis) {
    this.redis = redis;
  }

  async get(key, fetcher, ttl = 3600) {
    // Check cache
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch and cache
    const data = await fetcher();
    await this.redis.setex(
      key,
      ttl,
      JSON.stringify(data)
    );

    return data;
  }

  generateKey(api, endpoint, params) {
    const paramStr = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':');

    return `api:${api}:${endpoint}:${paramStr}`;
  }
}
```

## 🔍 API Monitoring

### Health Checks
```javascript
const healthChecks = [
  {
    name: 'Land Registry API',
    endpoint: 'https://landregistry.data.gov.uk/status',
    frequency: '5m',
    timeout: 5000
  },
  {
    name: 'EPC API',
    endpoint: 'https://epc.opendatacommunities.org/api/v1/status',
    frequency: '5m',
    timeout: 5000
  }
];

async function monitorAPIs() {
  for (const check of healthChecks) {
    try {
      const response = await axios.get(check.endpoint, {
        timeout: check.timeout
      });

      await logHealthStatus(check.name, 'healthy', response.status);
    } catch (error) {
      await logHealthStatus(check.name, 'unhealthy', error.message);
      await triggerFailover(check.name);
    }
  }
}
```

### Performance Metrics
```javascript
const metrics = {
  responseTime: histogram('api_response_time'),
  errorRate: counter('api_errors'),
  successRate: counter('api_success'),
  costPerRequest: histogram('api_cost')
};

async function trackAPICall(api, startTime, success, cost = 0) {
  const duration = Date.now() - startTime;

  metrics.responseTime.observe({ api }, duration);

  if (success) {
    metrics.successRate.inc({ api });
  } else {
    metrics.errorRate.inc({ api });
  }

  if (cost > 0) {
    metrics.costPerRequest.observe({ api }, cost);
  }
}
```

## 📋 Compliance Requirements

### Data Attribution
```javascript
const attributions = {
  'land-registry': '© Crown copyright and database rights 2024',
  'epc': 'Contains public sector information licensed under OGL v3.0',
  'police': 'Contains public sector information licensed under OGL v3.0',
  'tfl': 'Powered by TfL Open Data',
  'ons': '© Crown copyright 2024'
};

function getAttribution(source) {
  return attributions[source] || 'Data provided by ' + source;
}
```

### License Compliance
| API | License | Requirements |
|-----|---------|--------------|
| Land Registry | OGL v3.0 | Attribution required |
| EPC | OGL v3.0 | Attribution required |
| Police.uk | OGL v3.0 | Attribution required |
| TfL | TfL Terms | Attribution, no scraping |
| ONS | OGL v3.0 | Attribution required |

## 🚨 Error Handling

### Retry Strategy
```javascript
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    429, // Too Many Requests
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ]
};

async function apiCallWithRetry(fn, config = retryConfig) {
  let lastError;
  let delay = config.initialDelay;

  for (let i = 0; i < config.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error, config)) {
        throw error;
      }

      if (i < config.maxRetries - 1) {
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }
  }

  throw lastError;
}
```

## 📊 Reporting

### Monthly Usage Report Template
```markdown
# API Usage Report - [Month Year]

## Summary
- Total API Calls: X,XXX
- Total Cost: £XXX
- Average Response Time: XXXms
- Success Rate: XX%

## By Service
| Service | Calls | Cost | Avg Response | Success Rate |
|---------|-------|------|--------------|--------------|
| Land Registry | X,XXX | £XX | XXXms | XX% |
| EPC | X,XXX | £0 | XXXms | XX% |
| Police.uk | X,XXX | £0 | XXXms | XX% |
| TfL | X,XXX | £0 | XXXms | XX% |

## Issues & Resolutions
- [Date]: Service X experienced downtime, failover to cache
- [Date]: Rate limit exceeded on Service Y, adjusted timing

## Recommendations
- Consider caching extension for Service X
- Evaluate alternative provider for Service Y
- Budget increase needed for Service Z

## Compliance Status
✅ All attributions in place
✅ Rate limits respected
✅ Terms of service compliance verified
✅ API keys rotated on schedule
```

## 🔒 Security Best Practices

### API Key Security
1. **Never** commit keys to version control
2. **Always** use environment variables
3. **Rotate** keys regularly
4. **Monitor** for exposed keys
5. **Limit** key permissions
6. **Use** IP whitelisting where available

### Request Signing
```javascript
// Example HMAC signing
const crypto = require('crypto');

function signRequest(method, path, body, secret) {
  const timestamp = Date.now();
  const message = `${method}${path}${timestamp}${body}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return {
    'X-Timestamp': timestamp,
    'X-Signature': signature
  };
}
```

---

**Document Version:** 1.0
**Last Updated:** January 2024
**Next Review:** March 2024
**Contact:** api-team@nwlondonledger.com