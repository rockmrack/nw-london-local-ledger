import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Comprehensive Renovation Service for NW London
 * Handles all aspects of property renovation projects
 */

// Validation schemas
export const RenovationProjectSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  propertyAddress: z.string().min(1),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  street: z.string(),
  propertyType: z.enum(['victorian', 'edwardian', 'georgian', 'modern', 'apartment', 'terrace', 'detached', 'semi-detached']),
  projectType: z.enum([
    'full-renovation',
    'kitchen-renovation',
    'bathroom-renovation',
    'loft-conversion',
    'basement-conversion',
    'extension',
    'roof-repair',
    'window-replacement',
    'rewiring',
    'replumbing',
    'damp-proofing',
    'decorating',
    'flooring',
    'conservation-work',
    'period-restoration',
    'multi-room-renovation'
  ]),
  status: z.enum(['enquiry', 'survey-scheduled', 'surveyed', 'quote-sent', 'quote-accepted', 'in-progress', 'completed', 'on-hold', 'cancelled']),
  budget: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.enum(['GBP']).default('GBP')
  }),
  quote: z.object({
    amount: z.number().min(0),
    breakdown: z.array(z.object({
      category: z.string(),
      description: z.string(),
      cost: z.number(),
      vat: z.number()
    })),
    totalExVAT: z.number(),
    totalIncVAT: z.number(),
    validUntil: z.string().datetime()
  }).optional(),
  timeline: z.object({
    estimatedStartDate: z.string().datetime().optional(),
    estimatedEndDate: z.string().datetime().optional(),
    actualStartDate: z.string().datetime().optional(),
    actualEndDate: z.string().datetime().optional(),
    durationWeeks: z.number().min(0)
  }).optional(),
  surveyDetails: z.object({
    scheduledDate: z.string().datetime(),
    completedDate: z.string().datetime().optional(),
    surveyorName: z.string(),
    findings: z.string().optional(),
    photos: z.array(z.string()).optional(),
    recommendations: z.array(z.string()).optional()
  }).optional(),
  requirements: z.array(z.string()),
  planningPermissionRequired: z.boolean(),
  buildingControlRequired: z.boolean(),
  partyWallAgreementRequired: z.boolean(),
  conservationAreaWork: z.boolean(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assignedContractors: z.array(z.string().uuid()).optional(),
  materialsList: z.array(z.object({
    item: z.string(),
    quantity: z.number(),
    unit: z.string(),
    estimatedCost: z.number(),
    supplier: z.string().optional(),
    ordered: z.boolean().default(false)
  })).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const RenovationEnquirySchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^(\+44|0)[0-9]{10}$/),
  propertyAddress: z.string().min(1),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  propertyType: z.string(),
  projectType: z.string(),
  projectDescription: z.string().min(10),
  budget: z.string().optional(),
  timeframe: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'urgent']),
  preferredContactMethod: z.enum(['email', 'phone', 'both']),
  preferredContactTime: z.string().optional()
});

export type RenovationProject = z.infer<typeof RenovationProjectSchema>;
export type RenovationEnquiry = z.infer<typeof RenovationEnquirySchema>;

export class RenovationService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Submit a new renovation enquiry
   */
  async submitEnquiry(enquiry: RenovationEnquiry): Promise<{ success: boolean; projectId: string; message: string }> {
    try {
      const validated = RenovationEnquirySchema.parse(enquiry);

      // Create initial project record
      const projectId = crypto.randomUUID();
      const project: Partial<RenovationProject> = {
        id: projectId,
        propertyAddress: validated.propertyAddress,
        postcode: validated.postcode.toUpperCase(),
        street: this.extractStreetName(validated.propertyAddress),
        propertyType: this.mapPropertyType(validated.propertyType),
        projectType: this.mapProjectType(validated.projectType),
        status: 'enquiry',
        requirements: [validated.projectDescription],
        priority: validated.urgency,
        conservationAreaWork: await this.checkConservationArea(validated.postcode),
        planningPermissionRequired: this.requiresPlanningPermission(validated.projectType),
        buildingControlRequired: this.requiresBuildingControl(validated.projectType),
        partyWallAgreementRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store in database (simulated for now)
      await this.cacheProject(projectId, project);

      // Send notification to team
      await this.notifyTeam(validated, projectId);

      // Send confirmation to customer
      await this.sendCustomerConfirmation(validated.email, projectId);

      return {
        success: true,
        projectId,
        message: `Thank you for your enquiry. Your reference number is ${projectId.slice(0, 8)}. We'll contact you within 24 hours.`
      };
    } catch (error) {
      console.error('Error submitting enquiry:', error);
      throw new Error('Failed to submit renovation enquiry');
    }
  }

  /**
   * Generate detailed quote for a project
   */
  async generateQuote(projectId: string): Promise<RenovationProject['quote']> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const breakdown = await this.calculateCostBreakdown(project);
    const totalExVAT = breakdown.reduce((sum, item) => sum + item.cost, 0);
    const totalVAT = breakdown.reduce((sum, item) => sum + item.vat, 0);

    const quote = {
      amount: totalExVAT + totalVAT,
      breakdown,
      totalExVAT,
      totalIncVAT: totalExVAT + totalVAT,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    // Update project with quote
    await this.updateProject(projectId, { quote, status: 'quote-sent' });

    return quote;
  }

  /**
   * Calculate cost breakdown based on project details
   */
  private async calculateCostBreakdown(project: Partial<RenovationProject>) {
    const breakdown: any[] = [];
    const VAT_RATE = 0.20;

    // Base costs by project type
    const baseCosts: Record<string, number> = {
      'full-renovation': 50000,
      'kitchen-renovation': 15000,
      'bathroom-renovation': 8000,
      'loft-conversion': 35000,
      'basement-conversion': 45000,
      'extension': 40000,
      'roof-repair': 8000,
      'window-replacement': 6000,
      'rewiring': 4000,
      'replumbing': 5000,
      'damp-proofing': 3000,
      'decorating': 2500,
      'flooring': 3500,
      'conservation-work': 25000,
      'period-restoration': 35000,
      'multi-room-renovation': 30000
    };

    const baseCost = baseCosts[project.projectType || 'decorating'] || 5000;

    // Property type multipliers
    const propertyMultipliers: Record<string, number> = {
      'victorian': 1.2,
      'edwardian': 1.15,
      'georgian': 1.3,
      'modern': 1.0,
      'apartment': 0.9,
      'terrace': 1.0,
      'detached': 1.2,
      'semi-detached': 1.1
    };

    const multiplier = propertyMultipliers[project.propertyType || 'modern'] || 1.0;
    const adjustedCost = baseCost * multiplier;

    // Labour
    breakdown.push({
      category: 'Labour',
      description: 'Skilled tradespeople and project management',
      cost: adjustedCost * 0.5,
      vat: adjustedCost * 0.5 * VAT_RATE
    });

    // Materials
    breakdown.push({
      category: 'Materials',
      description: 'All materials, fixtures, and fittings',
      cost: adjustedCost * 0.35,
      vat: adjustedCost * 0.35 * VAT_RATE
    });

    // Scaffolding if required
    if (['roof-repair', 'extension', 'full-renovation'].includes(project.projectType || '')) {
      breakdown.push({
        category: 'Scaffolding',
        description: 'Scaffolding hire and installation',
        cost: 2500,
        vat: 2500 * VAT_RATE
      });
    }

    // Skip hire
    breakdown.push({
      category: 'Waste Removal',
      description: 'Skip hire and waste disposal',
      cost: 800,
      vat: 800 * VAT_RATE
    });

    // Planning/Building Control if required
    if (project.planningPermissionRequired) {
      breakdown.push({
        category: 'Planning Permission',
        description: 'Planning application and fees',
        cost: 1500,
        vat: 1500 * VAT_RATE
      });
    }

    if (project.buildingControlRequired) {
      breakdown.push({
        category: 'Building Control',
        description: 'Building regulations compliance and inspections',
        cost: 1200,
        vat: 1200 * VAT_RATE
      });
    }

    // Conservation area premium
    if (project.conservationAreaWork) {
      breakdown.push({
        category: 'Conservation Work',
        description: 'Additional requirements for conservation area',
        cost: adjustedCost * 0.15,
        vat: adjustedCost * 0.15 * VAT_RATE
      });
    }

    // Project management
    breakdown.push({
      category: 'Project Management',
      description: 'Full project coordination and supervision',
      cost: adjustedCost * 0.1,
      vat: adjustedCost * 0.1 * VAT_RATE
    });

    return breakdown;
  }

  /**
   * Get renovation projects by area/street
   */
  async getProjectsByArea(postcode: string): Promise<RenovationProject[]> {
    const cacheKey = `projects:area:${postcode}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // In production, query database
    const projects: RenovationProject[] = [];

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(projects));
    return projects;
  }

  /**
   * Get popular renovation types by street
   */
  async getPopularRenovationsByStreet(street: string): Promise<Record<string, number>> {
    const cacheKey = `renovation:popular:${street}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Analytics on popular renovation types
    const popular = {
      'kitchen-renovation': 45,
      'bathroom-renovation': 38,
      'loft-conversion': 25,
      'window-replacement': 30,
      'decorating': 50,
      'flooring': 28
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL * 24, JSON.stringify(popular));
    return popular;
  }

  /**
   * Get average costs by area
   */
  async getAverageCostsByArea(area: string): Promise<Record<string, number>> {
    return {
      'full-renovation': 75000,
      'kitchen-renovation': 18000,
      'bathroom-renovation': 9500,
      'loft-conversion': 42000,
      'basement-conversion': 55000,
      'extension': 48000,
      'roof-repair': 9500,
      'window-replacement': 7500
    };
  }

  /**
   * Check if property is in conservation area
   */
  private async checkConservationArea(postcode: string): Promise<boolean> {
    const conservationAreas = ['NW3', 'NW8', 'NW11'];
    const area = postcode.match(/^([A-Z]{1,2}\d{1,2})/)?.[1];
    return conservationAreas.includes(area || '');
  }

  /**
   * Check if planning permission required
   */
  private requiresPlanningPermission(projectType: string): boolean {
    const requiresPlanning = [
      'extension',
      'loft-conversion',
      'basement-conversion',
      'conservation-work'
    ];
    return requiresPlanning.includes(projectType);
  }

  /**
   * Check if building control required
   */
  private requiresBuildingControl(projectType: string): boolean {
    const requiresControl = [
      'extension',
      'loft-conversion',
      'basement-conversion',
      'rewiring',
      'replumbing',
      'full-renovation'
    ];
    return requiresControl.includes(projectType);
  }

  private extractStreetName(address: string): string {
    // Simple extraction - in production use proper address parser
    const parts = address.split(',');
    return parts[0]?.trim() || '';
  }

  private mapPropertyType(type: string): any {
    const mapping: Record<string, string> = {
      'victorian house': 'victorian',
      'edwardian house': 'edwardian',
      'georgian house': 'georgian',
      'flat': 'apartment',
      'apartment': 'apartment',
      'terraced house': 'terrace',
      'detached house': 'detached',
      'semi-detached house': 'semi-detached'
    };
    return mapping[type.toLowerCase()] || 'modern';
  }

  private mapProjectType(type: string): any {
    const mapping: Record<string, string> = {
      'kitchen': 'kitchen-renovation',
      'bathroom': 'bathroom-renovation',
      'loft': 'loft-conversion',
      'basement': 'basement-conversion',
      'extension': 'extension',
      'full renovation': 'full-renovation',
      'decorating': 'decorating',
      'flooring': 'flooring'
    };
    return mapping[type.toLowerCase()] || 'decorating';
  }

  private async cacheProject(id: string, project: any): Promise<void> {
    await this.redis.setex(`project:${id}`, this.CACHE_TTL, JSON.stringify(project));
    this.cache.set(id, project);
  }

  private async getProject(id: string): Promise<Partial<RenovationProject> | null> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const redisData = await this.redis.get(`project:${id}`);
    if (redisData) {
      const project = JSON.parse(redisData);
      this.cache.set(id, project);
      return project;
    }

    return null;
  }

  private async updateProject(id: string, updates: any): Promise<void> {
    const project = await this.getProject(id);
    if (project) {
      const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
      await this.cacheProject(id, updated);
    }
  }

  private async notifyTeam(enquiry: RenovationEnquiry, projectId: string): Promise<void> {
    console.log(`[TEAM NOTIFICATION] New renovation enquiry: ${projectId}`);
    // In production: send email/SMS to team
  }

  private async sendCustomerConfirmation(email: string, projectId: string): Promise<void> {
    console.log(`[CUSTOMER EMAIL] Confirmation sent to ${email} for project ${projectId}`);
    // In production: send professional email with details
  }
}

export default RenovationService;
