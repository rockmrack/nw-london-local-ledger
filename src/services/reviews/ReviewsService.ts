import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Customer Reviews & Testimonials Service
 * Manages customer feedback and ratings
 */

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  projectId: z.string().uuid().optional(),
  contractorId: z.string().uuid().optional(),
  type: z.enum(['project', 'contractor', 'company', 'material', 'supplier']),
  rating: z.object({
    overall: z.number().min(1).max(5),
    quality: z.number().min(1).max(5).optional(),
    value: z.number().min(1).max(5).optional(),
    communication: z.number().min(1).max(5).optional(),
    punctuality: z.number().min(1).max(5).optional(),
    cleanliness: z.number().min(1).max(5).optional(),
    professionalism: z.number().min(1).max(5).optional()
  }),
  title: z.string(),
  comment: z.string(),
  location: z.object({
    street: z.string().optional(),
    area: z.string(),
    postcode: z.string()
  }),
  projectType: z.string().optional(),
  projectValue: z.number().optional(),
  photos: z.array(z.object({
    url: z.string(),
    caption: z.string().optional()
  })).optional(),
  wouldRecommend: z.boolean(),
  verified: z.boolean(),
  helpful: z.number().default(0),
  reported: z.number().default(0),
  companyResponse: z.object({
    message: z.string(),
    respondedBy: z.string(),
    respondedAt: z.string().datetime()
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Review = z.infer<typeof ReviewSchema>;

export class ReviewsService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 3600;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get reviews for company
   */
  async getCompanyReviews(limit: number = 50): Promise<Review[]> {
    const cacheKey = 'reviews:company';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const reviews = this.getMockReviews();
    const sorted = reviews
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(sorted));
    return sorted;
  }

  /**
   * Get reviews by area
   */
  async getReviewsByArea(area: string): Promise<Review[]> {
    const cacheKey = `reviews:area:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allReviews = this.getMockReviews();
    const filtered = allReviews.filter(r => r.location.area === area);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get reviews for contractor
   */
  async getContractorReviews(contractorId: string): Promise<Review[]> {
    const cacheKey = `reviews:contractor:${contractorId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allReviews = this.getMockReviews();
    const filtered = allReviews.filter(r => r.contractorId === contractorId);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get overall ratings statistics
   */
  async getRatingsStats(): Promise<any> {
    const cacheKey = 'reviews:stats';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const reviews = this.getMockReviews();
    const verifiedReviews = reviews.filter(r => r.verified);

    const stats = {
      totalReviews: reviews.length,
      verifiedReviews: verifiedReviews.length,
      averageRating: this.calculateAverageRating(verifiedReviews),
      ratingDistribution: this.getRatingDistribution(verifiedReviews),
      categoryAverages: this.getCategoryAverages(verifiedReviews),
      recommendationRate: (verifiedReviews.filter(r => r.wouldRecommend).length / verifiedReviews.length) * 100,
      recentTrend: this.getRecentTrend(verifiedReviews),
      responseRate: (reviews.filter(r => r.companyResponse).length / reviews.length) * 100
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(stats));
    return stats;
  }

  /**
   * Get featured testimonials
   */
  async getFeaturedTestimonials(limit: number = 6): Promise<Review[]> {
    const cacheKey = 'reviews:featured';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allReviews = this.getMockReviews();
    const featured = allReviews
      .filter(r => r.verified && r.rating.overall >= 4.5 && r.comment.length > 100)
      .sort((a, b) => b.helpful - a.helpful)
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL * 2, JSON.stringify(featured));
    return featured;
  }

  /**
   * Get reviews by project type
   */
  async getReviewsByProjectType(projectType: string): Promise<Review[]> {
    const allReviews = this.getMockReviews();
    return allReviews.filter(r => r.projectType === projectType);
  }

  /**
   * Submit new review
   */
  async submitReview(review: Partial<Review>): Promise<{ success: boolean; reviewId: string }> {
    const reviewId = crypto.randomUUID();

    const newReview: Review = {
      id: reviewId,
      customerId: review.customerId || crypto.randomUUID(),
      customerName: review.customerName || 'Anonymous',
      type: review.type || 'company',
      rating: review.rating || { overall: 5 },
      title: review.title || '',
      comment: review.comment || '',
      location: review.location || { area: 'NW3', postcode: 'NW3' },
      wouldRecommend: review.wouldRecommend ?? true,
      verified: false, // Will be verified after project completion confirmation
      helpful: 0,
      reported: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // In production, save to database
    await this.redis.setex(
      `review:${reviewId}`,
      this.CACHE_TTL * 48,
      JSON.stringify(newReview)
    );

    // Notify team for moderation
    await this.notifyTeamNewReview(newReview);

    return {
      success: true,
      reviewId
    };
  }

  /**
   * Respond to review (company)
   */
  async respondToReview(reviewId: string, response: {
    message: string;
    respondedBy: string;
  }): Promise<boolean> {
    // In production, update database
    console.log(`[REVIEW RESPONSE] ${reviewId}: ${response.message}`);
    return true;
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string): Promise<number> {
    // In production, increment in database
    const currentCount = Math.floor(Math.random() * 50);
    return currentCount + 1;
  }

  /**
   * Helper methods
   */
  private calculateAverageRating(reviews: Review[]): number {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating.overall, 0);
    return Number((sum / reviews.length).toFixed(2));
  }

  private getRatingDistribution(reviews: Review[]): Record<number, number> {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    reviews.forEach(r => {
      const rating = Math.round(r.rating.overall);
      distribution[rating as keyof typeof distribution]++;
    });

    return distribution;
  }

  private getCategoryAverages(reviews: Review[]): any {
    const categories = ['quality', 'value', 'communication', 'punctuality', 'cleanliness', 'professionalism'];
    const averages: any = {};

    categories.forEach(category => {
      const withCategory = reviews.filter(r => r.rating[category as keyof typeof r.rating]);
      if (withCategory.length > 0) {
        const sum = withCategory.reduce((acc, r) => acc + (r.rating[category as keyof typeof r.rating] || 0), 0);
        averages[category] = Number((sum / withCategory.length).toFixed(2));
      }
    });

    return averages;
  }

  private getRecentTrend(reviews: Review[]): 'improving' | 'stable' | 'declining' {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recent = reviews.filter(r => new Date(r.createdAt) > thirtyDaysAgo);
    const older = reviews.filter(r => new Date(r.createdAt) <= thirtyDaysAgo);

    if (recent.length === 0 || older.length === 0) return 'stable';

    const recentAvg = this.calculateAverageRating(recent);
    const olderAvg = this.calculateAverageRating(older);

    if (recentAvg > olderAvg + 0.2) return 'improving';
    if (recentAvg < olderAvg - 0.2) return 'declining';
    return 'stable';
  }

  private async notifyTeamNewReview(review: Review): Promise<void> {
    console.log(`[NEW REVIEW] ${review.rating.overall} stars - ${review.title}`);
  }

  /**
   * Mock reviews data
   */
  private getMockReviews(): Review[] {
    return [
      {
        id: crypto.randomUUID(),
        customerId: crypto.randomUUID(),
        customerName: 'Sarah Thompson',
        type: 'project',
        rating: {
          overall: 5,
          quality: 5,
          value: 5,
          communication: 5,
          punctuality: 5,
          cleanliness: 4,
          professionalism: 5
        },
        title: 'Exceptional kitchen renovation',
        comment: 'Hampstead Renovations transformed our dated kitchen into a stunning modern space. Their attention to detail was incredible, and they completed the project on time and within budget. The team was professional, clean, and respectful of our home. Highly recommended!',
        location: {
          street: 'Belsize Avenue',
          area: 'NW3',
          postcode: 'NW3 4BH'
        },
        projectType: 'kitchen-renovation',
        projectValue: 28000,
        wouldRecommend: true,
        verified: true,
        helpful: 42,
        reported: 0,
        companyResponse: {
          message: 'Thank you so much for your kind words, Sarah! It was a pleasure working on your kitchen renovation.',
          respondedBy: 'Hampstead Renovations Team',
          respondedAt: '2024-10-15T10:30:00Z'
        },
        createdAt: '2024-10-14T14:20:00Z',
        updatedAt: '2024-10-15T10:30:00Z'
      },
      {
        id: crypto.randomUUID(),
        customerId: crypto.randomUUID(),
        customerName: 'David Martinez',
        type: 'project',
        rating: {
          overall: 4.5,
          quality: 5,
          value: 4,
          communication: 5,
          punctuality: 4,
          cleanliness: 5,
          professionalism: 5
        },
        title: 'Great bathroom refurbishment',
        comment: 'Very pleased with our new bathroom. The team was knowledgeable and suggested some excellent improvements to our original plan. Minor delay due to tile delivery but they kept us informed throughout.',
        location: {
          street: 'West End Lane',
          area: 'NW6',
          postcode: 'NW6 2LU'
        },
        projectType: 'bathroom-renovation',
        projectValue: 12500,
        wouldRecommend: true,
        verified: true,
        helpful: 28,
        reported: 0,
        createdAt: '2024-10-10T09:15:00Z',
        updatedAt: '2024-10-10T09:15:00Z'
      },
      {
        id: crypto.randomUUID(),
        customerId: crypto.randomUUID(),
        customerName: 'Emily Roberts',
        type: 'company',
        rating: {
          overall: 5,
          quality: 5,
          value: 5,
          communication: 5,
          punctuality: 5,
          cleanliness: 5,
          professionalism: 5
        },
        title: 'Outstanding service from start to finish',
        comment: 'We used Hampstead Renovations for a full house renovation in Primrose Hill. Cannot fault them - from the initial consultation to the final walkthrough, everything was handled with utmost professionalism. They protected our original Victorian features while modernizing the entire property. Worth every penny!',
        location: {
          street: 'Primrose Hill Road',
          area: 'NW3',
          postcode: 'NW3 3NA'
        },
        projectType: 'full-renovation',
        projectValue: 175000,
        wouldRecommend: true,
        verified: true,
        helpful: 67,
        reported: 0,
        companyResponse: {
          message: 'Emily, thank you for trusting us with such an important project. It was wonderful working with you!',
          respondedBy: 'Hampstead Renovations Team',
          respondedAt: '2024-09-28T16:00:00Z'
        },
        createdAt: '2024-09-27T11:45:00Z',
        updatedAt: '2024-09-28T16:00:00Z'
      }
    ];
  }
}

export default ReviewsService;
