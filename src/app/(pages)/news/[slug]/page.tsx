/**
 * News Article Detail Page
 * Display full article with metadata and related content
 */

import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { SchemaMarkup, generateArticleSchema } from '@/lib/seo/schema';
import { ISRConfig } from '@/lib/isr/config';
import { getNewsArticleSlugs } from '@/lib/isr/utils';
import type { NewsArticle, ArticleTag } from '@/types/news';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface ArticleDetailResponse {
  article: NewsArticle;
  tags: ArticleTag[];
}

// Generate static params for recent news articles at build time
export async function generateStaticParams() {
  const slugs = await getNewsArticleSlugs(ISRConfig.buildLimits.news as number);
  return slugs.map((slug) => ({
    slug,
  }));
}

// Configure ISR revalidation
export const revalidate = ISRConfig.revalidation.news; // 3 hours
export const dynamicParams = true; // Allow on-demand generation for new articles

async function getArticle(slug: string): Promise<ArticleDetailResponse | null> {
  try {
    const response = await fetch(`${baseUrl}/api/news/${slug}`, {
      next: {
        revalidate: ISRConfig.revalidation.news,
        tags: [ISRConfig.tags.news, `news-${slug}`],
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching article:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getArticle(params.slug);

  if (!data) {
    return {
      title: 'Article Not Found | NW London Local Ledger',
    };
  }

  const { article } = data;

  return {
    title: `${article.title} | NW London Local Ledger`,
    description: article.excerpt || article.title,
    openGraph: {
      title: article.title,
      description: article.excerpt || article.title,
      type: 'article',
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      ...(article.featuredImageUrl && {
        images: [
          {
            url: article.featuredImageUrl,
            alt: article.title,
          },
        ],
      }),
    },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getArticle(params.slug);

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Article Not Found</h1>
          <p className="text-slate-600 mb-8">
            The article you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href="/news"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to News
          </Link>
        </div>
      </div>
    );
  }

  const { article, tags } = data;

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  const getArticleTypeVariant = (type: string): 'primary' | 'success' | 'warning' | 'info' => {
    switch (type) {
      case 'news':
        return 'primary';
      case 'analysis':
        return 'info';
      case 'guide':
        return 'success';
      default:
        return 'primary';
    }
  };

  return (
    <>
      <SchemaMarkup schema={generateArticleSchema(article, article.author)} />

      <article className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Badge variant={getArticleTypeVariant(article.articleType)}>
                {article.articleType}
              </Badge>
              {article.aiGenerated && (
                <Badge variant="secondary">AI Generated</Badge>
              )}
              {article.humanReviewed && (
                <Badge variant="success">Reviewed</Badge>
              )}
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4">{article.title}</h1>

            {article.excerpt && (
              <p className="text-xl text-slate-600 mb-6">{article.excerpt}</p>
            )}

            <div className="flex items-center gap-4 text-sm text-slate-600">
              {article.author && <span>By {article.author}</span>}
              {formattedDate && (
                <>
                  <span>•</span>
                  <time dateTime={article.publishedAt}>{formattedDate}</time>
                </>
              )}
              {article.viewCount > 0 && (
                <>
                  <span>•</span>
                  <span>{article.viewCount.toLocaleString()} views</span>
                </>
              )}
            </div>
          </div>

          {/* Featured Image */}
          {article.featuredImageUrl && (
            <div className="mb-8 rounded-lg overflow-hidden">
              <img
                src={article.featuredImageUrl}
                alt={article.title}
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Content */}
          <div
            className="prose prose-lg max-w-none mb-12"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Card */}
          <Card className="bg-slate-50 mb-8">
            <CardHeader>
              <CardTitle>Article Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Type:</dt>
                  <dd className="font-medium">{article.articleType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Source:</dt>
                  <dd className="font-medium">{article.source || 'N/A'}</dd>
                </div>
                {article.aiGenerated && (
                  <div className="flex justify-between">
                    <dt className="text-slate-600">AI Model:</dt>
                    <dd className="font-medium">{article.aiModel || 'N/A'}</dd>
                  </div>
                )}
                {article.humanReviewed && article.reviewedBy && (
                  <div className="flex justify-between">
                    <dt className="text-slate-600">Reviewed by:</dt>
                    <dd className="font-medium">{article.reviewedBy}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-600">Last updated:</dt>
                  <dd className="font-medium">
                    {new Date(article.updatedAt).toLocaleDateString('en-GB')}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Back to News */}
          <div className="text-center">
            <Link
              href="/news"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to News
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
