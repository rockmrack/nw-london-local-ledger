import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Street-Level Analytics Service for NW London
 * Provides micro-local insights for renovation and maintenance decisions
 */

export const StreetInsightsSchema = z.object({
  street: z.string(),
  postcode: z.string(),
  area: z.string(),
  analytics: z.object({
    propertyCount: z.number(),
    averagePropertyAge: z.number(),
    predominantPropertyType: z.string(),
    conservationArea: z.boolean(),
    averagePropertyValue: z.number(),
    propertyValueTrend: z.enum(['rising', 'stable', 'falling']),
    renovationActivity: z.object({
      score: z.number().min(0).max(100),
      trend: z.enum(['increasing', 'stable', 'decreasing']),
      recentProjects: z.number(),
      avgProjectValue: z.number()
    }),
    maintenanceNeeds: z.object({
      score: z.number().min(0).max(100),
      commonIssues: z.array(z.string()),
      seasonalRisks: z.array(z.string()),
      emergencyCallouts: z.number()
    }),
    marketIntelligence: z.object({
      demandScore: z.number().min(0).max(100),
      competitionLevel: z.enum(['low', 'medium', 'high']),
      growthPotential: z.enum(['low', 'medium', 'high', 'very-high']),
      recommendedServices: z.array(z.string())
    })
  }),
  recommendations: z.array(z.object({
    type: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    estimatedROI: z.number().optional()
  })),
  comparableStreets: z.array(z.string()),
  lastUpdated: z.string().datetime()
});

export type StreetInsights = z.infer<typeof StreetInsightsSchema>;

export class StreetAnalyticsService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 7200; // 2 hours

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Get comprehensive street-level insights
   */
  async getStreetInsights(street: string, postcode: string): Promise<StreetInsights> {
    const cacheKey = `street:insights:${street}:${postcode}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const area = this.extractArea(postcode);
    const insights: StreetInsights = {
      street,
      postcode,
      area,
      analytics: {
        propertyCount: await this.getPropertyCount(street),
        averagePropertyAge: await this.getAveragePropertyAge(street),
        predominantPropertyType: await this.getPredominantPropertyType(street),
        conservationArea: await this.isConservationArea(postcode),
        averagePropertyValue: await this.getAveragePropertyValue(street),
        propertyValueTrend: await this.getPropertyValueTrend(street),
        renovationActivity: await this.getRenovationActivity(street),
        maintenanceNeeds: await this.getMaintenanceNeeds(street),
        marketIntelligence: await this.getMarketIntelligence(street, area)
      },
      recommendations: await this.generateRecommendations(street, area),
      comparableStreets: await this.getComparableStreets(street, area),
      lastUpdated: new Date().toISOString()
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(insights));
    return insights;
  }

  /**
   * Get renovation activity for a street
   */
  private async getRenovationActivity(street: string) {
    // In production, query real data
    const streetKey = street.toLowerCase();
    const highActivityStreets = [
      'hampstead high street', 'finchley road', 'west end lane',
      'belsize avenue', 'primrose hill road', 'rosslyn hill'
    ];

    const isHighActivity = highActivityStreets.some(s => streetKey.includes(s));

    return {
      score: isHighActivity ? 85 : 65,
      trend: isHighActivity ? 'increasing' as const : 'stable' as const,
      recentProjects: isHighActivity ? 45 : 18,
      avgProjectValue: isHighActivity ? 75000 : 35000
    };
  }

  /**
   * Get maintenance needs analysis
   */
  private async getMaintenanceNeeds(street: string) {
    const propertyAge = await this.getAveragePropertyAge(street);
    const score = propertyAge > 100 ? 85 : propertyAge > 50 ? 70 : 50;

    return {
      score,
      commonIssues: this.getCommonIssuesForAge(propertyAge),
      seasonalRisks: [
        'Burst pipes in winter',
        'Gutter overflow in autumn',
        'Boiler failures in cold weather',
        'Damp issues in wet seasons'
      ],
      emergencyCallouts: Math.floor(score / 10)
    };
  }

  /**
   * Get market intelligence
   */
  private async getMarketIntelligence(street: string, area: string) {
    const premiumAreas = ['NW3', 'NW8', 'NW11'];
    const isPremium = premiumAreas.includes(area);

    return {
      demandScore: isPremium ? 95 : 75,
      competitionLevel: isPremium ? 'high' as const : 'medium' as const,
      growthPotential: isPremium ? 'very-high' as const : 'high' as const,
      recommendedServices: this.getRecommendedServices(isPremium, area)
    };
  }

  /**
   * Generate personalized recommendations
   */
  private async generateRecommendations(street: string, area: string): Promise<any[]> {
    const recommendations = [];
    const propertyType = await this.getPredominantPropertyType(street);
    const isConservation = await this.isConservationArea(area);

    if (propertyType === 'victorian' || propertyType === 'edwardian') {
      recommendations.push({
        type: 'renovation',
        title: 'Period Property Restoration',
        description: `High demand for sympathetic renovations of ${propertyType} properties on ${street}. Focus on preserving original features while modernizing.`,
        priority: 'high' as const,
        estimatedROI: 1.35
      });

      recommendations.push({
        type: 'maintenance',
        title: 'Sash Window Restoration',
        description: 'Many properties require sash window restoration. Preservation of original features adds significant value.',
        priority: 'high' as const,
        estimatedROI: 1.25
      });
    }

    if (isConservation) {
      recommendations.push({
        type: 'specialist',
        title: 'Conservation Area Expertise',
        description: 'Properties require specialist knowledge of conservation area regulations. Market premium for compliant work.',
        priority: 'high' as const,
        estimatedROI: 1.45
      });
    }

    recommendations.push({
      type: 'maintenance',
      title: 'Preventive Maintenance Contracts',
      description: 'Establish regular maintenance contracts for properties on this street to build recurring revenue.',
      priority: 'medium' as const,
      estimatedROI: 1.60
    });

    recommendations.push({
      type: 'renovation',
      title: 'Kitchen & Bathroom Modernization',
      description: 'Strong demand for modern kitchen and bathroom installations. Average project value £15k-25k.',
      priority: 'medium' as const,
      estimatedROI: 1.20
    });

    if (['NW3', 'NW8', 'NW11'].includes(area)) {
      recommendations.push({
        type: 'renovation',
        title: 'Luxury Basement Conversions',
        description: 'Premium area with high demand for basement conversions. Average value £50k-100k.',
        priority: 'high' as const,
        estimatedROI: 1.50
      });
    }

    return recommendations;
  }

  /**
   * Get comparable streets for benchmarking
   */
  private async getComparableStreets(street: string, area: string): Promise<string[]> {
    const streetsByArea: Record<string, string[]> = {
      'NW3': ['Belsize Avenue', 'Hampstead High Street', 'Frognal', 'Rosslyn Hill', 'West End Lane'],
      'NW8': ['Abbey Road', 'St John\'s Wood High Street', 'Grove End Road', 'Hamilton Terrace'],
      'NW11': ['Golders Green Road', 'The Bishop\'s Avenue', 'Hampstead Way', 'Corringham Road'],
      'NW1': ['Camden High Street', 'Parkway', 'Delancey Street', 'Kentish Town Road'],
      'NW5': ['Dartmouth Park Road', 'Fortress Road', 'Highgate Road', 'Tufnell Park Road'],
      'NW6': ['West End Lane', 'Kilburn High Road', 'Brondesbury Park', 'Salusbury Road']
    };

    const comparables = streetsByArea[area] || [];
    return comparables.filter(s => s.toLowerCase() !== street.toLowerCase()).slice(0, 4);
  }

  /**
   * Get common issues by property age
   */
  private getCommonIssuesForAge(age: number): string[] {
    if (age > 100) {
      return [
        'Sash window repairs',
        'Roof maintenance',
        'Damp & timber issues',
        'Original plumbing replacement',
        'Electrical rewiring',
        'Chimney repairs',
        'Subsidence monitoring'
      ];
    } else if (age > 50) {
      return [
        'Window replacement',
        'Boiler upgrades',
        'Roof repairs',
        'Rewiring',
        'Replumbing',
        'External rendering'
      ];
    } else {
      return [
        'Boiler servicing',
        'General maintenance',
        'Decorating',
        'Minor repairs',
        'Appliance repairs'
      ];
    }
  }

  /**
   * Get recommended services by area
   */
  private getRecommendedServices(isPremium: boolean, area: string): string[] {
    const base = [
      'Period property renovation',
      'Kitchen & bathroom fitting',
      'General maintenance',
      'Emergency plumbing',
      'Electrical work'
    ];

    if (isPremium) {
      return [
        'Luxury renovations',
        'Basement conversions',
        'Loft conversions',
        'High-end kitchen fitting',
        'Bespoke joinery',
        'Heritage restoration',
        ...base
      ];
    }

    return base;
  }

  /**
   * Helper methods
   */
  private async getPropertyCount(street: string): Promise<number> {
    // Simulate varying property counts
    return Math.floor(Math.random() * 100) + 50;
  }

  private async getAveragePropertyAge(street: string): Promise<number> {
    const streetKey = street.toLowerCase();
    if (streetKey.includes('hampstead') || streetKey.includes('belsize')) {
      return 120; // Victorian/Georgian
    }
    if (streetKey.includes('garden suburb') || streetKey.includes('wildwood')) {
      return 100; // Edwardian
    }
    return 60; // Mix
  }

  private async getPredominantPropertyType(street: string): Promise<string> {
    const streetKey = street.toLowerCase();
    if (streetKey.includes('hampstead') || streetKey.includes('primrose')) {
      return 'victorian';
    }
    if (streetKey.includes('garden') || streetKey.includes('suburb')) {
      return 'edwardian';
    }
    if (streetKey.includes('finchley road') || streetKey.includes('swiss cottage')) {
      return 'apartment';
    }
    return 'terraced';
  }

  private async isConservationArea(postcode: string): Promise<boolean> {
    const conservationAreas = ['NW3', 'NW8', 'NW11'];
    const area = this.extractArea(postcode);
    return conservationAreas.includes(area);
  }

  private async getAveragePropertyValue(street: string): Promise<number> {
    const streetKey = street.toLowerCase();
    if (streetKey.includes('bishop') || streetKey.includes('hamilton')) {
      return 2500000; // Ultra-premium
    }
    if (streetKey.includes('hampstead') || streetKey.includes('st john')) {
      return 1500000; // Premium
    }
    return 750000; // Mid-market
  }

  private async getPropertyValueTrend(street: string): Promise<'rising' | 'stable' | 'falling'> {
    // Most NW London areas are rising or stable
    return Math.random() > 0.3 ? 'rising' : 'stable';
  }

  private extractArea(postcode: string): string {
    const match = postcode.match(/^([A-Z]{1,2}\d{1,2})/);
    return match ? match[1] : 'NW3';
  }

  /**
   * Get street-level heatmap data
   */
  async getStreetHeatmap(area: string): Promise<Map<string, number>> {
    const heatmap = new Map<string, number>();

    // In production, calculate from real data
    // Higher scores indicate more renovation/maintenance activity
    const streets = await this.getStreetsByArea(area);

    streets.forEach((street, index) => {
      heatmap.set(street, 50 + Math.floor(Math.random() * 50));
    });

    return heatmap;
  }

  /**
   * Get streets by area
   */
  private async getStreetsByArea(area: string): Promise<string[]> {
    const streetData = {
      'NW3': ['Hampstead High Street', 'Belsize Avenue', 'Finchley Road', 'Rosslyn Hill'],
      'NW8': ['Abbey Road', 'St John\'s Wood High Street', 'Grove End Road'],
      'NW11': ['Golders Green Road', 'Hampstead Way', 'The Bishop\'s Avenue'],
      'NW1': ['Camden High Street', 'Parkway', 'Kentish Town Road'],
      'NW5': ['Dartmouth Park Road', 'Highgate Road', 'Fortress Road'],
      'NW6': ['West End Lane', 'Kilburn High Road', 'Brondesbury Park']
    };

    return streetData[area as keyof typeof streetData] || [];
  }

  /**
   * Get seasonal demand forecast
   */
  async getSeasonalForecast(street: string, months: number = 12): Promise<any[]> {
    const forecast = [];
    const baselineScore = 70;

    for (let i = 0; i < months; i++) {
      const month = (new Date().getMonth() + i) % 12;
      const monthName = new Date(2025, month).toLocaleString('default', { month: 'long' });

      // Renovation peaks in spring/summer
      const renovationMultiplier = [0.7, 0.7, 0.9, 1.0, 1.2, 1.3, 1.3, 1.2, 1.0, 0.9, 0.8, 0.7][month];

      // Maintenance peaks in autumn/winter
      const maintenanceMultiplier = [1.3, 1.2, 1.0, 0.9, 0.8, 0.7, 0.7, 0.8, 0.9, 1.1, 1.2, 1.3][month];

      forecast.push({
        month: monthName,
        renovation: Math.floor(baselineScore * renovationMultiplier),
        maintenance: Math.floor(baselineScore * maintenanceMultiplier),
        emergency: Math.floor(baselineScore * maintenanceMultiplier * 0.3)
      });
    }

    return forecast;
  }
}

export default StreetAnalyticsService;
