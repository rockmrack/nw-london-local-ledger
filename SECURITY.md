# Security Policy

## Reporting Security Vulnerabilities

We take the security of NW London Local Ledger seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email security concerns to: **security@example.com**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 72 hours
- **Status Update**: Weekly until resolved
- **Resolution**: Depends on severity (critical issues within 7 days)

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Best Practices

### API Keys and Secrets

**Never commit sensitive information to the repository.**

✅ **DO:**
- Use environment variables for all secrets
- Use `.env.local` for local development
- Add all sensitive files to `.gitignore`
- Rotate API keys regularly
- Use different keys for different environments

❌ **DON'T:**
- Hardcode API keys in source code
- Commit `.env` files
- Share production credentials
- Use production keys in development

### Example Environment Variable Management

```bash
# .env.example (committed to repository)
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
REDIS_URL=redis://localhost:6379
LAND_REGISTRY_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here

# .env.local (git-ignored, for local development)
DATABASE_URL=postgresql://dev:devpass@localhost:5432/nw_ledger_dev
REDIS_URL=redis://localhost:6379
LAND_REGISTRY_API_KEY=actual_dev_key_123
OPENAI_API_KEY=actual_openai_key_456
```

## Data Protection

### Personal Data

We handle property data which may include addresses and historical ownership information.

**Compliance Requirements:**
- GDPR compliance for UK/EU data
- Data Protection Act 2018
- ICO registration for data processing

**Data Handling:**
- Minimize personal data collection
- Encrypt sensitive data at rest
- Use HTTPS for all data in transit
- Implement data retention policies
- Provide data deletion mechanisms

### Database Security

```typescript
// ✅ Good: Use parameterized queries
const property = await db.query(
  'SELECT * FROM properties WHERE id = $1',
  [propertyId]
);

// ❌ Bad: SQL injection vulnerability
const property = await db.query(
  `SELECT * FROM properties WHERE id = ${propertyId}`
);
```

### Input Validation

```typescript
import { z } from 'zod';

// ✅ Good: Validate all user input
const propertySearchSchema = z.object({
  postcode: z.string().regex(/^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
});

app.post('/api/search', async (req, res) => {
  try {
    const validated = propertySearchSchema.parse(req.body);
    // Proceed with validated data
  } catch (error) {
    return res.status(400).json({ error: 'Invalid input' });
  }
});
```

## Authentication and Authorization

### API Security

```typescript
// Implement rate limiting
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

app.use('/api/', apiLimiter);
```

### CORS Configuration

```typescript
// Configure CORS properly
import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://nwlondonledger.com']
    : ['http://localhost:3000'],
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(cors(corsOptions));
```

## Web Scraping Security

### Respect Robots.txt

```python
from urllib.robotparser import RobotFileParser

class SecureScraper:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.robot_parser = RobotFileParser()
        self.robot_parser.set_url(f"{base_url}/robots.txt")
        self.robot_parser.read()

    def can_fetch(self, url: str) -> bool:
        return self.robot_parser.can_fetch("*", url)
```

### Rate Limiting

```python
import time
from datetime import datetime, timedelta

class RateLimiter:
    def __init__(self, requests_per_second: int = 1):
        self.min_interval = 1.0 / requests_per_second
        self.last_request = None

    async def acquire(self):
        if self.last_request:
            elapsed = (datetime.now() - self.last_request).total_seconds()
            if elapsed < self.min_interval:
                await asyncio.sleep(self.min_interval - elapsed)
        self.last_request = datetime.now()
```

### User Agent Identification

```python
# Always identify your scraper
HEADERS = {
    'User-Agent': 'NWLondonLedger-Bot/1.0 (https://nwlondonledger.com; contact@example.com)',
}
```

## Dependency Security

### Regular Updates

```bash
# Check for vulnerabilities
npm audit

# Fix automatically when possible
npm audit fix

# Review and fix manually
npm audit fix --force
```

### Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
```

## Infrastructure Security

### Environment Isolation

```yaml
environments:
  development:
    - Isolated development database
    - Test API keys
    - Local Redis instance

  staging:
    - Separate staging infrastructure
    - Production-like data (anonymized)
    - Staging API keys

  production:
    - Production database with backups
    - Real API keys (rotated regularly)
    - Production Redis with persistence
```

### Network Security

```yaml
security_groups:
  web:
    ingress:
      - port: 443 (HTTPS only)
      - source: 0.0.0.0/0
    egress:
      - All traffic to database security group

  database:
    ingress:
      - port: 5432
      - source: web security group
    egress:
      - None
```

## Content Security Policy

```typescript
// next.config.js
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.nwlondonledger.com"
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

## Logging and Monitoring

### Security Event Logging

```typescript
import winston from 'winston';

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'security' },
  transports: [
    new winston.transports.File({ filename: 'security.log' }),
  ],
});

// Log security events
securityLogger.warn('Failed login attempt', {
  ip: req.ip,
  timestamp: new Date(),
  endpoint: req.path,
});
```

### Monitoring

- Monitor failed authentication attempts
- Track unusual API usage patterns
- Alert on suspicious scraping activity
- Monitor database query patterns
- Track API key usage

## Data Backup and Recovery

### Backup Strategy

```yaml
backups:
  database:
    frequency: Daily
    retention: 30 days
    encryption: AES-256
    location: AWS S3 (encrypted)

  redis:
    frequency: Hourly
    retention: 7 days

  files:
    frequency: Daily
    retention: 14 days
```

### Disaster Recovery

- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 24 hours
- Regular disaster recovery drills
- Documented recovery procedures

## AI/ML Security

### OpenAI API Security

```typescript
// Sanitize prompts
const sanitizePrompt = (input: string): string => {
  // Remove any potential injection attempts
  return input
    .replace(/[<>]/g, '')
    .substring(0, 1000); // Limit length
};

// Monitor token usage
const trackTokenUsage = async (tokens: number) => {
  const usage = await redis.incr('openai:tokens:daily');
  if (usage > DAILY_TOKEN_LIMIT) {
    throw new Error('Daily token limit exceeded');
  }
};
```

### Content Validation

```typescript
// Validate AI-generated content
const validateContent = (content: string): boolean => {
  // Check for inappropriate content
  // Check for factual accuracy markers
  // Validate against brand guidelines
  return true;
};
```

## Incident Response Plan

### Response Team

- Security Lead: Coordinates response
- Development Lead: Technical investigation
- Operations Lead: Infrastructure response
- Legal Counsel: Compliance and notification

### Response Steps

1. **Detection**: Identify and verify security incident
2. **Containment**: Isolate affected systems
3. **Investigation**: Determine scope and impact
4. **Eradication**: Remove threat and vulnerabilities
5. **Recovery**: Restore systems to normal operation
6. **Lessons Learned**: Document and improve processes

## Compliance

### Regulatory Compliance

- **GDPR**: EU data protection
- **DPA 2018**: UK data protection
- **ICO Guidelines**: UK Information Commissioner's Office
- **Land Registry License**: Property data usage terms

### Audit Trail

- Log all data access
- Track data modifications
- Record API usage
- Monitor scraping activities

## Security Checklist

### Before Deployment

- [ ] All secrets moved to environment variables
- [ ] SQL injection vulnerabilities checked
- [ ] XSS vulnerabilities checked
- [ ] CSRF protection enabled
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting implemented
- [ ] Input validation in place
- [ ] Error messages don't expose sensitive info
- [ ] Dependencies updated and scanned
- [ ] Backups configured and tested
- [ ] Monitoring and alerting set up

### Regular Maintenance

- [ ] Weekly dependency updates
- [ ] Monthly security audits
- [ ] Quarterly penetration testing
- [ ] Annual disaster recovery drills
- [ ] Continuous monitoring review

---

**Last Updated**: November 2024

For security concerns, contact: security@example.com
