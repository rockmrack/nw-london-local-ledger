/**
 * News Listing Page
 * Browse all published news articles
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { NewsCard } from '@/components/news/NewsCard';
import type { NewsArticle } from '@/types/news';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Local News & Market Insights | NW London Local Ledger',
  description:
    'Latest property news, market analysis, and local updates for North West London. Stay informed about planning applications, property sales, and neighborhood developments.',
  openGraph: {
    title: 'Local News & Market Insights | NW London Local Ledger',
    description:
      'Latest property news and market analysis for North West London',
    type: 'website',
  },
};

interface NewsListResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function getNews(page = 1): Promise<NewsListResponse | null> {
  try {
    const response = await fetch(`${baseUrl}/api/news?page=${page}`, {
      next: { revalidate: 300 }, // 5 minute cache
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching news:', error);
    return null;
  }
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = parseInt(searchParams.page || '1', 10);
  const data = await getNews(page);

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Local News</h1>
          <p className="text-slate-600">Unable to load news articles. Please try again later.</p>
        </div>
      </div>
    );
  }

  const { articles, total, totalPages } = data;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Local News & Market Insights</h1>
          <p className="text-xl text-slate-600">
            Stay informed about property news, market trends, and local developments in North West London
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-4 mb-8 border-b border-slate-200">
          <Link
            href="/news"
            className="px-4 py-2 border-b-2 border-blue-600 font-medium text-blue-600"
          >
            All News
          </Link>
          <Link
            href="/news?type=news"
            className="px-4 py-2 hover:text-blue-600 transition-colors"
          >
            News
          </Link>
          <Link
            href="/news?type=analysis"
            className="px-4 py-2 hover:text-blue-600 transition-colors"
          >
            Market Analysis
          </Link>
          <Link
            href="/news?type=guide"
            className="px-4 py-2 hover:text-blue-600 transition-colors"
          >
            Guides
          </Link>
        </div>

        {/* Results count */}
        <div className="mb-6">
          <p className="text-slate-600">
            Showing {articles.length} of {total.toLocaleString()} articles
          </p>
        </div>

        {/* Articles grid */}
        {articles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No articles found.</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {articles.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/news?page=${page - 1}`}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Previous
                  </Link>
                )}

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                    const pageNum = i + 1;
                    const isActive = pageNum === page;

                    return (
                      <Link
                        key={pageNum}
                        href={`/news?page=${pageNum}`}
                        className={`px-4 py-2 rounded-lg ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </Link>
                    );
                  })}
                </div>

                {page < totalPages && (
                  <Link
                    href={`/news?page=${page + 1}`}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
