/**
 * News and content type definitions
 */

export type ArticleType = 'news' | 'analysis' | 'guide' | 'data_journalism';
export type ArticleSource = 'ai_generated' | 'aggregated' | 'manual';
export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface NewsArticle {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  articleType: ArticleType;
  source?: ArticleSource;
  areaId?: number;
  relatedPropertyId?: number;
  relatedPlanningId?: number;
  status: ArticleStatus;
  publishedAt?: Date;
  author?: string;
  metaTitle?: string;
  metaDescription?: string;
  featuredImageUrl?: string;
  viewCount: number;
  aiGenerated: boolean;
  aiModel?: string;
  aiPromptVersion?: string;
  humanReviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArticleTag {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface NewsSource {
  id: number;
  name: string;
  sourceType: 'rss' | 'scraper' | 'api';
  url: string;
  scraperConfig?: Record<string, any>;
  active: boolean;
  lastFetchedAt?: Date;
  fetchFrequencyMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AggregatedNewsItem {
  id: number;
  newsSourceId: number;
  title: string;
  url: string;
  content?: string;
  publishedDate?: Date;
  processed: boolean;
  processedAt?: Date;
  createdArticleId?: number;
  createdAt: Date;
}
