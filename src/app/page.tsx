import type { Metadata } from 'next';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { ISRConfig } from '@/lib/isr/config';
import { ProgressiveHydration } from '@/components/ProgressiveHydration';

// Lazy load components for code splitting
const HeroSection = dynamic(() => import('@/components/home/HeroSection'), {
  loading: () => <HeroSkeleton />,
});

const FeaturedProperties = dynamic(() => import('@/components/home/FeaturedProperties'), {
  loading: () => <PropertiesSkeleton />,
  ssr: true,
});

const LatestNews = dynamic(() => import('@/components/home/LatestNews'), {
  loading: () => <NewsSkeleton />,
  ssr: true,
});

const MarketInsights = dynamic(() => import('@/components/home/MarketInsights'), {
  loading: () => <InsightsSkeleton />,
  ssr: false, // Client-side only for non-critical content
});

const SearchWidget = dynamic(() => import('@/components/home/SearchWidget'), {
  loading: () => <SearchSkeleton />,
  ssr: true,
});

// Configure ISR for homepage
export const dynamic = 'force-dynamic'; // Prevent build-time prerendering
export const revalidate = ISRConfig.revalidation.homepage; // 12 hours
export const runtime = 'nodejs'; // Ensure Node.js runtime for streaming

export const metadata: Metadata = {
  title: 'NW London Local Ledger | Property Data, Planning Applications & Local News',
  description:
    'Discover comprehensive property data, live planning applications, and local news for NW1-NW11. Your trusted source for North West London property information.',
  openGraph: {
    title: 'NW London Local Ledger - Your Property & Planning Hub',
    description: 'Everything you need to know about living in North West London',
    images: ['/images/og-home.jpg'],
  },
};

// Async data fetching functions - using services directly instead of fetch
async function getFeaturedProperties() {
  try {
    // Dynamic import to avoid build-time evaluation
    const { propertyService } = await import('@/services/property/PropertyService');
    const { getCache, setCache } = await import('@/lib/cache/redis');

    const cacheKey = 'homepage:featured-properties';
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const result = await propertyService.searchProperties({
      page: 1,
      limit: 6,
      sortBy: 'date',
      sortOrder: 'desc',
    });

    await setCache(cacheKey, result, 3600); // Cache for 1 hour
    return result;
  } catch (error) {
    console.error('Error fetching properties:', error);
    return { properties: [], total: 0 };
  }
}

async function getLatestNews() {
  try {
    // Dynamic import to avoid build-time evaluation
    const { newsService } = await import('@/services/news/NewsService');
    const { getCache, setCache } = await import('@/lib/cache/redis');

    const cacheKey = 'homepage:latest-news';
    const cached = await getCache(cacheKey);
    if (cached) return cached;

    const result = await newsService.getPublishedArticles(1, 4);

    await setCache(cacheKey, result, 1800); // Cache for 30 minutes
    return result;
  } catch (error) {
    console.error('Error fetching news:', error);
    return { articles: [], total: 0 };
  }
}

async function getMarketStats() {
  try {
    // For now, return empty stats - this can be implemented when the ML service is ready
    return { stats: {} };
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return { stats: {} };
  }
}

export default async function HomePage() {
  // Start all data fetches in parallel
  const propertiesPromise = getFeaturedProperties();
  const newsPromise = getLatestNews();
  const statsPromise = getMarketStats();

  return (
    <main className="min-h-screen">
      {/* Hero Section - Immediate hydration */}
      <ProgressiveHydration priority="immediate">
        <HeroSection />
      </ProgressiveHydration>

      {/* Search Widget - High priority */}
      <ProgressiveHydration priority="high">
        <section className="py-8 bg-gray-50">
          <div className="container mx-auto px-4">
            <Suspense fallback={<SearchSkeleton />}>
              <SearchWidget />
            </Suspense>
          </div>
        </section>
      </ProgressiveHydration>

      {/* Featured Properties - Streaming SSR */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8">Featured Properties</h2>
          <Suspense fallback={<PropertiesSkeleton />}>
            <PropertiesContent promise={propertiesPromise} />
          </Suspense>
        </div>
      </section>

      {/* Latest News - Streaming SSR */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8">Latest News</h2>
          <Suspense fallback={<NewsSkeleton />}>
            <NewsContent promise={newsPromise} />
          </Suspense>
        </div>
      </section>

      {/* Market Insights - Low priority, client-side hydration */}
      <ProgressiveHydration priority="low">
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-8">Market Insights</h2>
            <Suspense fallback={<InsightsSkeleton />}>
              <InsightsContent promise={statsPromise} />
            </Suspense>
          </div>
        </section>
      </ProgressiveHydration>

      {/* Info Cards - Static content, immediate render */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <InfoCard
              title="Property Data"
              description="Historical sales data, price trends, and market insights for every property in NW1-NW11"
              icon="📊"
            />
            <InfoCard
              title="Planning Applications"
              description="Live tracking of planning applications across 6 councils with daily updates"
              icon="🏗️"
            />
            <InfoCard
              title="Local News"
              description="AI-powered analysis of local developments, market trends, and community news"
              icon="📰"
            />
          </div>
        </div>
      </section>

      {/* Newsletter Signup - Low priority */}
      <ProgressiveHydration priority="low" fallback={<NewsletterSkeleton />}>
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center p-8 bg-blue-50 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">Stay Updated</h3>
              <p className="text-gray-600 mb-6">
                Get weekly insights on property trends and planning updates in NW London
              </p>
              <NewsletterForm />
            </div>
          </div>
        </section>
      </ProgressiveHydration>
    </main>
  );
}

// Async components that receive promises for streaming
async function PropertiesContent({ promise }: { promise: Promise<any> }) {
  const data = await promise;
  return <FeaturedProperties properties={data.properties} />;
}

async function NewsContent({ promise }: { promise: Promise<any> }) {
  const data = await promise;
  return <LatestNews articles={data.articles} />;
}

async function InsightsContent({ promise }: { promise: Promise<any> }) {
  const data = await promise;
  return <MarketInsights stats={data.stats} />;
}

// Static components
function InfoCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function NewsletterForm() {
  return (
    <form className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
      <input
        type="email"
        placeholder="Enter your email"
        className="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      <button
        type="submit"
        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Subscribe
      </button>
    </form>
  );
}

// Loading skeletons for streaming SSR
function HeroSkeleton() {
  return (
    <div className="h-96 bg-gradient-to-r from-gray-200 to-gray-300 animate-pulse" />
  );
}

function SearchSkeleton() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="h-14 bg-gray-200 rounded-lg animate-pulse" />
    </div>
  );
}

function PropertiesSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-48 bg-gray-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function NewsletterSkeleton() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
    </div>
  );
}