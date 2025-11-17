'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  category: string;
  slug: string;
}

interface LatestNewsProps {
  articles: Article[];
}

/**
 * Latest News Component with time-based updates
 */
export default function LatestNews({ articles }: LatestNewsProps) {
  if (!articles || articles.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No news articles available at the moment.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      {articles.map((article) => (
        <Link
          key={article.id}
          href={`/news/${article.slug}`}
          className="group"
        >
          <article className="bg-white rounded-lg p-4 hover:shadow-md transition-shadow h-full flex flex-col">
            <div className="text-xs text-blue-600 font-semibold uppercase mb-2">
              {article.category}
            </div>

            <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
              {article.title}
            </h3>

            <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-grow">
              {article.excerpt}
            </p>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{article.author}</span>
              <time dateTime={article.publishedAt}>
                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </time>
            </div>
          </article>
        </Link>
      ))}
    </div>
  );
}