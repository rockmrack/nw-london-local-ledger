import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

/**
 * Emergency Response Service for NW London
 * 24/7 emergency repair and response coordination
 */

export const EmergencyCallSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  customerName: z.string(),
  phone: z.string(),
  propertyAddress: z.string(),
  postcode: z.string().regex(/^NW\d{1,2}\s?\d[A-Z]{2}$/i),
  emergencyType: z.enum([
    'burst-pipe',
    'no-heating',
    'gas-leak',
    'electrical-failure',
    'roof-leak',
    'flood',
    'structural-damage',
    'broken-boiler',
    'blocked-drain',
    'no-water',
    'broken-window',
    'lockout',
    'fire-damage',
    'storm-damage',
    'other-emergency'
  ]),
  severity: z.enum(['critical', 'high', 'medium']),
  description: z.string(),
  safetyRisk: z.boolean(),
  peopleAffected: z.number().optional(),
  waterShutoffRequired: z.boolean().default(false),
  gasShutoffRequired: z.boolean().default(false),
  electricityShutoffRequired: z.boolean().default(false),
  status: z.enum([
    'received',
    'assessing',
    'contractor-dispatched',
    'contractor-en-route',
    'contractor-on-site',
    'emergency-controlled',
    'repair-in-progress',
    'completed',
    'follow-up-required'
  ]),
  receivedAt: z.string().datetime(),
  responseTime: z.number().optional(), // minutes
  arrivalTime: z.string().datetime().optional(),
  completionTime: z.string().datetime().optional(),
  assignedContractor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    trade: z.string(),
    phone: z.string(),
    eta: z.string().datetime(),
    currentLocation: z.object({
      lat: z.number(),
      lng: z.number()
    }).optional()
  }).optional(),
  actionsTaken: z.array(z.object({
    time: z.string().datetime(),
    action: z.string(),
    performedBy: z.string()
  })).optional(),
  estimatedCost: z.number().optional(),
  actualCost: z.number().optional(),
  photos: z.array(z.string()).optional(),
  followUpRequired: z.boolean(),
  followUpNotes: z.string().optional(),
  insuranceClaim: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type EmergencyCall = z.infer<typeof EmergencyCallSchema>;

export class EmergencyService {
  private db: Pool;
  private redis: Redis;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 600; // 10 minutes for emergency data

  // Target response times by area (minutes)
  private readonly TARGET_RESPONSE_TIMES = {
    'NW3': 25,  // Hampstead - priority
    'NW8': 25,  // St John's Wood - priority
    'NW11': 30, // Golders Green
    'NW1': 30,  // Camden
    'NW5': 35,  // Kentish Town
    'NW6': 30,  // West Hampstead
    'NW2': 40,  // Cricklewood
    'NW4': 40,  // Hendon
    'NW7': 45,  // Mill Hill
    'NW9': 45,  // Colindale
    'NW10': 40  // Willesden
  };

  // Emergency contractor network by trade and area
  private emergencyContractors = new Map<string, any[]>();

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
    this.initializeEmergencyNetwork();
  }

  /**
   * Report emergency - immediate response
   */
  async reportEmergency(emergency: {
    customerName: string;
    phone: string;
    propertyAddress: string;
    postcode: string;
    emergencyType: string;
    description: string;
    safetyRisk?: boolean;
  }): Promise<{
    success: boolean;
    callId: string;
    eta: string;
    contractorName: string;
    contractorPhone: string;
    instructions: string[];
  }> {
    try {
      const callId = crypto.randomUUID();
      const customerId = crypto.randomUUID();
      const area = emergency.postcode.match(/^([A-Z]{1,2}\d{1,2})/)?.[1] || 'NW3';

      // Determine severity
      const severity = this.assessSeverity(emergency.emergencyType, emergency.safetyRisk || false);

      // Get appropriate contractor
      const contractor = await this.dispatchEmergencyContractor(
        emergency.emergencyType,
        area,
        severity
      );

      // Create emergency call record
      const call: Partial<EmergencyCall> = {
        id: callId,
        customerId,
        customerName: emergency.customerName,
        phone: emergency.phone,
        propertyAddress: emergency.propertyAddress,
        postcode: emergency.postcode.toUpperCase(),
        emergencyType: emergency.emergencyType as any,
        severity,
        description: emergency.description,
        safetyRisk: emergency.safetyRisk || false,
        waterShutoffRequired: this.requiresWaterShutoff(emergency.emergencyType),
        gasShutoffRequired: this.requiresGasShutoff(emergency.emergencyType),
        electricityShutoffRequired: this.requiresElectricityShutoff(emergency.emergencyType),
        status: 'contractor-dispatched',
        receivedAt: new Date().toISOString(),
        assignedContractor: contractor,
        followUpRequired: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store emergency call
      await this.cacheEmergencyCall(callId, call);

      // Immediate notifications
      await this.notifyEmergencyTeam(call);
      await this.notifyContractor(contractor, call);
      await this.sendCustomerConfirmation(emergency.phone, callId, contractor);

      // Get safety instructions
      const instructions = this.getEmergencySafetyInstructions(emergency.emergencyType);

      const targetETA = this.TARGET_RESPONSE_TIMES[area as keyof typeof this.TARGET_RESPONSE_TIMES] || 45;

      return {
        success: true,
        callId,
        eta: `${targetETA} minutes`,
        contractorName: contractor.name,
        contractorPhone: contractor.phone,
        instructions
      };
    } catch (error) {
      console.error('Error reporting emergency:', error);
      throw new Error('Failed to report emergency');
    }
  }

  /**
   * Get emergency safety instructions
   */
  getEmergencySafetyInstructions(emergencyType: string): string[] {
    const instructions: Record<string, string[]> = {
      'burst-pipe': [
        'Turn off the water supply at the stopcock (usually under the kitchen sink or in the hallway)',
        'Turn off your central heating',
        'Turn on all taps to drain the system',
        'Move furniture and valuables away from the leak',
        'Put buckets or towels down to catch water',
        'Do NOT use electrical appliances near the leak'
      ],
      'gas-leak': [
        'DO NOT turn any electrical switches on or off',
        'DO NOT use mobile phones inside the property',
        'Open all doors and windows',
        'Turn off the gas supply at the meter if safe to do so',
        'Evacuate the property immediately',
        'Call National Gas Emergency Service: 0800 111 999',
        'Wait outside for our engineer'
      ],
      'no-heating': [
        'Check your boiler display for error codes',
        'Check if pilot light is on',
        'Check your thermostat batteries and settings',
        'Check for frozen condensate pipe (white plastic pipe outside)',
        'Keep one room warm with alternative heating if available',
        'Do NOT attempt boiler repairs yourself'
      ],
      'electrical-failure': [
        'Check your fuse box - look for tripped switches',
        'Unplug all appliances',
        'Do NOT touch any exposed wiring',
        'Do NOT use water near electrical faults',
        'Turn off power at the main switch if safe',
        'Use torches, NOT candles',
        'Wait for qualified electrician'
      ],
      'roof-leak': [
        'Place buckets under leaks',
        'Move valuables from affected areas',
        'DO NOT go on the roof yourself',
        'Check loft space if safe - place containers under leaks',
        'Turn off electricity to affected areas if water is dripping on lights/sockets',
        'Take photos for insurance'
      ],
      'flood': [
        'Turn off electricity at the mains if safe to do so',
        'Turn off gas supply',
        'Move to higher floors if necessary',
        'Do NOT walk through flood water if avoidable',
        'Move valuables upstairs',
        'Do NOT use electrical items that have been flooded',
        'Take photos for insurance'
      ],
      'lockout': [
        'Check all doors and windows (some may be unlocked)',
        'Call trusted neighbor or landlord who may have spare keys',
        'Check for key safe if you have one',
        'Do NOT attempt to break in yourself',
        'Wait in a safe location for locksmith',
        'Have ID ready to prove residence'
      ]
    };

    return instructions[emergencyType] || [
      'Stay calm',
      'Ensure everyone is safe',
      'Do not attempt repairs yourself',
      'Wait for qualified professional',
      'Take photos if safe to do so',
      'Contact your insurance if needed'
    ];
  }

  /**
   * Get live emergency call status
   */
  async getEmergencyStatus(callId: string): Promise<any> {
    const call = await this.getEmergencyCall(callId);
    if (!call) return null;

    const area = call.postcode?.match(/^([A-Z]{1,2}\d{1,2})/)?.[1] || 'NW3';
    const targetETA = this.TARGET_RESPONSE_TIMES[area as keyof typeof this.TARGET_RESPONSE_TIMES] || 45;

    return {
      callId: call.id,
      status: call.status,
      severity: call.severity,
      contractor: call.assignedContractor,
      estimatedArrival: call.assignedContractor?.eta,
      targetResponseTime: `${targetETA} minutes`,
      actionsTaken: call.actionsTaken || [],
      safetyInstructions: this.getEmergencySafetyInstructions(call.emergencyType || '')
    };
  }

  /**
   * Get emergency statistics by area
   */
  async getEmergencyStatsByArea(area: string): Promise<any> {
    const cacheKey = `emergency:stats:${area}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Mock statistics - in production, query real data
    const stats = {
      area,
      last30Days: {
        totalCalls: 45,
        averageResponseTime: 28,
        targetResponseTime: this.TARGET_RESPONSE_TIMES[area as keyof typeof this.TARGET_RESPONSE_TIMES] || 45,
        meetingTarget: 92, // percentage
        byType: {
          'burst-pipe': 12,
          'no-heating': 15,
          'electrical-failure': 8,
          'roof-leak': 5,
          'lockout': 3,
          'other': 2
        },
        bySeverity: {
          'critical': 8,
          'high': 22,
          'medium': 15
        }
      },
      peakTimes: {
        dayOfWeek: ['Monday', 'Tuesday', 'Sunday'], // Most common days
        hourOfDay: [8, 18, 22] // Most common hours
      },
      seasonalTrends: this.getSeasonalEmergencyTrends()
    };

    await this.redis.setex(cacheKey, this.CACHE_TTL * 6, JSON.stringify(stats));
    return stats;
  }

  /**
   * Get contractor availability for emergencies
   */
  async getEmergencyContractorAvailability(area: string): Promise<any[]> {
    const trades = ['plumber', 'electrician', 'locksmith', 'roofer', 'general'];
    const availability = [];

    for (const trade of trades) {
      const contractors = this.emergencyContractors.get(`${trade}:${area}`) || [];
      const available = contractors.filter(c => c.available);

      availability.push({
        trade,
        totalContractors: contractors.length,
        available: available.length,
        averageResponseTime: available.length > 0 ? 25 : 60,
        status: available.length > 2 ? 'good' : available.length > 0 ? 'limited' : 'calling-backup'
      });
    }

    return availability;
  }

  /**
   * Helper methods
   */
  private assessSeverity(type: string, safetyRisk: boolean): 'critical' | 'high' | 'medium' {
    if (safetyRisk) return 'critical';

    const criticalTypes = ['gas-leak', 'flood', 'fire-damage', 'structural-damage'];
    const highTypes = ['burst-pipe', 'electrical-failure', 'roof-leak', 'no-heating'];

    if (criticalTypes.includes(type)) return 'critical';
    if (highTypes.includes(type)) return 'high';
    return 'medium';
  }

  private async dispatchEmergencyContractor(type: string, area: string, severity: string) {
    // Map emergency type to trade
    const tradeMap: Record<string, string> = {
      'burst-pipe': 'plumber',
      'no-heating': 'plumber',
      'broken-boiler': 'plumber',
      'gas-leak': 'plumber',
      'blocked-drain': 'plumber',
      'no-water': 'plumber',
      'electrical-failure': 'electrician',
      'roof-leak': 'roofer',
      'storm-damage': 'roofer',
      'broken-window': 'glazier',
      'lockout': 'locksmith'
    };

    const trade = tradeMap[type] || 'general';
    const contractors = this.emergencyContractors.get(`${trade}:${area}`) || [];

    // Get first available contractor
    const available = contractors.find(c => c.available);

    if (available) {
      const eta = new Date(Date.now() + available.responseTime * 60 * 1000);
      return {
        id: available.id,
        name: available.name,
        trade: available.trade,
        phone: available.phone,
        eta: eta.toISOString(),
        currentLocation: available.location
      };
    }

    // Fallback contractor
    const fallbackETA = new Date(Date.now() + 45 * 60 * 1000);
    return {
      id: crypto.randomUUID(),
      name: 'On-call Emergency Engineer',
      trade: 'Multi-trade Emergency Specialist',
      phone: '07459 345456',
      eta: fallbackETA.toISOString()
    };
  }

  private requiresWaterShutoff(type: string): boolean {
    return ['burst-pipe', 'flood', 'no-water'].includes(type);
  }

  private requiresGasShutoff(type: string): boolean {
    return ['gas-leak', 'broken-boiler'].includes(type);
  }

  private requiresElectricityShutoff(type: string): boolean {
    return ['electrical-failure', 'flood'].includes(type);
  }

  private getSeasonalEmergencyTrends() {
    return {
      winter: { type: 'burst-pipe', increase: 250 },
      autumn: { type: 'roof-leak', increase: 180 },
      summer: { type: 'electrical-failure', increase: 120 },
      spring: { type: 'blocked-drain', increase: 140 }
    };
  }

  private async cacheEmergencyCall(id: string, call: any): Promise<void> {
    await this.redis.setex(`emergency:${id}`, this.CACHE_TTL * 6, JSON.stringify(call));
    this.cache.set(id, call);
  }

  private async getEmergencyCall(id: string): Promise<Partial<EmergencyCall> | null> {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const redisData = await this.redis.get(`emergency:${id}`);
    if (redisData) {
      const call = JSON.parse(redisData);
      this.cache.set(id, call);
      return call;
    }

    return null;
  }

  private async notifyEmergencyTeam(call: any): Promise<void> {
    console.log(`[EMERGENCY ALERT] ${call.severity.toUpperCase()} - ${call.emergencyType} at ${call.propertyAddress}`);
  }

  private async notifyContractor(contractor: any, call: any): Promise<void> {
    console.log(`[CONTRACTOR DISPATCH] ${contractor.name} dispatched to ${call.propertyAddress}`);
  }

  private async sendCustomerConfirmation(phone: string, callId: string, contractor: any): Promise<void> {
    console.log(`[CUSTOMER SMS] Emergency response dispatched. ${contractor.name} will arrive shortly.`);
  }

  private initializeEmergencyNetwork(): void {
    // Initialize mock emergency contractor network
    // In production, this would load from database
    const areas = ['NW1', 'NW2', 'NW3', 'NW4', 'NW5', 'NW6', 'NW7', 'NW8', 'NW9', 'NW10', 'NW11'];
    const trades = ['plumber', 'electrician', 'locksmith', 'roofer', 'general'];

    areas.forEach(area => {
      trades.forEach(trade => {
        this.emergencyContractors.set(`${trade}:${area}`, [
          {
            id: crypto.randomUUID(),
            name: `Emergency ${trade.charAt(0).toUpperCase() + trade.slice(1)} ${area}`,
            trade: trade,
            phone: '07700 900' + Math.floor(Math.random() * 1000),
            available: true,
            responseTime: Math.floor(Math.random() * 20) + 20, // 20-40 minutes
            location: { lat: 51.5 + Math.random() * 0.1, lng: -0.2 + Math.random() * 0.1 }
          }
        ]);
      });
    });
  }
}

export default EmergencyService;
