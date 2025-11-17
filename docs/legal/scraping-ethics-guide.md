# Ethical Web Scraping Guide

## 🎯 Core Principles

### 1. Transparency
- **Identify Yourself:** Always use descriptive User-Agent headers
- **Provide Contact:** Include email and website in User-Agent
- **State Purpose:** Clear about why you're collecting data
- **Public Documentation:** Maintain public page about data collection

### 2. Respect
- **Follow robots.txt:** Always check and comply
- **Honor Rate Limits:** Never overwhelm servers
- **Respect Business Hours:** Avoid peak traffic times
- **Check Terms of Service:** Review and comply with ToS

### 3. Responsibility
- **Data Minimization:** Only collect what you need
- **Secure Storage:** Protect collected data
- **Accurate Representation:** Don't misrepresent data
- **Attribution:** Always credit sources

## 📋 Pre-Scraping Checklist

### Legal Review
```
✓ Is the data publicly accessible?
✓ Have you reviewed the Terms of Service?
✓ Does robots.txt allow your intended access?
✓ Is there an API available instead?
✓ Have you checked for copyright restrictions?
✓ Do you need explicit consent?
```

### Technical Review
```
✓ Have you implemented rate limiting?
✓ Is your User-Agent transparent?
✓ Are you handling errors gracefully?
✓ Do you have retry logic with backoff?
✓ Are you caching to avoid repeat requests?
✓ Have you tested on a small scale first?
```

### Ethical Review
```
✓ Is there a legitimate purpose?
✓ Could this harm the website owner?
✓ Are you being transparent about usage?
✓ Would you be comfortable if roles were reversed?
✓ Have you considered the server load impact?
✓ Is the data being used responsibly?
```

## 🚦 Decision Framework

### Green Light (Proceed)
- ✅ Public government data
- ✅ Open data with clear licensing
- ✅ Explicit permission granted
- ✅ API available and accessible
- ✅ robots.txt allows access
- ✅ Terms of Service permit scraping

### Yellow Light (Proceed with Caution)
- ⚠️ No explicit prohibition
- ⚠️ Rate limits not specified
- ⚠️ Terms unclear
- ⚠️ High-traffic website
- ⚠️ Personal data involved
- ⚠️ Commercial website

### Red Light (Do Not Proceed)
- ❌ robots.txt disallows
- ❌ Terms prohibit scraping
- ❌ Authentication required
- ❌ Personal/sensitive data
- ❌ Copyright protected content
- ❌ Could cause harm

## 🛠 Best Practices

### Rate Limiting Strategy
```javascript
// Recommended approach
const rateLimits = {
  'government-sites': 2,    // 2 requests per second
  'council-sites': 1,        // 1 request per second
  'commercial-sites': 0.5,   // 1 request per 2 seconds
  'high-traffic': 0.1        // 1 request per 10 seconds
};

// Implement exponential backoff
const backoffStrategy = {
  initial: 1000,      // 1 second
  multiplier: 2,      // Double each retry
  maximum: 60000,     // Max 1 minute
  jitter: true        // Add randomness
};
```

### User-Agent Format
```
BotName/Version (+https://website.com; purpose; contact@email.com)

Examples:
NWLondonLedger/1.0 (+https://nwlondonledger.com; Public Data Aggregation; legal@nwlondonledger.com)
PropertyBot/2.0 (+https://example.com/bot-info; Research; bot@example.com) Mozilla/5.0 compatible
```

### Robots.txt Compliance
```javascript
// Always check before scraping
async function canScrape(url) {
  const robotsTxt = await fetchRobotsTxt(url);
  const parser = new RobotsParser(robotsTxt);

  return parser.isAllowed(url, 'NWLondonLedger');
}

// Honor crawl-delay
const crawlDelay = parser.getCrawlDelay('NWLondonLedger');
if (crawlDelay) {
  await sleep(crawlDelay * 1000);
}
```

## 📊 Data Collection Ethics

### What TO Collect
- ✅ Publicly displayed information
- ✅ Factual data (prices, dates, addresses)
- ✅ Government published data
- ✅ Business information (opening hours, services)
- ✅ Already aggregated statistics

### What NOT to Collect
- ❌ Personal contact information
- ❌ Private user data
- ❌ Password-protected content
- ❌ Copyrighted creative works
- ❌ Competitive intelligence
- ❌ Data behind paywalls

### Data Handling
1. **Storage:** Secure and encrypted
2. **Retention:** Only as long as necessary
3. **Sharing:** Never sell or misuse
4. **Accuracy:** Regular updates and corrections
5. **Deletion:** Honor removal requests

## 🔍 Source-Specific Guidelines

### Government Websites (.gov.uk)
- Generally permissible under OGL
- Respect rate limits
- Provide attribution
- Check specific department policies

### Council Websites
- Planning data is public record
- Respect server resources
- Consider FOI for bulk data
- Contact for permission if unclear

### Commercial Sites
- Always check Terms of Service
- Prefer official APIs
- Consider licensing agreements
- Respect competitive boundaries

### Personal Websites/Blogs
- Seek explicit permission
- Respect copyright
- Minimal extraction
- Always attribute

## 📝 Documentation Requirements

### Maintain Records Of
1. **Consent:** Permission emails/agreements
2. **Compliance:** robots.txt checks, ToS reviews
3. **Purpose:** Why data was collected
4. **Source:** Where data came from
5. **Timestamp:** When collected
6. **Method:** How it was collected

### Transparency Report Template
```markdown
# Data Collection Transparency Report

## Sources
- Domain: example.com
- Data Type: Public property listings
- Collection Method: API / Web scraping
- Frequency: Daily at 3am UTC
- Rate Limit: 1 req/second

## Compliance
- robots.txt: ✅ Checked and compliant
- Terms of Service: ✅ Reviewed [date]
- Consent: ✅ Implicit/Explicit
- Attribution: "Data from Example.com"

## Purpose
- Aggregate public property information
- Provide free access to residents
- Non-commercial use

## Contact
- Our Bot: BotName/1.0
- Email: contact@oursite.com
- Opt-out: Send request to legal@oursite.com
```

## 🚨 Warning Signs

### Stop Immediately If
- 🛑 You receive a cease and desist
- 🛑 The site implements anti-scraping measures
- 🛑 You're causing performance issues
- 🛑 Terms of Service change to prohibit
- 🛑 You receive 429 (Too Many Requests) errors
- 🛑 The site owner requests you stop

### Response Protocol
1. **Stop** all scraping immediately
2. **Document** the issue
3. **Respond** professionally within 24 hours
4. **Review** your practices
5. **Adjust** approach if needed
6. **Seek** legal advice if necessary

## 📚 Resources

### Tools
- [robots.txt Checker](https://example.com)
- [Terms of Service Analyzer](https://example.com)
- [Rate Limit Calculator](https://example.com)

### Legal Resources
- [ICO Guidance](https://ico.org.uk)
- [CMA Scraping Guidance](https://www.gov.uk/cma)
- [Open Government License](https://www.nationalarchives.gov.uk/doc/open-government-licence/)

### Industry Standards
- [robots.txt Specification](https://www.robotstxt.org)
- [Ethical Web Scraping](https://blog.apify.com/web-scraping-ethics/)
- [Data Collection Best Practices](https://example.com)

## ✅ Ethical Certification

By following this guide, you commit to:
- Transparent identification
- Respectful rate limiting
- Legal compliance
- Responsible data use
- Prompt response to concerns
- Continuous improvement

---

**Document Version:** 1.0
**Last Updated:** January 2024
**Next Review:** Quarterly
**Contact:** ethics@nwlondonledger.com