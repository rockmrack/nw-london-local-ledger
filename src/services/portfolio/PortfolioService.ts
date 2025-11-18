import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Project Portfolio Service for NW London
 * Showcases completed renovation and maintenance work
 */

export const ProjectShowcaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  projectType: z.string(),
  propertyType: z.string(),
  location: z.object({
    street: z.string(),
    area: z.string(),
    postcode: z.string()
  }),
  timeline: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    durationWeeks: z.number()
  }),
  budget: z.object({
    total: z.number(),
    breakdown: z.array(z.object({
      category: z.string(),
      amount: z.number(),
      percentage: z.number()
    }))
  }),
  scope: z.array(z.string()),
  challenges: z.array(z.object({
    challenge: z.string(),
    solution: z.string()
  })).optional(),
  features: z.array(z.string()),
  materials: z.array(z.object({
    material: z.string(),
    supplier: z.string(),
    reason: z.string()
  })),
  contractors: z.array(z.object({
    contractorId: z.string().uuid(),
    name: z.string(),
    trade: z.string(),
    role: z.string()
  })),
  beforePhotos: z.array(z.object({
    url: z.string(),
    caption: z.string(),
    room: z.string()
  })),
  afterPhotos: z.array(z.object({
    url: z.string(),
    caption: z.string(),
    room: z.string()
  })),
  customerTestimonial: z.object({
    rating: z.number().min(1).max(5),
    comment: z.string(),
    customerName: z.string(),
    verified: z.boolean()
  }).optional(),
  metrics: z.object({
    propertyValueIncrease: z.number().optional(),
    energyEfficiencyImprovement: z.string().optional(),
    spaceGainedSqft: z.number().optional(),
    roi: z.number().optional()
  }).optional(),
  tags: z.array(z.string()),
  featured: z.boolean(),
  featured: z.boolean(),
  views: z.number(),
  likes: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type ProjectShowcase = z.infer<typeof ProjectShowcaseSchema>;

export class PortfolioService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 7200;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get portfolio projects by area
   */
  async getProjectsByArea(area: string, limit: number = 20): Promise<ProjectShowcase[]> {
    const cacheKey = `portfolio:area:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const projects = this.getMockProjects(area);
    const sorted = projects
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(sorted));
    return sorted;
  }

  /**
   * Get portfolio by project type
   */
  async getProjectsByType(projectType: string, limit: number = 20): Promise<ProjectShowcase[]> {
    const cacheKey = `portfolio:type:${projectType}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allProjects = this.getAllProjects();
    const filtered = allProjects
      .filter(p => p.projectType.toLowerCase() === projectType.toLowerCase())
      .sort((a, b) => new Date(b.timeline.endDate).getTime() - new Date(a.timeline.endDate).getTime())
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get featured projects
   */
  async getFeaturedProjects(limit: number = 10): Promise<ProjectShowcase[]> {
    const cacheKey = 'portfolio:featured';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allProjects = this.getAllProjects();
    const featured = allProjects
      .filter(p => p.featured)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL * 2, JSON.stringify(featured));
    return featured;
  }

  /**
   * Get projects by street
   */
  async getProjectsByStreet(street: string): Promise<ProjectShowcase[]> {
    const cacheKey = `portfolio:street:${street}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allProjects = this.getAllProjects();
    const filtered = allProjects.filter(p =>
      p.location.street.toLowerCase().includes(street.toLowerCase())
    );

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get portfolio statistics
   */
  async getPortfolioStats(): Promise<any> {
    const cacheKey = 'portfolio:stats';
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const projects = this.getAllProjects();

    const stats = {
      totalProjects: projects.length,
      totalValue: projects.reduce((sum, p) => sum + p.budget.total, 0),
      averageProjectValue: projects.reduce((sum, p) => sum + p.budget.total, 0) / projects.length,
      totalViews: projects.reduce((sum, p) => sum + p.views, 0),
      totalLikes: projects.reduce((sum, p) => sum + p.likes, 0),
      averageRating: projects
        .filter(p => p.customerTestimonial)
        .reduce((sum, p) => sum + (p.customerTestimonial?.rating || 0), 0) /
        projects.filter(p => p.customerTestimonial).length,
      projectsByType: this.groupByType(projects),
      projectsByArea: this.groupByArea(projects),
      averageDuration: projects.reduce((sum, p) => sum + p.timeline.durationWeeks, 0) / projects.length,
      mostPopularFeatures: this.getMostPopularFeatures(projects)
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(stats));
    return stats;
  }

  /**
   * Get project inspiration by budget
   */
  async getProjectsByBudget(minBudget: number, maxBudget: number): Promise<ProjectShowcase[]> {
    const allProjects = this.getAllProjects();
    return allProjects.filter(p =>
      p.budget.total >= minBudget && p.budget.total <= maxBudget
    ).sort((a, b) => b.views - a.views);
  }

  /**
   * Get similar projects
   */
  async getSimilarProjects(projectId: string, limit: number = 5): Promise<ProjectShowcase[]> {
    const project = await this.getProject(projectId);
    if (!project) return [];

    const allProjects = this.getAllProjects();
    const similar = allProjects
      .filter(p => p.id !== projectId)
      .map(p => ({
        project: p,
        similarity: this.calculateSimilarity(project, p)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.project);

    return similar;
  }

  /**
   * Calculate project similarity score
   */
  private calculateSimilarity(project1: ProjectShowcase, project2: ProjectShowcase): number {
    let score = 0;

    // Same project type (40 points)
    if (project1.projectType === project2.projectType) score += 40;

    // Same area (30 points)
    if (project1.location.area === project2.location.area) score += 30;

    // Similar budget (20 points)
    const budgetDiff = Math.abs(project1.budget.total - project2.budget.total);
    const budgetSimilarity = Math.max(0, 1 - budgetDiff / Math.max(project1.budget.total, project2.budget.total));
    score += budgetSimilarity * 20;

    // Common tags (10 points)
    const commonTags = project1.tags.filter(tag => project2.tags.includes(tag)).length;
    score += Math.min(commonTags * 2, 10);

    return score;
  }

  /**
   * Get case studies for marketing
   */
  async getCaseStudies(limit: number = 10): Promise<any[]> {
    const projects = this.getAllProjects();
    const caseStudies = projects
      .filter(p => p.customerTestimonial && p.featured)
      .sort((a, b) => (b.metrics?.roi || 0) - (a.metrics?.roi || 0))
      .slice(0, limit)
      .map(p => ({
        ...p,
        summary: this.generateCaseStudySummary(p)
      }));

    return caseStudies;
  }

  /**
   * Generate case study summary
   */
  private generateCaseStudySummary(project: ProjectShowcase): string {
    const roi = project.metrics?.roi ? `${(project.metrics.roi * 100).toFixed(0)}% ROI` : '';
    const valueIncrease = project.metrics?.propertyValueIncrease
      ? `£${project.metrics.propertyValueIncrease.toLocaleString()} property value increase`
      : '';

    return `${project.title} - ${project.location.area}. ${project.description} Completed in ${project.timeline.durationWeeks} weeks. ${roi} ${valueIncrease}`.trim();
  }

  /**
   * Helper methods
   */
  private async getProject(id: string): Promise<ProjectShowcase | null> {
    const all = this.getAllProjects();
    return all.find(p => p.id === id) || null;
  }

  private getAllProjects(): ProjectShowcase[] {
    // In production, query database
    return this.getMockProjects('NW3');
  }

  private groupByType(projects: ProjectShowcase[]): Record<string, number> {
    return projects.reduce((acc, p) => {
      acc[p.projectType] = (acc[p.projectType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupByArea(projects: ProjectShowcase[]): Record<string, number> {
    return projects.reduce((acc, p) => {
      acc[p.location.area] = (acc[p.location.area] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getMostPopularFeatures(projects: ProjectShowcase[]): string[] {
    const featureCount: Record<string, number> = {};

    projects.forEach(p => {
      p.features.forEach(f => {
        featureCount[f] = (featureCount[f] || 0) + 1;
      });
    });

    return Object.entries(featureCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([feature]) => feature);
  }

  /**
   * Mock data
   */
  private getMockProjects(area: string): ProjectShowcase[] {
    return [
      {
        id: crypto.randomUUID(),
        title: 'Victorian House Full Renovation - Hampstead',
        description: 'Complete renovation of a beautiful Victorian property, preserving original features while adding modern amenities.',
        projectType: 'full-renovation',
        propertyType: 'victorian',
        location: {
          street: 'Hampstead High Street',
          area: 'NW3',
          postcode: 'NW3 1QE'
        },
        timeline: {
          startDate: '2024-03-01T00:00:00Z',
          endDate: '2024-09-15T00:00:00Z',
          durationWeeks: 28
        },
        budget: {
          total: 185000,
          breakdown: [
            { category: 'Structural work', amount: 45000, percentage: 24 },
            { category: 'Kitchen', amount: 38000, percentage: 21 },
            { category: 'Bathrooms', amount: 32000, percentage: 17 },
            { category: 'Electrical & plumbing', amount: 28000, percentage: 15 },
            { category: 'Decorating & finishing', amount: 25000, percentage: 14 },
            { category: 'Project management', amount: 17000, percentage: 9 }
          ]
        },
        scope: [
          'Full rewiring',
          'New plumbing system',
          'Kitchen extension',
          'Two new bathrooms',
          'Sash window restoration',
          'Original feature restoration',
          'New heating system',
          'Loft insulation'
        ],
        features: [
          'Restored original Victorian features',
          'Modern kitchen extension',
          'Energy-efficient heating',
          'Smart home integration',
          'Period fireplaces restored',
          'Custom joinery'
        ],
        materials: [
          {
            material: 'Reclaimed Victorian bricks',
            supplier: 'London Reclamation',
            reason: 'Matching original brickwork'
          },
          {
            material: 'Hardwood sash windows',
            supplier: 'Traditional Joinery Co',
            reason: 'Period-appropriate restoration'
          }
        ],
        contractors: [
          {
            contractorId: crypto.randomUUID(),
            name: 'Heritage Builders Ltd',
            trade: 'general-builder',
            role: 'Main contractor'
          }
        ],
        beforePhotos: [],
        afterPhotos: [],
        customerTestimonial: {
          rating: 5,
          comment: 'Absolutely exceptional work. They preserved the character of our Victorian home while making it perfect for modern living.',
          customerName: 'Dr. James Wilson',
          verified: true
        },
        metrics: {
          propertyValueIncrease: 250000,
          energyEfficiencyImprovement: 'F to B',
          roi: 1.35
        },
        tags: ['victorian', 'period-property', 'full-renovation', 'conservation', 'hampstead'],
        featured: true,
        views: 3420,
        likes: 287,
        createdAt: '2024-09-20T00:00:00Z',
        updatedAt: '2024-09-20T00:00:00Z'
      }
    ];
  }
}

export default PortfolioService;
