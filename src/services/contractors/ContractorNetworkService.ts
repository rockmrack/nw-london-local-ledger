import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Contractor Network Service for NW London
 * Manages network of vetted tradespeople and contractors
 */

export const ContractorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  company: z.string().optional(),
  trades: z.array(z.enum([
    'general-builder',
    'plumber',
    'electrician',
    'carpenter',
    'decorator',
    'roofer',
    'glazier',
    'plasterer',
    'tiler',
    'bricklayer',
    'heating-engineer',
    'bathroom-fitter',
    'kitchen-fitter',
    'flooring-specialist',
    'damp-specialist',
    'locksmith',
    'scaffolder',
    'groundworker',
    'structural-engineer',
    'architect'
  ])),
  specialties: z.array(z.string()),
  serviceAreas: z.array(z.string()),
  qualifications: z.array(z.object({
    type: z.string(),
    number: z.string(),
    expiryDate: z.string().datetime().optional(),
    verified: z.boolean()
  })),
  insurance: z.object({
    publicLiability: z.number(),
    professionalIndemnity: z.number().optional(),
    expiryDate: z.string().datetime(),
    verified: z.boolean()
  }),
  contact: z.object({
    phone: z.string(),
    email: z.string().email(),
    address: z.string()
  }),
  rating: z.object({
    overall: z.number().min(0).max(5),
    totalReviews: z.number(),
    reliability: z.number().min(0).max(5),
    quality: z.number().min(0).max(5),
    value: z.number().min(0).max(5),
    communication: z.number().min(0).max(5)
  }),
  availability: z.object({
    status: z.enum(['available', 'busy', 'fully-booked', 'unavailable']),
    nextAvailable: z.string().datetime().optional(),
    workingDays: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])),
    emergencyCallouts: z.boolean()
  }),
  pricing: z.object({
    dayRate: z.number().optional(),
    hourlyRate: z.number().optional(),
    minimumCharge: z.number().optional(),
    emergencyCalloutFee: z.number().optional()
  }),
  completedJobs: z.number(),
  yearsExperience: z.number(),
  preferredSuppliers: z.array(z.string()).optional(),
  languages: z.array(z.string()),
  verified: z.boolean(),
  featured: z.boolean(),
  joinedDate: z.string().datetime(),
  lastActiveDate: z.string().datetime()
});

export type Contractor = z.infer<typeof ContractorSchema>;

export class ContractorNetworkService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 1800;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Find contractors by trade and area
   */
  async findContractors(criteria: {
    trade: string;
    area: string;
    urgency?: 'normal' | 'urgent' | 'emergency';
    minRating?: number;
    specialty?: string;
  }): Promise<Contractor[]> {
    const cacheKey = `contractors:${criteria.trade}:${criteria.area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // In production, query database with filters
    const contractors = this.getMockContractors(criteria.trade, criteria.area);

    // Filter by rating
    let filtered = contractors;
    if (criteria.minRating) {
      filtered = contractors.filter(c => c.rating.overall >= criteria.minRating);
    }

    // Filter by availability for urgent work
    if (criteria.urgency === 'emergency') {
      filtered = filtered.filter(c => c.availability.emergencyCallouts);
    }

    // Sort by rating and availability
    filtered.sort((a, b) => {
      if (a.availability.status === 'available' && b.availability.status !== 'available') return -1;
      if (a.availability.status !== 'available' && b.availability.status === 'available') return 1;
      return b.rating.overall - a.rating.overall;
    });

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get contractor by ID
   */
  async getContractor(contractorId: string): Promise<Contractor | null> {
    const cached = this.cache.get(contractorId);
    if (cached) return cached;

    const redisData = await this.redis.get(`contractor:${contractorId}`);
    if (redisData) {
      const contractor = JSON.parse(redisData);
      this.cache.set(contractorId, contractor);
      return contractor;
    }

    return null;
  }

  /**
   * Get top-rated contractors by area
   */
  async getTopContractors(area: string, limit: number = 10): Promise<Contractor[]> {
    const cacheKey = `contractors:top:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const allContractors = this.getAllContractorsForArea(area);
    const topRated = allContractors
      .filter(c => c.verified && c.rating.totalReviews >= 10)
      .sort((a, b) => b.rating.overall - a.rating.overall)
      .slice(0, limit);

    await this.redis.setex(cacheKey, this.CACHE_TTL * 2, JSON.stringify(topRated));
    return topRated;
  }

  /**
   * Get specialist contractors
   */
  async getSpecialists(specialty: string, area: string): Promise<Contractor[]> {
    const cacheKey = `contractors:specialist:${specialty}:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const specialists = this.getAllContractorsForArea(area)
      .filter(c => c.specialties.some(s => s.toLowerCase().includes(specialty.toLowerCase())))
      .sort((a, b) => b.rating.overall - a.rating.overall);

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(specialists));
    return specialists;
  }

  /**
   * Get contractors available for emergency work
   */
  async getEmergencyContractors(trade: string, area: string): Promise<Contractor[]> {
    const contractors = await this.findContractors({ trade, area, urgency: 'emergency' });

    return contractors
      .filter(c => c.availability.emergencyCallouts && c.availability.status === 'available')
      .sort((a, b) => b.rating.overall - a.rating.overall)
      .slice(0, 5);
  }

  /**
   * Calculate contractor match score
   */
  calculateMatchScore(contractor: Contractor, requirements: {
    trade: string;
    specialty?: string;
    urgency?: string;
    budget?: number;
  }): number {
    let score = 0;

    // Trade match (40 points)
    if (contractor.trades.some(t => t.includes(requirements.trade))) {
      score += 40;
    }

    // Rating (30 points)
    score += contractor.rating.overall * 6;

    // Availability (15 points)
    if (contractor.availability.status === 'available') {
      score += 15;
    } else if (contractor.availability.status === 'busy') {
      score += 7;
    }

    // Specialty match (10 points)
    if (requirements.specialty && contractor.specialties.some(s =>
      s.toLowerCase().includes(requirements.specialty!.toLowerCase())
    )) {
      score += 10;
    }

    // Verified (5 points)
    if (contractor.verified) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Get contractor availability calendar
   */
  async getAvailability(contractorId: string, days: number = 30): Promise<any[]> {
    const contractor = await this.getContractor(contractorId);
    if (!contractor) return [];

    const calendar = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const isWorkingDay = contractor.availability.workingDays.includes(dayName as any);

      calendar.push({
        date: date.toISOString().split('T')[0],
        available: isWorkingDay && contractor.availability.status !== 'fully-booked',
        slots: isWorkingDay ? ['09:00', '10:00', '13:00', '14:00'] : []
      });
    }

    return calendar;
  }

  /**
   * Mock data generators (replace with real database queries in production)
   */
  private getMockContractors(trade: string, area: string): Contractor[] {
    return [
      {
        id: crypto.randomUUID(),
        name: 'John Smith',
        company: 'Smith & Sons Plumbing',
        trades: ['plumber', 'heating-engineer'],
        specialties: ['Boiler installation', 'Bathroom fitting', 'Emergency plumbing'],
        serviceAreas: ['NW3', 'NW6', 'NW8'],
        qualifications: [
          {
            type: 'Gas Safe',
            number: '123456',
            expiryDate: '2026-12-31T00:00:00Z',
            verified: true
          }
        ],
        insurance: {
          publicLiability: 5000000,
          professionalIndemnity: 2000000,
          expiryDate: '2026-06-30T00:00:00Z',
          verified: true
        },
        contact: {
          phone: '07700 900123',
          email: 'john@smithplumbing.co.uk',
          address: 'NW3 6DN'
        },
        rating: {
          overall: 4.9,
          totalReviews: 156,
          reliability: 5.0,
          quality: 4.9,
          value: 4.8,
          communication: 4.9
        },
        availability: {
          status: 'available',
          nextAvailable: new Date().toISOString(),
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          emergencyCallouts: true
        },
        pricing: {
          hourlyRate: 65,
          minimumCharge: 95,
          emergencyCalloutFee: 150
        },
        completedJobs: 487,
        yearsExperience: 15,
        languages: ['English'],
        verified: true,
        featured: true,
        joinedDate: '2020-01-15T00:00:00Z',
        lastActiveDate: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        name: 'Sarah Williams',
        company: 'Williams Electrical Services',
        trades: ['electrician'],
        specialties: ['Rewiring', 'EV charger installation', 'Smart home systems', 'Emergency electrical'],
        serviceAreas: ['NW1', 'NW3', 'NW5', 'NW6', 'NW8'],
        qualifications: [
          {
            type: 'NICEIC Approved',
            number: '789012',
            verified: true
          }
        ],
        insurance: {
          publicLiability: 10000000,
          professionalIndemnity: 5000000,
          expiryDate: '2026-08-31T00:00:00Z',
          verified: true
        },
        contact: {
          phone: '07700 900124',
          email: 'sarah@williamselectrical.co.uk',
          address: 'NW6 1AA'
        },
        rating: {
          overall: 5.0,
          totalReviews: 203,
          reliability: 5.0,
          quality: 5.0,
          value: 4.9,
          communication: 5.0
        },
        availability: {
          status: 'busy',
          nextAvailable: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          emergencyCallouts: true
        },
        pricing: {
          hourlyRate: 70,
          minimumCharge: 120,
          emergencyCalloutFee: 180
        },
        completedJobs: 634,
        yearsExperience: 12,
        languages: ['English'],
        verified: true,
        featured: true,
        joinedDate: '2019-06-01T00:00:00Z',
        lastActiveDate: new Date().toISOString()
      }
    ];
  }

  private getAllContractorsForArea(area: string): Contractor[] {
    // Mock data - in production, query database
    return this.getMockContractors('general', area);
  }
}

export default ContractorNetworkService;
