/**
 * News Service
 * Handles news article operations and AI generation
 */

import sql from '@/lib/db/client';
import type { NewsArticle, ArticleTag, NewsSource } from '@/types/news';
import { slugify } from '@/lib/utils/slugify';
import { aiContentService } from '@/ai/content-generation/ContentGenerationService';
import { linkInjector } from '@/services/LinkInjector';

export class NewsService {
  /**
   * Get article by ID
   */
  async getArticleById(id: number): Promise<NewsArticle | null> {
    const [article] = await sql<NewsArticle[]>`
      SELECT * FROM news_articles WHERE id = ${id}
    `;
    return article || null;
  }

  /**
   * Get article by slug
   */
  async getArticleBySlug(slug: string): Promise<NewsArticle | null> {
    const [article] = await sql<NewsArticle[]>`
      SELECT * FROM news_articles WHERE slug = ${slug}
    `;
    return article || null;
  }

  /**
   * Get published articles with pagination
   */
  async getPublishedArticles(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*) as count
      FROM news_articles
      WHERE status = 'published'
    `;

    const articles = await sql<NewsArticle[]>`
      SELECT * FROM news_articles
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return {
      articles,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Get articles by type
   */
  async getArticlesByType(type: string, limit = 10): Promise<NewsArticle[]> {
    return await sql<NewsArticle[]>`
      SELECT * FROM news_articles
      WHERE article_type = ${type}
        AND status = 'published'
      ORDER BY published_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get articles by area
   */
  async getArticlesByArea(areaId: number, limit = 10): Promise<NewsArticle[]> {
    return await sql<NewsArticle[]>`
      SELECT * FROM news_articles
      WHERE area_id = ${areaId}
        AND status = 'published'
      ORDER BY published_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get featured articles
   */
  async getFeaturedArticles(limit = 5): Promise<NewsArticle[]> {
    return await sql<NewsArticle[]>`
      SELECT * FROM news_articles
      WHERE status = 'published'
        AND featured_image_url IS NOT NULL
      ORDER BY view_count DESC, published_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Create article
   */
  async createArticle(data: Partial<NewsArticle>): Promise<NewsArticle> {
    const slug = data.slug || slugify(data.title || '');

    const [article] = await sql<NewsArticle[]>`
      INSERT INTO news_articles (
        title, slug, excerpt, content, article_type, source,
        area_id, status, author, ai_generated, ai_model
      ) VALUES (
        ${data.title}, ${slug}, ${data.excerpt}, ${data.content},
        ${data.articleType}, ${data.source}, ${data.areaId},
        ${data.status || 'draft'}, ${data.author}, ${data.aiGenerated || false},
        ${data.aiModel}
      )
      RETURNING *
    `;

    return article;
  }

  /**
   * Generate AI article from planning data
   */
  async generatePlanningArticle(planningApplication: any): Promise<NewsArticle> {
    try {
      // Generate content using AI
      const aiContent = await aiContentService.generatePlanningNewsArticle(
        planningApplication,
        'New planning application submitted'
      );

      // Validate content
      const validation = aiContentService.validateContent(aiContent.content);
      if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.issues.join(', ')}`);
      }

      // Inject Authority Bridge links
      let finalContent = linkInjector.injectContextualLinks(aiContent.content);
      
      // Append Featured Expert block
      finalContent += '\n\n' + linkInjector.generateFeaturedExpertBlock();

      // Create article
      const article = await this.createArticle({
        title: aiContent.title,
        excerpt: aiContent.excerpt,
        content: finalContent,
        articleType: 'news',
        source: 'ai_generated',
        relatedPlanningId: planningApplication.id,
        areaId: planningApplication.areaId,
        status: 'draft', // Requires human review
        aiGenerated: true,
        aiModel: 'gpt-4-turbo-preview',
      });

      return article;
    } catch (error) {
      console.error('Error generating planning article:', error);
      throw error;
    }
  }

  /**
   * Generate weekly market report
   */
  async generateWeeklyReport(areaId: number): Promise<NewsArticle> {
    try {
      // Fetch weekly stats (placeholder - implement actual stats gathering)
      const weeklyStats = {
        salesCount: 12,
        averagePrice: 850000,
        priceChange: 2.5,
        activeStreets: ['Fitzjohns Avenue', 'Heath Street'],
        planningCount: 8,
      };

      const area = await sql<any[]>`SELECT name FROM areas WHERE id = ${areaId}`;
      const areaName = area[0]?.name || 'Area';

      // Generate content
      const aiContent = await aiContentService.generateMarketReport(areaName, weeklyStats);

      // Inject Authority Bridge links
      let finalContent = linkInjector.injectContextualLinks(aiContent.content);
      
      // Append Featured Expert block
      finalContent += '\n\n' + linkInjector.generateFeaturedExpertBlock();

      // Create article
      const article = await this.createArticle({
        title: aiContent.title,
        content: finalContent,
        excerpt: aiContent.content.substring(0, 200) + '...',
        articleType: 'analysis',
        source: 'ai_generated',
        areaId,
        status: 'draft',
        aiGenerated: true,
        aiModel: 'gpt-4-turbo-preview',
      });

      return article;
    } catch (error) {
      console.error('Error generating weekly report:', error);
      throw error;
    }
  }

  /**
   * Publish article
   */
  async publishArticle(id: number): Promise<NewsArticle | null> {
    const [article] = await sql<NewsArticle[]>`
      UPDATE news_articles
      SET
        status = 'published',
        published_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    return article || null;
  }

  /**
   * Mark article as reviewed
   */
  async markAsReviewed(id: number, reviewedBy: string): Promise<void> {
    await sql`
      UPDATE news_articles
      SET
        human_reviewed = true,
        reviewed_by = ${reviewedBy},
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  }

  /**
   * Increment view count
   */
  async incrementViewCount(id: number): Promise<void> {
    await sql`
      UPDATE news_articles
      SET view_count = view_count + 1
      WHERE id = ${id}
    `;
  }

  /**
   * Get tags for article
   */
  async getArticleTags(articleId: number): Promise<ArticleTag[]> {
    return await sql<ArticleTag[]>`
      SELECT t.*
      FROM article_tags t
      JOIN article_tag_associations a ON t.id = a.tag_id
      WHERE a.article_id = ${articleId}
    `;
  }

  /**
   * Add tag to article
   */
  async addTagToArticle(articleId: number, tagName: string): Promise<void> {
    const slug = slugify(tagName);

    // Get or create tag
    let [tag] = await sql<ArticleTag[]>`
      SELECT * FROM article_tags WHERE slug = ${slug}
    `;

    if (!tag) {
      [tag] = await sql<ArticleTag[]>`
        INSERT INTO article_tags (name, slug)
        VALUES (${tagName}, ${slug})
        RETURNING *
      `;
    }

    // Associate tag with article
    await sql`
      INSERT INTO article_tag_associations (article_id, tag_id)
      VALUES (${articleId}, ${tag.id})
      ON CONFLICT DO NOTHING
    `;
  }

  /**
   * Get recent news sources
   */
  async getNewsSources(): Promise<NewsSource[]> {
    return await sql<NewsSource[]>`
      SELECT * FROM news_sources
      WHERE active = true
      ORDER BY name
    `;
  }
}

// Export singleton instance
export const newsService = new NewsService();
