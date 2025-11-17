/**
 * Cache Tags System
 * Provides standardized tagging for cache entries to enable granular invalidation
 */

export class CacheTags {
  // Property-related tags
  static property(propertyId: string): string {
    return `property:${propertyId}`;
  }

  static propertyArea(area: string): string {
    return `property:area:${area.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static propertyCouncil(council: string): string {
    return `property:council:${council.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static propertyPostcode(postcode: string): string {
    const normalized = postcode.toUpperCase().replace(/\s+/g, '');
    return `property:postcode:${normalized}`;
  }

  static propertyType(type: string): string {
    return `property:type:${type.toLowerCase()}`;
  }

  // Planning-related tags
  static planning(applicationId: string): string {
    return `planning:${applicationId}`;
  }

  static planningArea(area: string): string {
    return `planning:area:${area.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static planningCouncil(council: string): string {
    return `planning:council:${council.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static planningStatus(status: string): string {
    return `planning:status:${status.toLowerCase()}`;
  }

  static planningYear(year: number): string {
    return `planning:year:${year}`;
  }

  // School-related tags
  static school(schoolId: string): string {
    return `school:${schoolId}`;
  }

  static schoolArea(area: string): string {
    return `school:area:${area.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static schoolType(type: string): string {
    return `school:type:${type.toLowerCase()}`;
  }

  static schoolRating(rating: string): string {
    return `school:rating:${rating.toLowerCase()}`;
  }

  // Transport-related tags
  static transportStation(stationId: string): string {
    return `transport:station:${stationId}`;
  }

  static transportLine(line: string): string {
    return `transport:line:${line.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static transportZone(zone: number): string {
    return `transport:zone:${zone}`;
  }

  // Demographics-related tags
  static demographics(area: string): string {
    return `demographics:${area.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static demographicsCouncil(council: string): string {
    return `demographics:council:${council.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Crime-related tags
  static crime(area: string): string {
    return `crime:${area.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static crimeCategory(category: string): string {
    return `crime:category:${category.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static crimeDate(date: string): string {
    return `crime:date:${date}`;
  }

  // Council Tax tags
  static councilTax(council: string): string {
    return `tax:council:${council.toLowerCase().replace(/\s+/g, '-')}`;
  }

  static councilTaxBand(band: string): string {
    return `tax:band:${band.toUpperCase()}`;
  }

  // Search-related tags
  static search(query: string): string {
    const normalized = query.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `search:${normalized}`;
  }

  static searchType(type: string): string {
    return `search:type:${type.toLowerCase()}`;
  }

  // API response tags
  static apiEndpoint(endpoint: string): string {
    const normalized = endpoint.replace(/\//g, ':').replace(/[{}]/g, '');
    return `api${normalized}`;
  }

  static apiUser(userId: string): string {
    return `api:user:${userId}`;
  }

  // Time-based tags for easy expiration
  static hourly(hour: number): string {
    return `time:hour:${hour}`;
  }

  static daily(date: string): string {
    return `time:day:${date}`;
  }

  static weekly(week: number, year: number): string {
    return `time:week:${year}-${week}`;
  }

  static monthly(month: number, year: number): string {
    return `time:month:${year}-${month.toString().padStart(2, '0')}`;
  }

  // Combine multiple tags for an entity
  static forProperty(property: {
    id: string;
    area?: string;
    council?: string;
    postcode?: string;
    type?: string;
  }): string[] {
    const tags = [this.property(property.id)];

    if (property.area) {
      tags.push(this.propertyArea(property.area));
    }
    if (property.council) {
      tags.push(this.propertyCouncil(property.council));
    }
    if (property.postcode) {
      tags.push(this.propertyPostcode(property.postcode));
    }
    if (property.type) {
      tags.push(this.propertyType(property.type));
    }

    return tags;
  }

  static forPlanning(planning: {
    id: string;
    area?: string;
    council?: string;
    status?: string;
    year?: number;
  }): string[] {
    const tags = [this.planning(planning.id)];

    if (planning.area) {
      tags.push(this.planningArea(planning.area));
    }
    if (planning.council) {
      tags.push(this.planningCouncil(planning.council));
    }
    if (planning.status) {
      tags.push(this.planningStatus(planning.status));
    }
    if (planning.year) {
      tags.push(this.planningYear(planning.year));
    }

    return tags;
  }

  static forSchool(school: {
    id: string;
    area?: string;
    type?: string;
    rating?: string;
  }): string[] {
    const tags = [this.school(school.id)];

    if (school.area) {
      tags.push(this.schoolArea(school.area));
    }
    if (school.type) {
      tags.push(this.schoolType(school.type));
    }
    if (school.rating) {
      tags.push(this.schoolRating(school.rating));
    }

    return tags;
  }

  // Generate time-based tags for current time
  static currentTimeTags(): string[] {
    const now = new Date();
    const tags = [];

    tags.push(this.hourly(now.getHours()));
    tags.push(this.daily(now.toISOString().split('T')[0]));

    // Calculate week number
    const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
    const daysSinceFirstDay = Math.floor(
      (now.getTime() - firstDayOfYear.getTime()) / (24 * 60 * 60 * 1000)
    );
    const weekNumber = Math.ceil((daysSinceFirstDay + firstDayOfYear.getDay() + 1) / 7);
    tags.push(this.weekly(weekNumber, now.getFullYear()));

    tags.push(this.monthly(now.getMonth() + 1, now.getFullYear()));

    return tags;
  }

  // Parse tags from a cache key
  static parseFromKey(key: string): string[] {
    const tags: string[] = [];

    // Extract common patterns
    const patterns = [
      /property[:/]([^:/]+)/,
      /planning[:/]([^:/]+)/,
      /school[:/]([^:/]+)/,
      /api[:/]([^:/]+)/,
      /council[:/]([^:/]+)/,
      /area[:/]([^:/]+)/,
      /postcode[:/]([A-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = key.match(pattern);
      if (match) {
        tags.push(match[0].replace('/', ':'));
      }
    }

    return tags;
  }
}

// Cache invalidation strategies
export class CacheInvalidation {
  /**
   * Invalidate all property-related caches for an area
   */
  static async invalidatePropertyArea(
    area: string,
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    const tag = CacheTags.propertyArea(area);
    return await cache.deleteByTag(tag);
  }

  /**
   * Invalidate all planning-related caches for a council
   */
  static async invalidatePlanningCouncil(
    council: string,
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    const tag = CacheTags.planningCouncil(council);
    return await cache.deleteByTag(tag);
  }

  /**
   * Invalidate all school-related caches
   */
  static async invalidateSchoolData(
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    let total = 0;
    // Invalidate by common school tags
    const tags = ['school:', 'school:area:', 'school:type:', 'school:rating:'];
    for (const tagPrefix of tags) {
      total += await cache.deleteByTag(tagPrefix + '*');
    }
    return total;
  }

  /**
   * Invalidate all caches for a specific postcode
   */
  static async invalidatePostcode(
    postcode: string,
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    const tag = CacheTags.propertyPostcode(postcode);
    return await cache.deleteByTag(tag);
  }

  /**
   * Invalidate time-based caches (e.g., hourly refresh)
   */
  static async invalidateHourly(
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    const previousHour = new Date().getHours() - 1;
    const tag = CacheTags.hourly(previousHour < 0 ? 23 : previousHour);
    return await cache.deleteByTag(tag);
  }

  /**
   * Invalidate all API caches for a user
   */
  static async invalidateUserCache(
    userId: string,
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    const tag = CacheTags.apiUser(userId);
    return await cache.deleteByTag(tag);
  }

  /**
   * Smart invalidation based on data update
   */
  static async smartInvalidate(
    entityType: 'property' | 'planning' | 'school' | 'transport' | 'crime',
    entityData: any,
    cache: { deleteByTag: (tag: string) => Promise<number> }
  ): Promise<number> {
    let tags: string[] = [];

    switch (entityType) {
      case 'property':
        tags = CacheTags.forProperty(entityData);
        break;
      case 'planning':
        tags = CacheTags.forPlanning(entityData);
        break;
      case 'school':
        tags = CacheTags.forSchool(entityData);
        break;
      default:
        // Generate tags based on entity data
        if (entityData.area) {
          tags.push(`${entityType}:area:${entityData.area}`);
        }
        if (entityData.id) {
          tags.push(`${entityType}:${entityData.id}`);
        }
    }

    let total = 0;
    for (const tag of tags) {
      total += await cache.deleteByTag(tag);
    }
    return total;
  }
}

export default CacheTags;