/**
 * News Card Component
 * Display news article in a card format
 */

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { NewsArticle } from '@/types/news';

interface NewsCardProps {
  article: NewsArticle;
}

export function NewsCard({ article }: NewsCardProps) {
  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Draft';

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
    <Card className="h-full hover:shadow-lg transition-shadow">
      <Link href={`/news/${article.slug}`}>
        {article.featuredImageUrl && (
          <div className="w-full h-48 overflow-hidden">
            <img
              src={article.featuredImageUrl}
              alt={article.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant={getArticleTypeVariant(article.articleType)}>
              {article.articleType}
            </Badge>
            <span className="text-sm text-slate-500">{formattedDate}</span>
          </div>
          <CardTitle className="hover:text-blue-600 transition-colors">
            {article.title}
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {article.excerpt}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-2">
              {article.aiGenerated && (
                <Badge variant="secondary" size="sm">
                  AI Generated
                </Badge>
              )}
              {article.viewCount > 0 && (
                <span>{article.viewCount.toLocaleString()} views</span>
              )}
            </div>
            {article.author && <span>{article.author}</span>}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
