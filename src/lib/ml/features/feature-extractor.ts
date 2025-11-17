/**
 * Feature Extraction for ML Predictive Caching
 * Extracts behavioral and contextual features for model training and inference
 */

export interface UserBehaviorFeatures {
  // Temporal features
  hourOfDay: number;
  dayOfWeek: number;
  weekOfMonth: number;
  monthOfYear: number;
  isWeekend: boolean;
  isPeakHour: boolean;
  timeOfDayBucket: 'morning' | 'afternoon' | 'evening' | 'night';

  // Session features
  sessionDuration: number;
  pageViewCount: number;
  avgPageViewTime: number;
  bounceRate: number;
  sessionDepth: number;

  // Navigation patterns
  currentPath: string;
  previousPath: string;
  referrer: string;
  entryPoint: string;
  navigationSpeed: number; // pages per minute
  backButtonUsage: number;

  // User segment features
  userSegment: 'buyer' | 'seller' | 'researcher' | 'investor' | 'agent' | 'unknown';
  userType: 'new' | 'returning' | 'frequent';
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browserType: string;
  connectionSpeed: 'slow' | 'medium' | 'fast';

  // Geographic features
  council: string;
  councilGroup: 'inner' | 'outer';
  postcode: string;
  postcodePrefix: string;
  distanceFromCenter: number;

  // Property features
  propertyType: string;
  priceRange: string;
  bedroomCount: number;
  propertyAge: string;
  searchRadius: number;

  // Interaction features
  searchQueries: string[];
  filtersApplied: Record<string, any>;
  sortPreference: string;
  viewedListings: string[];
  favoriteListings: string[];

  // Content features
  pageType: 'search' | 'detail' | 'council' | 'comparison' | 'statistics';
  contentLength: number;
  mediaViewed: boolean;
  documentsAccessed: boolean;
  mapsInteraction: boolean;

  // Historical patterns
  avgSessionsPerWeek: number;
  preferredTimeOfDay: string;
  typicalSessionLength: number;
  conversionRate: number;
  engagementScore: number;
}

export interface PageTransitionFeatures {
  fromPage: string;
  toPage: string;
  transitionType: 'navigation' | 'search' | 'filter' | 'detail' | 'back';
  transitionTime: number;
  scrollDepth: number;
  clickPosition: { x: number; y: number };
  linkType: 'internal' | 'external' | 'action';
}

export interface CachePerformanceFeatures {
  cacheHitRate: number;
  avgLoadTime: number;
  cacheSizeUsed: number;
  ttlRemaining: number;
  accessFrequency: number;
  lastAccessTime: number;
  dataFreshness: number;
}

export class FeatureExtractor {
  private featureCache = new Map<string, Float32Array>();
  private readonly featureVersion = '1.0.0';

  /**
   * Extract features from user session data
   */
  extractUserFeatures(
    sessionData: any,
    historicalData?: any
  ): Float32Array {
    const features: number[] = [];

    // Extract temporal features
    const now = new Date();
    features.push(
      now.getHours() / 23, // Normalize to [0,1]
      now.getDay() / 6,
      Math.floor(now.getDate() / 7) / 4,
      now.getMonth() / 11,
      now.getDay() === 0 || now.getDay() === 6 ? 1 : 0,
      this.isPeakHour(now.getHours()) ? 1 : 0,
      this.getTimeOfDayBucket(now.getHours())
    );

    // Extract session features
    features.push(
      Math.min(sessionData.duration / 3600000, 1), // Cap at 1 hour
      Math.min(sessionData.pageViews / 50, 1), // Cap at 50 pages
      Math.min(sessionData.avgPageTime / 300000, 1), // Cap at 5 minutes
      sessionData.bounceRate || 0,
      Math.min(sessionData.depth / 10, 1) // Cap at depth 10
    );

    // Extract navigation features
    features.push(
      ...this.encodePathFeatures(sessionData.currentPath),
      ...this.encodePathFeatures(sessionData.previousPath || ''),
      Math.min(sessionData.navigationSpeed / 10, 1)
    );

    // Extract user segment features
    features.push(
      ...this.encodeUserSegment(sessionData.userSegment),
      ...this.encodeDeviceType(sessionData.deviceType),
      this.encodeConnectionSpeed(sessionData.connectionSpeed)
    );

    // Extract geographic features
    features.push(
      ...this.encodeCouncil(sessionData.council),
      sessionData.councilGroup === 'inner' ? 1 : 0,
      Math.min(sessionData.distanceFromCenter / 50, 1) // Cap at 50km
    );

    // Extract property features
    features.push(
      ...this.encodePropertyType(sessionData.propertyType),
      ...this.encodePriceRange(sessionData.priceRange),
      Math.min((sessionData.bedroomCount || 0) / 10, 1),
      Math.min(sessionData.searchRadius / 20, 1)
    );

    // Extract interaction features
    features.push(
      Math.min(sessionData.searchCount / 20, 1),
      Math.min(sessionData.filterCount / 10, 1),
      Math.min(sessionData.viewedListings?.length / 30, 1) || 0,
      Math.min(sessionData.favoriteListings?.length / 10, 1) || 0
    );

    // Extract content features
    features.push(
      ...this.encodePageType(sessionData.pageType),
      sessionData.mediaViewed ? 1 : 0,
      sessionData.documentsAccessed ? 1 : 0,
      sessionData.mapsInteraction ? 1 : 0
    );

    // Extract historical patterns if available
    if (historicalData) {
      features.push(
        Math.min(historicalData.avgSessionsPerWeek / 10, 1),
        Math.min(historicalData.typicalSessionLength / 1800000, 1), // 30 min
        historicalData.conversionRate || 0,
        Math.min(historicalData.engagementScore / 100, 1)
      );
    } else {
      features.push(0, 0, 0, 0); // Default values
    }

    return new Float32Array(features);
  }

  /**
   * Extract features for page transition prediction
   */
  extractTransitionFeatures(
    fromPage: string,
    sessionContext: any
  ): Float32Array {
    const features: number[] = [];

    // Encode current page
    features.push(...this.encodePathFeatures(fromPage));

    // Add session context
    features.push(
      Math.min(sessionContext.timeOnPage / 60000, 1), // Cap at 1 minute
      sessionContext.scrollDepth || 0,
      sessionContext.clickCount / 10 || 0,
      sessionContext.hoveredElements / 20 || 0
    );

    // Add temporal context
    const now = new Date();
    features.push(
      now.getHours() / 23,
      now.getDay() / 6,
      this.isPeakHour(now.getHours()) ? 1 : 0
    );

    // Add user context
    features.push(
      ...this.encodeUserSegment(sessionContext.userSegment),
      Math.min(sessionContext.sessionDepth / 10, 1),
      Math.min(sessionContext.sessionDuration / 1800000, 1)
    );

    // Add performance context
    features.push(
      sessionContext.cacheHitRate || 0,
      Math.min(sessionContext.avgLoadTime / 5000, 1), // Cap at 5 seconds
      sessionContext.bandwidth === 'fast' ? 1 : sessionContext.bandwidth === 'medium' ? 0.5 : 0
    );

    return new Float32Array(features);
  }

  /**
   * Extract cache optimization features
   */
  extractCacheFeatures(
    resource: string,
    accessPatterns: any
  ): Float32Array {
    const features: number[] = [];

    // Resource characteristics
    features.push(
      ...this.encodeResourceType(resource),
      this.getResourceSize(resource),
      this.getResourceComplexity(resource)
    );

    // Access patterns
    features.push(
      Math.min(accessPatterns.frequency / 100, 1),
      Math.min(accessPatterns.recency / 86400000, 1), // Days since last access
      accessPatterns.regularityScore || 0,
      accessPatterns.peakAccessTime / 23 || 0
    );

    // Temporal patterns
    const now = new Date();
    features.push(
      now.getHours() / 23,
      now.getDay() / 6,
      Math.floor(now.getDate() / 7) / 4,
      this.isPeakHour(now.getHours()) ? 1 : 0
    );

    // User segment distribution
    features.push(
      accessPatterns.buyerAccess || 0,
      accessPatterns.sellerAccess || 0,
      accessPatterns.researcherAccess || 0,
      accessPatterns.investorAccess || 0
    );

    // Geographic distribution
    features.push(
      ...this.encodeCouncilDistribution(accessPatterns.councilDistribution)
    );

    // Performance metrics
    features.push(
      accessPatterns.avgLoadTime / 5000 || 0,
      accessPatterns.cacheHitRate || 0,
      accessPatterns.errorRate || 0,
      accessPatterns.ttlEfficiency || 0
    );

    return new Float32Array(features);
  }

  /**
   * Create feature vectors for batch processing
   */
  createBatchFeatures(
    samples: any[],
    featureType: 'user' | 'transition' | 'cache'
  ): Float32Array {
    const batchFeatures: Float32Array[] = [];

    for (const sample of samples) {
      let features: Float32Array;

      switch (featureType) {
        case 'user':
          features = this.extractUserFeatures(sample.session, sample.historical);
          break;
        case 'transition':
          features = this.extractTransitionFeatures(sample.fromPage, sample.context);
          break;
        case 'cache':
          features = this.extractCacheFeatures(sample.resource, sample.patterns);
          break;
      }

      batchFeatures.push(features);
    }

    // Flatten batch features
    const totalLength = batchFeatures.reduce((acc, f) => acc + f.length, 0);
    const flatBatch = new Float32Array(totalLength);
    let offset = 0;

    for (const features of batchFeatures) {
      flatBatch.set(features, offset);
      offset += features.length;
    }

    return flatBatch;
  }

  // Helper methods

  private isPeakHour(hour: number): boolean {
    return (hour >= 9 && hour <= 11) || (hour >= 19 && hour <= 22);
  }

  private getTimeOfDayBucket(hour: number): number {
    if (hour >= 6 && hour < 12) return 0; // morning
    if (hour >= 12 && hour < 17) return 0.33; // afternoon
    if (hour >= 17 && hour < 22) return 0.67; // evening
    return 1; // night
  }

  private encodePathFeatures(path: string): number[] {
    const features = new Array(10).fill(0);

    if (!path) return features;

    // Extract path components
    const parts = path.split('/').filter(Boolean);

    // Encode path depth
    features[0] = Math.min(parts.length / 5, 1);

    // Encode page type
    if (path.includes('search')) features[1] = 1;
    if (path.includes('property')) features[2] = 1;
    if (path.includes('council')) features[3] = 1;
    if (path.includes('statistics')) features[4] = 1;
    if (path.includes('compare')) features[5] = 1;

    // Encode path complexity
    features[6] = Math.min(path.length / 100, 1);

    // Encode query parameters
    const queryStart = path.indexOf('?');
    if (queryStart > -1) {
      const params = path.slice(queryStart + 1).split('&');
      features[7] = Math.min(params.length / 10, 1);
    }

    return features;
  }

  private encodeUserSegment(segment: string): number[] {
    const segments = ['buyer', 'seller', 'researcher', 'investor', 'agent'];
    const encoding = new Array(segments.length).fill(0);
    const idx = segments.indexOf(segment);
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodeDeviceType(device: string): number[] {
    const devices = ['mobile', 'tablet', 'desktop'];
    const encoding = new Array(devices.length).fill(0);
    const idx = devices.indexOf(device);
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodeConnectionSpeed(speed: string): number {
    switch (speed) {
      case 'fast': return 1;
      case 'medium': return 0.5;
      case 'slow': return 0;
      default: return 0.5;
    }
  }

  private encodeCouncil(council: string): number[] {
    const councils = ['barnet', 'brent', 'camden', 'ealing', 'hackney', 'hammersmith',
                     'haringey', 'harrow', 'islington', 'westminster'];
    const encoding = new Array(councils.length).fill(0);
    const idx = councils.findIndex(c => council?.toLowerCase().includes(c));
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodePropertyType(type: string): number[] {
    const types = ['house', 'flat', 'apartment', 'studio', 'maisonette', 'bungalow'];
    const encoding = new Array(types.length).fill(0);
    const idx = types.findIndex(t => type?.toLowerCase().includes(t));
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodePriceRange(range: string): number[] {
    const ranges = ['0-500k', '500k-1m', '1m-2m', '2m-5m', '5m+'];
    const encoding = new Array(ranges.length).fill(0);
    const idx = ranges.indexOf(range);
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodePageType(type: string): number[] {
    const types = ['search', 'detail', 'council', 'comparison', 'statistics'];
    const encoding = new Array(types.length).fill(0);
    const idx = types.indexOf(type);
    if (idx >= 0) encoding[idx] = 1;
    return encoding;
  }

  private encodeResourceType(resource: string): number[] {
    const features = new Array(5).fill(0);

    if (resource.includes('/api/')) features[0] = 1;
    if (resource.includes('/property/')) features[1] = 1;
    if (resource.includes('/council/')) features[2] = 1;
    if (resource.includes('/search/')) features[3] = 1;
    if (resource.includes('/statistics/')) features[4] = 1;

    return features;
  }

  private getResourceSize(resource: string): number {
    // Estimate resource size based on type
    if (resource.includes('/api/properties')) return 0.8;
    if (resource.includes('/api/councils')) return 0.5;
    if (resource.includes('/api/statistics')) return 0.7;
    if (resource.includes('/api/search')) return 0.6;
    return 0.3;
  }

  private getResourceComplexity(resource: string): number {
    // Estimate computation complexity
    const params = resource.split('?')[1]?.split('&').length || 0;
    return Math.min(params / 10, 1);
  }

  private encodeCouncilDistribution(distribution: Record<string, number>): number[] {
    const councils = ['barnet', 'brent', 'camden', 'ealing', 'hackney', 'hammersmith',
                     'haringey', 'harrow', 'islington', 'westminster'];
    const total = Object.values(distribution || {}).reduce((a, b) => a + b, 0) || 1;

    return councils.map(council => (distribution?.[council] || 0) / total);
  }

  /**
   * Normalize features for model input
   */
  normalizeFeatures(features: Float32Array): Float32Array {
    // Apply feature normalization (already done in extraction)
    return features;
  }

  /**
   * Get feature importance scores
   */
  getFeatureImportance(): Record<string, number> {
    return {
      'temporal.hourOfDay': 0.85,
      'temporal.dayOfWeek': 0.72,
      'session.pageViewCount': 0.91,
      'session.sessionDuration': 0.88,
      'navigation.currentPath': 0.95,
      'navigation.previousPath': 0.93,
      'user.segment': 0.87,
      'user.deviceType': 0.65,
      'geographic.council': 0.78,
      'property.type': 0.82,
      'property.priceRange': 0.79,
      'interaction.searchQueries': 0.90,
      'content.pageType': 0.94,
      'historical.engagementScore': 0.89,
    };
  }
}

export const featureExtractor = new FeatureExtractor();