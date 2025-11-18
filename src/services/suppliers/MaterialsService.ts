import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Materials & Suppliers Service for NW London
 * Manages building materials sourcing, pricing, and supplier relationships
 */

export const MaterialSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.enum([
    'timber',
    'bricks-blocks',
    'cement-aggregates',
    'plumbing-fixtures',
    'electrical-fixtures',
    'tiles',
    'flooring',
    'paint-decorating',
    'roofing',
    'windows-doors',
    'kitchen-units',
    'bathroom-fixtures',
    'insulation',
    'plasterboard',
    'hardware',
    'tools',
    'safety-equipment'
  ]),
  description: z.string(),
  specifications: z.record(z.string()),
  unit: z.string(),
  priceRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string()
  }),
  availability: z.enum(['in-stock', 'low-stock', 'out-of-stock', 'pre-order']),
  leadTime: z.object({
    min: z.number(),
    max: z.number(),
    unit: z.enum(['hours', 'days', 'weeks'])
  }),
  suppliers: z.array(z.string().uuid()),
  popularityScore: z.number(),
  environmentalRating: z.string().optional(),
  certifications: z.array(z.string()).optional()
});

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['builders-merchant', 'specialist', 'manufacturer', 'online', 'trade-counter']),
  location: z.object({
    address: z.string(),
    postcode: z.string(),
    area: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number()
    }).optional()
  }),
  contact: z.object({
    phone: z.string(),
    email: z.string().email(),
    website: z.string().url().optional()
  }),
  openingHours: z.record(z.string()),
  categories: z.array(z.string()),
  services: z.array(z.enum([
    'delivery',
    'collection',
    'cutting-service',
    'bulk-discount',
    'trade-account',
    'hire-tools',
    'technical-advice',
    'same-day-delivery',
    'next-day-delivery',
    'price-match',
    'free-delivery-threshold'
  ])),
  rating: z.object({
    overall: z.number().min(0).max(5),
    totalReviews: z.number(),
    price: z.number().min(0).max(5),
    quality: z.number().min(0).max(5),
    service: z.number().min(0).max(5),
    delivery: z.number().min(0).max(5)
  }),
  deliveryInfo: z.object({
    freeDeliveryThreshold: z.number().optional(),
    deliveryFee: z.number(),
    deliveryAreas: z.array(z.string()),
    sameDayAvailable: z.boolean(),
    nextDayAvailable: z.boolean()
  }),
  tradeDiscount: z.object({
    available: z.boolean(),
    percentage: z.number().optional(),
    requirements: z.string().optional()
  }),
  featured: z.boolean(),
  verified: z.boolean()
});

export type Material = z.infer<typeof MaterialSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;

export class MaterialsService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 3600;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
  }

  /**
   * Find suppliers by category and location
   */
  async findSuppliers(category: string, area: string): Promise<Supplier[]> {
    const cacheKey = `suppliers:${category}:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const suppliers = this.getMockSuppliers(area);
    const filtered = suppliers.filter(s =>
      s.categories.some(c => c.toLowerCase().includes(category.toLowerCase()))
    );

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(filtered));
    return filtered;
  }

  /**
   * Get material pricing from multiple suppliers
   */
  async getMaterialPricing(materialId: string): Promise<any[]> {
    const cacheKey = `material:pricing:${materialId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Mock pricing from different suppliers
    const pricing = [
      {
        supplierId: crypto.randomUUID(),
        supplierName: 'Travis Perkins - Cricklewood',
        price: 45.50,
        unit: 'per sheet',
        availability: 'in-stock',
        delivery: 'Next day - £15',
        tradePrice: 38.50
      },
      {
        supplierId: crypto.randomUUID(),
        supplierName: 'Jewson - West Hampstead',
        price: 47.00,
        unit: 'per sheet',
        availability: 'in-stock',
        delivery: 'Same day - £20',
        tradePrice: 40.00
      },
      {
        supplierId: crypto.randomUUID(),
        supplierName: 'Selco - Willesden',
        price: 42.00,
        unit: 'per sheet',
        availability: 'in-stock',
        delivery: 'Collection only',
        tradePrice: 36.50
      }
    ];

    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(pricing));
    return pricing;
  }

  /**
   * Get popular materials for project type
   */
  async getPopularMaterials(projectType: string): Promise<Material[]> {
    const materialsByProject: Record<string, any[]> = {
      'kitchen-renovation': [
        { name: 'Kitchen Cabinet Units', category: 'kitchen-units', avgPrice: 450 },
        { name: 'Quartz Worktop', category: 'kitchen-units', avgPrice: 180 },
        { name: 'Kitchen Tiles', category: 'tiles', avgPrice: 35 },
        { name: 'Kitchen Sink & Tap', category: 'plumbing-fixtures', avgPrice: 250 }
      ],
      'bathroom-renovation': [
        { name: 'Bath', category: 'bathroom-fixtures', avgPrice: 350 },
        { name: 'Bathroom Suite', category: 'bathroom-fixtures', avgPrice: 800 },
        { name: 'Bathroom Tiles', category: 'tiles', avgPrice: 40 },
        { name: 'Shower Enclosure', category: 'bathroom-fixtures', avgPrice: 450 }
      ],
      'extension': [
        { name: 'Bricks', category: 'bricks-blocks', avgPrice: 450 },
        { name: 'Concrete Blocks', category: 'bricks-blocks', avgPrice: 280 },
        { name: 'Cement', category: 'cement-aggregates', avgPrice: 8 },
        { name: 'Timber Joists', category: 'timber', avgPrice: 45 }
      ]
    };

    return materialsByProject[projectType] || [];
  }

  /**
   * Calculate materials cost estimate
   */
  async estimateMaterialsCost(projectType: string, scope: {
    area?: number;
    rooms?: number;
    quality?: 'budget' | 'mid-range' | 'premium' | 'luxury';
  }): Promise<{
    total: number;
    breakdown: any[];
    savings: number;
  }> {
    const quality = scope.quality || 'mid-range';
    const multipliers = {
      'budget': 0.7,
      'mid-range': 1.0,
      'premium': 1.5,
      'luxury': 2.5
    };

    const baseCosts: Record<string, number> = {
      'kitchen-renovation': 8000,
      'bathroom-renovation': 4000,
      'extension': 15000,
      'loft-conversion': 12000,
      'full-renovation': 25000
    };

    const baseCost = baseCosts[projectType] || 5000;
    const adjustedCost = baseCost * multipliers[quality];

    const breakdown = [
      {
        category: 'Structural Materials',
        cost: adjustedCost * 0.3,
        items: ['Bricks', 'Cement', 'Timber', 'Insulation']
      },
      {
        category: 'Fixtures & Fittings',
        cost: adjustedCost * 0.35,
        items: ['Doors', 'Windows', 'Plumbing fixtures', 'Electrical fixtures']
      },
      {
        category: 'Finishing Materials',
        cost: adjustedCost * 0.25,
        items: ['Paint', 'Tiles', 'Flooring', 'Decorative items']
      },
      {
        category: 'Tools & Consumables',
        cost: adjustedCost * 0.1,
        items: ['Adhesives', 'Screws', 'Sealants', 'Small tools']
      }
    ];

    // Calculate trade discount savings
    const retailTotal = breakdown.reduce((sum, item) => sum + item.cost, 0);
    const tradeSavings = retailTotal * 0.15; // 15% average trade discount

    return {
      total: retailTotal - tradeSavings,
      breakdown,
      savings: tradeSavings
    };
  }

  /**
   * Get nearest suppliers by location
   */
  async getNearestSuppliers(postcode: string, limit: number = 5): Promise<Supplier[]> {
    const area = postcode.match(/^([A-Z]{1,2}\d{1,2})/)?.[1] || 'NW3';
    const suppliers = this.getMockSuppliers(area);

    // In production, calculate actual distances
    return suppliers.slice(0, limit);
  }

  /**
   * Get trade account benefits
   */
  async getTradeAccountBenefits(supplierId: string): Promise<any> {
    return {
      supplierId,
      benefits: [
        { type: 'Discount', value: '15-20% off retail prices' },
        { type: 'Credit', value: '30-day payment terms' },
        { type: 'Priority Service', value: 'Dedicated account manager' },
        { type: 'Free Delivery', value: 'On orders over £100' },
        { type: 'Loyalty Points', value: '1 point per £1 spent' },
        { type: 'Price Lock', value: 'Lock prices for 90 days' }
      ],
      requirements: [
        'Proof of trade (UTR number or company details)',
        'Two trade references',
        'Public liability insurance certificate'
      ],
      applicationTime: '2-3 working days'
    };
  }

  /**
   * Get delivery options for order
   */
  async getDeliveryOptions(supplierId: string, postcode: string, orderValue: number): Promise<any[]> {
    const options = [];

    if (orderValue > 100) {
      options.push({
        type: 'Standard Delivery',
        timeframe: 'Next working day',
        cost: 0,
        notes: 'Free delivery on orders over £100'
      });
    } else {
      options.push({
        type: 'Standard Delivery',
        timeframe: 'Next working day',
        cost: 15,
        notes: 'Delivery to kerbside'
      });
    }

    options.push({
      type: 'Same Day Delivery',
      timeframe: 'Within 4 hours',
      cost: 25,
      notes: 'Order before 2pm'
    });

    options.push({
      type: 'Collection',
      timeframe: 'Available now',
      cost: 0,
      notes: 'Collect from branch'
    });

    return options;
  }

  /**
   * Mock suppliers data
   */
  private getMockSuppliers(area: string): Supplier[] {
    return [
      {
        id: crypto.randomUUID(),
        name: 'Travis Perkins Cricklewood',
        type: 'builders-merchant',
        location: {
          address: '425-429 Cricklewood Broadway',
          postcode: 'NW2 6LR',
          area: 'NW2',
          coordinates: { lat: 51.5555, lng: -0.2140 }
        },
        contact: {
          phone: '020 8450 9100',
          email: 'cricklewood@travisperkins.co.uk',
          website: 'https://www.travisperkins.co.uk'
        },
        openingHours: {
          'monday-friday': '7:00 AM - 5:00 PM',
          'saturday': '7:00 AM - 12:00 PM',
          'sunday': 'Closed'
        },
        categories: ['General building', 'Timber', 'Plumbing', 'Electrical', 'Tools'],
        services: ['delivery', 'collection', 'cutting-service', 'trade-account', 'bulk-discount', 'next-day-delivery'],
        rating: {
          overall: 4.3,
          totalReviews: 428,
          price: 4.2,
          quality: 4.4,
          service: 4.1,
          delivery: 4.3
        },
        deliveryInfo: {
          freeDeliveryThreshold: 100,
          deliveryFee: 15,
          deliveryAreas: ['NW1', 'NW2', 'NW3', 'NW6', 'NW10'],
          sameDayAvailable: false,
          nextDayAvailable: true
        },
        tradeDiscount: {
          available: true,
          percentage: 15,
          requirements: 'Trade account required'
        },
        featured: true,
        verified: true
      },
      {
        id: crypto.randomUUID(),
        name: 'Jewson West Hampstead',
        type: 'builders-merchant',
        location: {
          address: '156-158 West End Lane',
          postcode: 'NW6 1SD',
          area: 'NW6',
          coordinates: { lat: 51.5476, lng: -0.1929 }
        },
        contact: {
          phone: '020 7435 7281',
          email: 'westhampstead@jewson.co.uk',
          website: 'https://www.jewson.co.uk'
        },
        openingHours: {
          'monday-friday': '7:30 AM - 5:00 PM',
          'saturday': '8:00 AM - 12:00 PM',
          'sunday': 'Closed'
        },
        categories: ['General building', 'Aggregates', 'Roofing', 'Plumbing', 'Joinery'],
        services: ['delivery', 'collection', 'trade-account', 'technical-advice', 'same-day-delivery'],
        rating: {
          overall: 4.5,
          totalReviews: 312,
          price: 4.3,
          quality: 4.6,
          service: 4.5,
          delivery: 4.6
        },
        deliveryInfo: {
          freeDeliveryThreshold: 150,
          deliveryFee: 20,
          deliveryAreas: ['NW3', 'NW6', 'NW8'],
          sameDayAvailable: true,
          nextDayAvailable: true
        },
        tradeDiscount: {
          available: true,
          percentage: 18,
          requirements: 'Trade account with references'
        },
        featured: true,
        verified: true
      }
    ];
  }
}

export default MaterialsService;
