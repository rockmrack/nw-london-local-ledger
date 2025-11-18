import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Comprehensive Property Maintenance Service for NW London
 * Handles scheduled maintenance, emergency repairs, and ongoing property care
 */

export const MaintenanceJobSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  propertyAddress: z.string(),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  street: z.string(),
  jobType: z.enum([
    'plumbing',
    'electrical',
    'heating',
    'roofing',
    'guttering',
    'drainage',
    'locksmith',
    'glazing',
    'carpentry',
    'decorating',
    'appliance-repair',
    'pest-control',
    'damp-treatment',
    'general-handyman',
    'emergency-repair'
  ]),
  category: z.enum(['scheduled', 'reactive', 'emergency', 'preventive']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  status: z.enum([
    'pending',
    'scheduled',
    'en-route',
    'in-progress',
    'completed',
    'cancelled',
    'requires-parts',
    'awaiting-approval'
  ]),
  description: z.string(),
  detailedNotes: z.string().optional(),
  reportedBy: z.string(),
  reportedDate: z.string().datetime(),
  scheduledDate: z.string().datetime().optional(),
  completedDate: z.string().datetime().optional(),
  assignedContractor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    trade: z.string(),
    phone: z.string(),
    eta: z.string().datetime().optional()
  }).optional(),
  estimatedCost: z.number().min(0).optional(),
  actualCost: z.number().min(0).optional(),
  partsRequired: z.array(z.object({
    part: z.string(),
    quantity: z.number(),
    cost: z.number(),
    ordered: z.boolean(),
    received: z.boolean()
  })).optional(),
  photos: z.array(z.object({
    url: z.string(),
    caption: z.string().optional(),
    timestamp: z.string().datetime()
  })).optional(),
  customerFeedback: z.object({
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
    submittedAt: z.string().datetime()
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const MaintenanceContractSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  propertyAddress: z.string(),
  postcode: z.string(),
  contractType: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  annualCost: z.number().min(0),
  paymentFrequency: z.enum(['monthly', 'quarterly', 'annual']),
  coverage: z.array(z.string()),
  emergencyCallouts: z.number(),
  emergencyCalloutsUsed: z.number(),
  scheduledVisits: z.number(),
  scheduledVisitsCompleted: z.number(),
  status: z.enum(['active', 'expired', 'cancelled', 'suspended']),
  autoRenew: z.boolean(),
  nextScheduledVisit: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type MaintenanceJob = z.infer<typeof MaintenanceJobSchema>;
export type MaintenanceContract = z.infer<typeof MaintenanceContractSchema>;

export class MaintenanceService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 1800; // 30 minutes

  // Emergency response times (minutes)
  private readonly EMERGENCY_RESPONSE_TIMES = {
    'NW3': 30,  // Hampstead - priority area
    'NW8': 30,  // St John's Wood - priority area
    'NW11': 35, // Golders Green
    'NW1': 40,  // Camden
    'NW5': 40,  // Kentish Town
    'NW6': 35,  // West Hampstead
    'NW2': 45,  // Cricklewood
    'NW4': 45,  // Hendon
    'NW7': 50,  // Mill Hill
    'NW9': 50,  // Colindale
    'NW10': 45  // Willesden
  };

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Report a maintenance issue - public facing
   */
  async reportIssue(issue: {
    customerName: string;
    email: string;
    phone: string;
    propertyAddress: string;
    postcode: string;
    issueType: string;
    description: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    preferredDate?: string;
  }): Promise<{ success: boolean; jobId: string; eta: string }> {
    try {
      const jobId = crypto.randomUUID();
      const customerId = crypto.randomUUID(); // In production, look up or create customer
      const propertyId = crypto.randomUUID(); // In production, look up or create property

      const category = issue.urgency === 'critical' ? 'emergency' : 'reactive';
      const area = issue.postcode.match(/^([A-Z]{1,2}\d{1,2})/)?.[1] || 'NW3';

      const job: Partial<MaintenanceJob> = {
        id: jobId,
        customerId,
        propertyId,
        propertyAddress: issue.propertyAddress,
        postcode: issue.postcode.toUpperCase(),
        street: this.extractStreetName(issue.propertyAddress),
        jobType: this.mapIssueType(issue.issueType),
        category,
        priority: issue.urgency,
        status: category === 'emergency' ? 'scheduled' : 'pending',
        description: issue.description,
        reportedBy: issue.customerName,
        reportedDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // For emergencies, auto-assign contractor
      if (category === 'emergency') {
        const contractor = await this.assignEmergencyContractor(job.jobType!, area);
        job.assignedContractor = contractor;
        job.scheduledDate = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins
      }

      await this.cacheJob(jobId, job);

      // Notify team and customer
      await this.notifyTeam(job, issue.urgency);
      await this.notifyCustomer(issue.email, jobId, category);

      const responseTime = this.EMERGENCY_RESPONSE_TIMES[area as keyof typeof this.EMERGENCY_RESPONSE_TIMES] || 45;

      return {
        success: true,
        jobId,
        eta: category === 'emergency'
          ? `Engineer will arrive within ${responseTime} minutes`
          : 'We will contact you within 2 hours to schedule'
      };
    } catch (error) {
      console.error('Error reporting maintenance issue:', error);
      throw new Error('Failed to report maintenance issue');
    }
  }

  /**
   * Get emergency contractors available now
   */
  async getAvailableEmergencyContractors(trade: string, area: string): Promise<any[]> {
    // In production, query real-time contractor availability
    const contractors = [
      {
        id: crypto.randomUUID(),
        name: 'John Smith',
        trade: 'Emergency Plumber',
        phone: '07700 900123',
        rating: 4.9,
        responseTime: 25,
        currentLocation: area
      },
      {
        id: crypto.randomUUID(),
        name: 'Mike Johnson',
        trade: 'Emergency Electrician',
        phone: '07700 900124',
        rating: 4.8,
        responseTime: 30,
        currentLocation: area
      },
      {
        id: crypto.randomUUID(),
        name: 'Sarah Williams',
        trade: 'Emergency Locksmith',
        phone: '07700 900125',
        rating: 5.0,
        responseTime: 20,
        currentLocation: area
      }
    ];

    return contractors.filter(c => c.trade.toLowerCase().includes(trade.toLowerCase()));
  }

  /**
   * Create maintenance contract (subscription)
   */
  async createMaintenanceContract(contract: {
    customerId: string;
    propertyId: string;
    propertyAddress: string;
    postcode: string;
    contractType: 'bronze' | 'silver' | 'gold' | 'platinum';
    autoRenew: boolean;
  }): Promise<MaintenanceContract> {
    const contractId = crypto.randomUUID();

    const contractDetails = this.getContractDetails(contract.contractType);

    const newContract: MaintenanceContract = {
      id: contractId,
      customerId: contract.customerId,
      propertyId: contract.propertyId,
      propertyAddress: contract.propertyAddress,
      postcode: contract.postcode,
      contractType: contract.contractType,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      annualCost: contractDetails.annualCost,
      paymentFrequency: 'monthly',
      coverage: contractDetails.coverage,
      emergencyCallouts: contractDetails.emergencyCallouts,
      emergencyCalloutsUsed: 0,
      scheduledVisits: contractDetails.scheduledVisits,
      scheduledVisitsCompleted: 0,
      status: 'active',
      autoRenew: contract.autoRenew,
      nextScheduledVisit: this.calculateNextVisit(contractDetails.scheduledVisits),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store contract
    await this.redis.setex(
      `contract:${contractId}`,
      this.CACHE_TTL * 48,
      JSON.stringify(newContract)
    );

    return newContract;
  }

  /**
   * Get contract details by tier
   */
  private getContractDetails(tier: string) {
    const contracts = {
      bronze: {
        annualCost: 299,
        emergencyCallouts: 1,
        scheduledVisits: 1,
        coverage: ['Boiler service', 'Basic plumbing', 'Emergency callout (1 per year)']
      },
      silver: {
        annualCost: 599,
        emergencyCallouts: 2,
        scheduledVisits: 2,
        coverage: [
          'Boiler service', 'Full plumbing coverage', 'Basic electrical',
          'Gutter cleaning', 'Emergency callouts (2 per year)',
          'Annual safety check'
        ]
      },
      gold: {
        annualCost: 999,
        emergencyCallouts: 4,
        scheduledVisits: 4,
        coverage: [
          'Boiler service & repairs', 'Full plumbing coverage',
          'Full electrical coverage', 'Heating system maintenance',
          'Gutter cleaning', 'Drainage maintenance',
          'Emergency callouts (4 per year)', 'Quarterly safety checks',
          '10% discount on all additional work'
        ]
      },
      platinum: {
        annualCost: 1899,
        emergencyCallouts: -1, // Unlimited
        scheduledVisits: 12,
        coverage: [
          'Full property maintenance', 'All plumbing & electrical',
          'Heating & boiler care', 'Roof & guttering',
          'Drainage & sewerage', 'Appliance repairs',
          'Unlimited emergency callouts', 'Monthly property inspections',
          'Priority 24/7 response', '20% discount on renovations',
          'Free locksmith service', 'Annual deep clean'
        ]
      }
    };

    return contracts[tier as keyof typeof contracts] || contracts.bronze;
  }

  /**
   * Get maintenance history for a property
   */
  async getPropertyMaintenanceHistory(propertyId: string): Promise<MaintenanceJob[]> {
    const cacheKey = `maintenance:history:${propertyId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // In production, query database
    const history: MaintenanceJob[] = [];

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(history));
    return history;
  }

  /**
   * Get common maintenance issues by street
   */
  async getCommonIssuesByStreet(street: string): Promise<Record<string, number>> {
    const cacheKey = `maintenance:common:${street}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Analytics on common issues
    const issues = {
      'plumbing': 35,
      'heating': 28,
      'electrical': 22,
      'roofing': 15,
      'drainage': 18,
      'guttering': 12
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL * 24, JSON.stringify(issues));
    return issues;
  }

  /**
   * Get seasonal maintenance recommendations
   */
  async getSeasonalRecommendations(month: number): Promise<string[]> {
    const recommendations: Record<number, string[]> = {
      0: ['Boiler service', 'Heating system check', 'Pipe insulation', 'Gutter clearance'],
      1: ['Boiler service', 'Radiator bleeding', 'Check for damp'],
      2: ['Spring cleaning', 'Window cleaning', 'Gutter check'],
      3: ['Garden preparation', 'Exterior painting', 'Roof inspection'],
      4: ['Air conditioning service', 'Window repairs', 'Exterior maintenance'],
      5: ['Gutter cleaning', 'Roof check', 'Garden maintenance'],
      6: ['Air conditioning check', 'Exterior painting', 'Fence repairs'],
      7: ['Garden maintenance', 'Window cleaning', 'Exterior repairs'],
      8: ['Gutter clearance', 'Heating system prep', 'Draught proofing'],
      9: ['Boiler service', 'Heating check', 'Window insulation'],
      10: ['Winter prep', 'Pipe insulation', 'Gutter clearance', 'Boiler check'],
      11: ['Emergency heating check', 'Pipe protection', 'Roof inspection']
    };

    return recommendations[month] || [];
  }

  /**
   * Calculate response time for area
   */
  getResponseTime(postcode: string, priority: string): number {
    const area = postcode.match(/^([A-Z]{1,2}\d{1,2})/)?.[1] || 'NW3';
    const baseTime = this.EMERGENCY_RESPONSE_TIMES[area as keyof typeof this.EMERGENCY_RESPONSE_TIMES] || 45;

    if (priority === 'critical') return baseTime;
    if (priority === 'high') return baseTime * 2;
    if (priority === 'medium') return baseTime * 4;
    return baseTime * 8;
  }

  private async assignEmergencyContractor(trade: string, area: string) {
    const contractors = await this.getAvailableEmergencyContractors(trade, area);
    const contractor = contractors[0] || {
      id: crypto.randomUUID(),
      name: 'On-call Engineer',
      trade: 'Multi-trade',
      phone: '07459 345456',
      eta: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };

    return contractor;
  }

  private mapIssueType(type: string): any {
    const mapping: Record<string, string> = {
      'leak': 'plumbing',
      'no hot water': 'heating',
      'boiler': 'heating',
      'power cut': 'electrical',
      'fuse': 'electrical',
      'blocked drain': 'drainage',
      'roof leak': 'roofing',
      'broken window': 'glazing',
      'locked out': 'locksmith',
      'broken lock': 'locksmith'
    };

    return mapping[type.toLowerCase()] || 'general-handyman';
  }

  private extractStreetName(address: string): string {
    const parts = address.split(',');
    return parts[0]?.trim() || '';
  }

  private calculateNextVisit(visitsPerYear: number): string {
    const daysPerVisit = Math.floor(365 / visitsPerYear);
    return new Date(Date.now() + daysPerVisit * 24 * 60 * 60 * 1000).toISOString();
  }

  private async cacheJob(id: string, job: any): Promise<void> {
    await this.redis.setex(`job:${id}`, this.CACHE_TTL, JSON.stringify(job));
    this.cache.set(id, job);
  }

  private async notifyTeam(job: any, urgency: string): Promise<void> {
    console.log(`[TEAM ${urgency.toUpperCase()}] New maintenance job: ${job.id}`);
  }

  private async notifyCustomer(email: string, jobId: string, category: string): Promise<void> {
    console.log(`[CUSTOMER EMAIL] ${category} job confirmation sent to ${email}`);
  }
}

export default MaintenanceService;
