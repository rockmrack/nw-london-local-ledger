/**
 * Search Results Page
 * Global search across all content types
 */

import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface SearchResult {
  id: string;
  type: 'property' | 'planning' | 'area' | 'news';
  title: string;
  description: string;
  url: string;
  score: number;
  highlights?: Record<string, string[]>;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  took: number;
}

async function searchContent(
  query: string,
  page: number
): Promise<SearchResponse | null> {
  try {
    const response = await fetch(
      `${baseUrl}/api/search?q=${encodeURIComponent(query)}&page=${page}`,
      { next: { revalidate: 300 } } // 5 minute cache
    );

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching search results:', error);
    return null;
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}): Promise<Metadata> {
  const query = searchParams.q || '';

  if (!query) {
    return {
      title: 'Search | NW London Local Ledger',
      description: 'Search properties, planning applications, areas, and local news in North West London.',
    };
  }

  return {
    title: `Search results for "${query}" | NW London Local Ledger`,
    description: `Find properties, planning applications, areas, and news matching "${query}" in North West London.`,
  };
}

function getTypeColor(type: string): 'default' | 'success' | 'warning' | 'info' {
  switch (type) {
    case 'property':
      return 'default';
    case 'planning':
      return 'warning';
    case 'area':
      return 'success';
    case 'news':
      return 'info';
    default:
      return 'default';
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'property':
      return 'Property';
    case 'planning':
      return 'Planning';
    case 'area':
      return 'Area';
    case 'news':
      return 'News';
    default:
      return type;
  }
}

function HighlightedText({ text, highlights }: { text: string; highlights?: Record<string, string[]> }) {
  if (!highlights) {
    return <p className="text-slate-600 line-clamp-2">{text}</p>;
  }

  // Get first highlight snippet
  const firstHighlight = Object.values(highlights)[0]?.[0];

  if (firstHighlight) {
    return (
      <p
        className="text-slate-600 line-clamp-2"
        dangerouslySetInnerHTML={{ __html: firstHighlight }}
      />
    );
  }

  return <p className="text-slate-600 line-clamp-2">{text}</p>;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const query = searchParams.q || '';
  const page = parseInt(searchParams.page || '1', 10);

  if (!query) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">Search NW London Local Ledger</h1>
          <p className="text-xl text-slate-600 mb-8">
            Search across properties, planning applications, areas, and local news
          </p>

          <form action="/search" method="get" className="mb-12">
            <div className="flex gap-2">
              <input
                type="text"
                name="q"
                placeholder="Search properties, planning, areas, news..."
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          <div className="grid md:grid-cols-2 gap-6 text-left">
            <Card>
              <CardHeader>
                <CardTitle>Property Search</CardTitle>
                <CardDescription>
                  Find properties by address, postcode, or characteristics
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Planning Applications</CardTitle>
                <CardDescription>
                  Search planning applications by address, reference, or proposal
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Areas & Neighborhoods</CardTitle>
                <CardDescription>
                  Explore North West London areas and neighborhoods
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Local News</CardTitle>
                <CardDescription>
                  Browse local property news and market insights
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const data = await searchContent(query, page);

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Search Error</h1>
          <p className="text-slate-600">Unable to perform search. Please try again.</p>
        </div>
      </div>
    );
  }

  const { results, total, totalPages, took } = data;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Search form */}
        <form action="/search" method="get" className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search properties, planning, areas, news..."
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Results header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">
            Search results for &ldquo;{query}&rdquo;
          </h1>
          <p className="text-slate-600">
            Found {total.toLocaleString()} results in {took}ms
          </p>
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-600 mb-4">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-sm text-slate-500">
                Try searching with different keywords or check your spelling
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 mb-8">
            {results.map((result) => (
              <Card key={`${result.type}-${result.id}`} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <Link
                      href={result.url}
                      className="flex-1 group"
                    >
                      <h2 className="text-xl font-semibold text-blue-600 group-hover:text-blue-700 mb-1">
                        {result.title}
                      </h2>
                      <HighlightedText text={result.description} highlights={result.highlights} />
                    </Link>
                    <Badge variant={getTypeColor(result.type)}>
                      {getTypeLabel(result.type)}
                    </Badge>
                  </div>
                  <Link
                    href={result.url}
                    className="text-sm text-slate-500 hover:text-blue-600"
                  >
                    {baseUrl.replace(/^https?:\/\//, '')}{result.url}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}
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
                    href={`/search?q=${encodeURIComponent(query)}&page=${pageNum}`}
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
                href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
