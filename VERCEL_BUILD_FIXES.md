# Vercel Build Fixes - December 23, 2025

## Summary

Fixed critical build errors preventing successful deployment to Vercel. The main issues were related to static site generation (SSG) attempting to access runtime resources (database, Redis, API routes) that are not available during the build phase.

## Issues Resolved

### 1. ✅ Static Generation Fetch Errors (ECONNREFUSED 127.0.0.1:3000)

**Problem:** `generateStaticParams` functions were trying to fetch data from localhost during build, causing connection refused errors.

**Solution:**
- Updated `src/lib/isr/utils.ts` to detect build context and return empty arrays when database is unavailable
- Enhanced `isBuildContext()` to reliably detect various build environments (Vercel, CI, etc.)
- Modified `getAllAreaSlugs()`, `getTopPropertySlugs()`, and `getRecentPlanningIds()` to gracefully handle missing database connections
- Changed `dynamicParams = true` on all dynamic routes to enable ISR on-demand generation

**Files Modified:**
- `src/lib/isr/utils.ts`
- `src/app/(pages)/areas/[slug]/page.tsx`

**Impact:** Pages will be generated on-demand (ISR) when first requested instead of failing during build.

### 2. ✅ Redis Client Closed Errors

**Problem:** Redis operations attempted during static export when client wasn't connected, causing `ClientClosedError`.

**Solution:**
- Added `isConnected` checks before all Redis operations in `src/lib/cache/redis.ts`
- Updated `getCache()` to skip cache and use loader function when Redis unavailable
- Updated `setCache()` to silently skip when Redis unavailable
- Added fallback error handling to use loader function when cache fails

**Files Modified:**
- `src/lib/cache/redis.ts`

**Impact:** Build process continues without Redis, and runtime gracefully handles cache unavailability.

### 3. ✅ Invalid URL Deprecation Warning

**Problem:** Malformed URL pattern `https://api-:region.nwlondonledger.com/:path*` causing Node.js deprecation warning.

**Solution:**
- Removed invalid URL rewrite pattern from `next.config.js`
- Added comment explaining that Next.js rewrites don't support dynamic URL interpolation
- Noted that regional routing should be handled via middleware or edge functions

**Files Modified:**
- `next.config.js`

**Impact:** Build warnings eliminated; URL deprecation error resolved.

### 4. ✅ GraphQL Route Build Errors

**Problem:** Apollo Server initialization failing during build with "Problem communicating active modules to the server" error.

**Solution:**
- Added `export const dynamic = 'force-dynamic'` to GraphQL route to prevent static prerendering
- Added `export const runtime = 'nodejs'` to explicitly use Node.js runtime
- Implemented lazy server initialization with error handling
- Added availability checks in GET and POST handlers
- Return 503 status when GraphQL server unavailable

**Files Modified:**
- `src/app/api/graphql/route.ts`

**Impact:** GraphQL route no longer causes build failures; handles unavailability gracefully.

### 5. ✅ Bundle Size Warnings

**Problem:** Multiple entrypoints and assets exceeding recommended size limits.

**Existing Mitigations:**
- Dynamic imports already in place for search routes
- `force-dynamic` flags already set on API routes
- Tree shaking enabled via `swcMinify: true`

**Files Verified:**
- `src/app/api/search/route.ts` (already has `dynamic = 'force-dynamic'`)
- `src/app/api/search/properties/route.ts` (already has `dynamic = 'force-dynamic'`)
- `src/app/api/search/autocomplete/route.ts` (already has `dynamic = 'force-dynamic'`)

**Impact:** Bundle sizes remain large but within acceptable limits; all routes properly configured for dynamic rendering.

## Build Behavior Changes

### Before Fixes
- ❌ Build failed with connection refused errors
- ❌ Redis client errors during static export
- ❌ GraphQL server initialization failures
- ❌ Invalid URL deprecation warnings
- ❌ No pages successfully pre-generated

### After Fixes
- ✅ Build completes successfully
- ✅ Redis operations skip gracefully when unavailable
- ✅ GraphQL route handles build-time gracefully
- ✅ No deprecation warnings
- ✅ Static pages generated where possible
- ✅ Dynamic pages generated on-demand (ISR)

## ISR (Incremental Static Regeneration) Strategy

Pages now use a hybrid approach:
1. **Build Time:** Empty static generation (no database calls)
2. **First Request:** Generate page on-demand with database
3. **Subsequent Requests:** Serve cached static page
4. **Revalidation:** Regenerate after TTL expires (24 hours for areas, etc.)

## Environment Variables Required

### Build Time (Optional)
- `DATABASE_URL` - If provided, enables static pre-generation
- `REDIS_URL` - If provided, enables caching during build

### Runtime (Required)
- `DATABASE_URL` - Required for page generation
- `REDIS_URL` - Required for caching (optional but recommended)
- `NEXT_PUBLIC_BASE_URL` - Base URL for the application

## Testing Recommendations

1. **Test Build Locally:**
   ```powershell
   npm run build
   ```

2. **Test Preview:**
   ```powershell
   npm start
   ```

3. **Verify ISR:**
   - Visit `/areas/nw1` - Should generate on first visit
   - Refresh - Should serve from cache
   - Check Vercel logs for generation timing

4. **Verify Error Handling:**
   - Temporarily remove `DATABASE_URL` from runtime environment
   - Pages should show graceful error messages, not crash

## Future Optimizations

1. **Bundle Size:**
   - Consider code splitting for large components
   - Lazy load Apollo Client for GraphQL route
   - Use dynamic imports for heavy libraries

2. **Static Generation:**
   - Add build-time database seeding for common pages
   - Implement build-time API mocking for critical paths
   - Use fallback: 'blocking' for ISR pages

3. **Caching:**
   - Implement CDN caching headers
   - Add stale-while-revalidate patterns
   - Use Edge Runtime where possible

## Deployment Checklist

- [x] Build completes without errors
- [x] No connection refused errors
- [x] No Redis client errors
- [x] No invalid URL warnings
- [x] GraphQL route handles unavailability
- [x] ISR configuration validated
- [x] Dynamic routes allow on-demand generation
- [ ] Environment variables configured in Vercel
- [ ] Database connection available at runtime
- [ ] Redis connection available at runtime

## Notes

- Bundle size warnings are expected and acceptable for this application's complexity
- The 1.1 MB GraphQL route is due to Apollo Server + all resolvers + schema definitions
- ISR approach trades build speed for runtime flexibility
- All pages will populate naturally as users visit them

## Monitoring

After deployment, monitor:
1. Page generation times in Vercel Function Logs
2. ISR cache hit rates
3. Database connection pool usage
4. Redis connection stability
5. Error rates for unavailable services
