# 🚀 Deployment Checklist - NW London Local Ledger

## Current Status
✅ **Build Fixed Locally** (Commit: 011d738)
❌ **Vercel Deployment** - Cache issue with old config

---

## 🔧 Immediate Fix for Vercel

### Step 1: Clear Vercel Cache & Redeploy

**Option A: Via Dashboard (Easiest)**
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to "Deployments" tab
4. Click latest deployment → "..." menu → "Redeploy"
5. ⚠️ **UNCHECK "Use existing Build Cache"**
6. Click "Redeploy"

**Option B: Via CLI**
```bash
vercel --force --prod
```

### Step 2: Verify Deployment
Watch build logs for:
- ✅ No `ppr` error
- ✅ No `telemetry` warning
- ✅ Build completes successfully

---

## 📋 Pre-Production Deployment Checklist

### Environment Variables (Critical)

#### Required for Basic Functionality
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `REDIS_URL` - Redis connection string
- [ ] `ELASTICSEARCH_NODE` - Elasticsearch URL
- [ ] `SESSION_SECRET` - Generate with: `openssl rand -hex 32`
- [ ] `JWT_SECRET` - Generate with: `openssl rand -hex 32`
- [ ] `ENCRYPTION_KEY` - Generate with: `openssl rand -hex 32`
- [ ] `NEXT_PUBLIC_BASE_URL` - Your production domain
- [ ] `NODE_ENV=production`

#### Optional but Recommended
- [ ] `OPENAI_API_KEY` - For AI content generation
- [ ] `SENTRY_DSN` - Error tracking
- [ ] `LAND_REGISTRY_API_KEY` - Property data
- [ ] `TFL_APP_ID` & `TFL_APP_KEY` - Transport data
- [ ] Email settings (SMTP_HOST, SMTP_PORT, etc.)

### Database Setup
- [ ] Create production PostgreSQL database
- [ ] Enable PostGIS extension
- [ ] Run migrations: `npm run db:migrate`
- [ ] Seed initial data: `npm run db:seed` (if needed)
- [ ] Configure backups
- [ ] Set up connection pooling

### Redis Setup
- [ ] Create production Redis instance
- [ ] Configure persistence (AOF/RDB)
- [ ] Set memory limits
- [ ] Enable authentication

### Elasticsearch Setup
- [ ] Create production cluster
- [ ] Configure index settings
- [ ] Set up index templates
- [ ] Enable security features

### Security Configuration
- [ ] Change all default passwords
- [ ] Review CORS settings in API routes
- [ ] Enable rate limiting
- [ ] Configure CSP headers (check next.config.js)
- [ ] Set up SSL/TLS certificates (Vercel handles this)
- [ ] Review security headers at https://securityheaders.com

### Performance Optimization
- [ ] Enable CDN (Vercel handles this)
- [ ] Configure ISR revalidation times
- [ ] Set up Redis caching
- [ ] Optimize images (already configured)
- [ ] Test performance with Lighthouse

### Monitoring & Logging
- [ ] Set up error tracking (Sentry)
- [ ] Configure log aggregation
- [ ] Set up uptime monitoring (UptimeRobot)
- [ ] Create alerts for critical errors
- [ ] Set up analytics (Google Analytics)

---

## 🔄 Background Services Setup

Your app has background workers that need separate hosting:

### Queue Workers (Required)
These process background jobs:

```bash
# Service: BullMQ workers
# Command: npm run worker:start
# Host on: Railway, Render, or separate container
```

**Setup on Railway:**
1. Create new service
2. Connect GitHub repo
3. Set start command: `npm run worker:start`
4. Add all environment variables
5. Deploy

### Scrapers (Optional)
Run on schedule:

```bash
# Command: npm run scraper:comprehensive
# Schedule: Daily via cron or scheduler
```

**Setup Options:**
- Railway Cron Jobs
- GitHub Actions (scheduled workflows)
- AWS Lambda (scheduled events)

---

## 🧪 Testing Before Production

### Local Testing
```bash
# 1. Clean build
rm -rf .next
npm run build

# 2. Test production server
npm start

# 3. Test key features
# - Homepage loads
# - Search works
# - Property pages render
# - API endpoints respond
```

### Staging Environment
- [ ] Deploy to Vercel preview environment
- [ ] Test all critical user flows
- [ ] Check performance metrics
- [ ] Verify SEO metadata
- [ ] Test on mobile devices

### Load Testing
```bash
# Use tools like:
# - Apache Bench (ab)
# - wrk
# - k6.io

# Example with ab:
ab -n 1000 -c 10 https://your-domain.vercel.app/
```

---

## 📊 Post-Deployment Validation

### Immediate Checks (First Hour)
- [ ] Site is accessible at production URL
- [ ] Homepage loads correctly
- [ ] Search functionality works
- [ ] Database connections are stable
- [ ] No error spikes in logs
- [ ] SSL certificate is valid
- [ ] DNS is resolving correctly

### First 24 Hours
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Review server logs
- [ ] Test all critical flows
- [ ] Monitor database performance
- [ ] Check cache hit rates

### First Week
- [ ] Review analytics data
- [ ] Check SEO indexing
- [ ] Monitor costs
- [ ] Gather user feedback
- [ ] Review performance trends

---

## 🆘 Rollback Plan

If deployment fails:

### Option 1: Instant Rollback (Vercel)
1. Go to Deployments tab
2. Find last working deployment
3. Click "..." → "Promote to Production"

### Option 2: Git Revert
```bash
# Revert to previous working commit
git revert HEAD
git push
```

### Option 3: Redeploy Previous Version
```bash
# Deploy specific commit
vercel --prod --force --git-ref=<previous-commit-sha>
```

---

## 📈 Scaling Considerations

### When to Scale (Metrics to Watch)
- **Response time** > 2 seconds
- **Error rate** > 1%
- **Database connections** > 80% of pool
- **Redis memory** > 80% used
- **CPU usage** consistently > 70%

### Scaling Options
1. **Vertical Scaling** - Upgrade database/cache tiers
2. **Horizontal Scaling** - Add more workers
3. **Caching** - Increase cache layers
4. **CDN** - Already handled by Vercel
5. **Database Replicas** - Add read replicas

---

## 📞 Support & Monitoring

### Key Metrics to Monitor
- Application uptime
- API response times
- Error rates by endpoint
- Database query performance
- Cache hit rates
- Background job queue length

### Alert Thresholds
- **Critical**: Downtime, error rate > 5%
- **Warning**: Response time > 3s, error rate > 1%
- **Info**: Unusual traffic patterns

### On-Call Procedures
1. Check status dashboard
2. Review error logs (Sentry)
3. Check service health (databases, Redis)
4. Review recent deployments
5. Rollback if necessary

---

## ✅ Final Launch Checklist

### Pre-Launch (1 Day Before)
- [ ] All environment variables configured
- [ ] Database migrations run successfully
- [ ] Background workers deployed and running
- [ ] Monitoring and alerts configured
- [ ] Backup systems tested
- [ ] SSL certificates verified
- [ ] DNS configured correctly
- [ ] CDN configured and tested
- [ ] Load testing completed
- [ ] Security scan passed

### Launch Day
- [ ] Deploy to production
- [ ] Verify all services are running
- [ ] Test critical user paths
- [ ] Monitor error logs (first hour)
- [ ] Check performance metrics
- [ ] Verify analytics tracking
- [ ] Send test transactions
- [ ] Update documentation

### Post-Launch (First Week)
- [ ] Daily monitoring check-ins
- [ ] Review and fix any errors
- [ ] Optimize based on real usage
- [ ] Gather user feedback
- [ ] Plan next iteration

---

## 🔗 Quick Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com
- **Upstash Console**: https://console.upstash.com
- **Elastic Cloud**: https://cloud.elastic.co
- **Railway Dashboard**: https://railway.app
- **GitHub Repo**: https://github.com/rockmrack/nw-london-local-ledger

---

## 📝 Notes

**Current Issue**: Vercel deployment failing due to build cache containing old config with `ppr` option.

**Solution**: Clear Vercel build cache and redeploy (see "Immediate Fix" section above).

**Status**: Local build ✅ | Vercel deployment ⏳ (pending cache clear)
