/**
 * DataLoader Configuration
 * Implements batching and caching to eliminate N+1 queries
 */

import DataLoader from 'dataloader';
import sql from '@/lib/db/client';
import { MultiLayerCache } from '@/lib/cache/multi-layer-cache';
import { PropertyService } from '@/services/property/PropertyService';
import { PlanningService } from '@/services/planning/PlanningService';
import { AreaService } from '@/services/area/AreaService';
import type {
  Property,
  PropertySale,
  PropertyWithSales
} from '@/types/property';
import type {
  PlanningApplication,
  PlanningDocument,
  PlanningComment
} from '@/types/planning';
import type { Area, Street, School, AreaStats } from '@/types/area';

// Cache instance for DataLoaders
const cache = new MultiLayerCache();

// Helper function to create a cached DataLoader
function createCachedDataLoader<K, V>(
  batchFn: DataLoader.BatchLoadFn<K, V>,
  cacheKeyPrefix: string,
  ttl: number = 300 // 5 minutes default
): DataLoader<K, V> {
  return new DataLoader(async (keys: readonly K[]) => {
    const results: (V | null)[] = [];
    const uncachedKeys: K[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each key
    for (let i = 0; i < keys.length; i++) {
      const cacheKey = `${cacheKeyPrefix}:${String(keys[i])}`;
      const cachedValue = await cache.get<V>(cacheKey);

      if (cachedValue !== null) {
        results[i] = cachedValue;
      } else {
        uncachedKeys.push(keys[i]);
        uncachedIndices.push(i);
      }
    }

    // Batch fetch uncached keys
    if (uncachedKeys.length > 0) {
      const fetchedValues = await batchFn(uncachedKeys);

      // Store fetched values in cache and results array
      for (let i = 0; i < fetchedValues.length; i++) {
        const value = fetchedValues[i];
        const originalIndex = uncachedIndices[i];
        const cacheKey = `${cacheKeyPrefix}:${String(uncachedKeys[i])}`;

        if (value && !(value instanceof Error)) {
          await cache.set(cacheKey, value, { ttl });
        }

        results[originalIndex] = value;
      }
    }

    return results;
  });
}

export class DataLoaders {
  private propertyService: PropertyService;
  private planningService: PlanningService;
  private areaService: AreaService;

  // DataLoader instances
  public propertyLoader: DataLoader<number, Property>;
  public propertiesByAreaLoader: DataLoader<number, Property[]>;
  public propertiesByStreetLoader: DataLoader<number, Property[]>;
  public planningLoader: DataLoader<number, PlanningApplication>;
  public planningByAreaLoader: DataLoader<number, PlanningApplication[]>;
  public planningDocumentsLoader: DataLoader<number, PlanningDocument[]>;
  public planningCommentsLoader: DataLoader<number, PlanningComment[]>;
  public areaLoader: DataLoader<number, Area>;
  public streetLoader: DataLoader<number, Street>;
  public streetsByAreaLoader: DataLoader<number, Street[]>;
  public schoolLoader: DataLoader<number, School>;
  public schoolsByAreaLoader: DataLoader<number, School[]>;
  public propertySalesLoader: DataLoader<number, PropertySale[]>;
  public areaStatsLoader: DataLoader<number, AreaStats>;

  constructor() {
    this.propertyService = new PropertyService();
    this.planningService = new PlanningService();
    this.areaService = new AreaService();

    // Initialize DataLoaders
    this.propertyLoader = this.createPropertyLoader();
    this.propertiesByAreaLoader = this.createPropertiesByAreaLoader();
    this.propertiesByStreetLoader = this.createPropertiesByStreetLoader();
    this.planningLoader = this.createPlanningLoader();
    this.planningByAreaLoader = this.createPlanningByAreaLoader();
    this.planningDocumentsLoader = this.createPlanningDocumentsLoader();
    this.planningCommentsLoader = this.createPlanningCommentsLoader();
    this.areaLoader = this.createAreaLoader();
    this.streetLoader = this.createStreetLoader();
    this.streetsByAreaLoader = this.createStreetsByAreaLoader();
    this.schoolLoader = this.createSchoolLoader();
    this.schoolsByAreaLoader = this.createSchoolsByAreaLoader();
    this.propertySalesLoader = this.createPropertySalesLoader();
    this.areaStatsLoader = this.createAreaStatsLoader();
  }

  // Property DataLoaders
  private createPropertyLoader(): DataLoader<number, Property> {
    return createCachedDataLoader(
      async (ids: readonly number[]) => {
        const properties = await sql<Property[]>`
          SELECT * FROM properties
          WHERE id = ANY(${ids as number[]})
        `;

        const propertyMap = new Map(properties.map(p => [p.id, p]));
        return ids.map(id => propertyMap.get(id) || new Error(`Property ${id} not found`));
      },
      'property',
      600 // 10 minutes cache
    );
  }

  private createPropertiesByAreaLoader(): DataLoader<number, Property[]> {
    return createCachedDataLoader(
      async (areaIds: readonly number[]) => {
        const properties = await sql<Property[]>`
          SELECT * FROM properties
          WHERE area_id = ANY(${areaIds as number[]})
          ORDER BY current_value DESC
        `;

        // Group properties by area
        const propertyGroups = new Map<number, Property[]>();
        for (const property of properties) {
          const areaId = property.areaId!;
          if (!propertyGroups.has(areaId)) {
            propertyGroups.set(areaId, []);
          }
          propertyGroups.get(areaId)!.push(property);
        }

        return areaIds.map(areaId => propertyGroups.get(areaId) || []);
      },
      'properties:area',
      300 // 5 minutes cache
    );
  }

  private createPropertiesByStreetLoader(): DataLoader<number, Property[]> {
    return createCachedDataLoader(
      async (streetIds: readonly number[]) => {
        const properties = await sql<Property[]>`
          SELECT * FROM properties
          WHERE street_id = ANY(${streetIds as number[]})
          ORDER BY address_line1
        `;

        // Group properties by street
        const propertyGroups = new Map<number, Property[]>();
        for (const property of properties) {
          const streetId = property.streetId!;
          if (!propertyGroups.has(streetId)) {
            propertyGroups.set(streetId, []);
          }
          propertyGroups.get(streetId)!.push(property);
        }

        return streetIds.map(streetId => propertyGroups.get(streetId) || []);
      },
      'properties:street',
      300
    );
  }

  // Planning DataLoaders
  private createPlanningLoader(): DataLoader<number, PlanningApplication> {
    return createCachedDataLoader(
      async (ids: readonly number[]) => {
        const applications = await sql<PlanningApplication[]>`
          SELECT * FROM planning_applications
          WHERE id = ANY(${ids as number[]})
        `;

        const appMap = new Map(applications.map(a => [a.id, a]));
        return ids.map(id => appMap.get(id) || new Error(`Planning application ${id} not found`));
      },
      'planning',
      600
    );
  }

  private createPlanningByAreaLoader(): DataLoader<number, PlanningApplication[]> {
    return createCachedDataLoader(
      async (areaIds: readonly number[]) => {
        const applications = await sql<PlanningApplication[]>`
          SELECT * FROM planning_applications
          WHERE area_id = ANY(${areaIds as number[]})
          ORDER BY submitted_date DESC
        `;

        // Group applications by area
        const appGroups = new Map<number, PlanningApplication[]>();
        for (const app of applications) {
          const areaId = app.areaId!;
          if (!appGroups.has(areaId)) {
            appGroups.set(areaId, []);
          }
          appGroups.get(areaId)!.push(app);
        }

        return areaIds.map(areaId => appGroups.get(areaId) || []);
      },
      'planning:area',
      300
    );
  }

  private createPlanningDocumentsLoader(): DataLoader<number, PlanningDocument[]> {
    return createCachedDataLoader(
      async (applicationIds: readonly number[]) => {
        const documents = await sql<PlanningDocument[]>`
          SELECT * FROM planning_documents
          WHERE planning_application_id = ANY(${applicationIds as number[]})
          ORDER BY published_date DESC
        `;

        // Group documents by application
        const docGroups = new Map<number, PlanningDocument[]>();
        for (const doc of documents) {
          const appId = doc.planningApplicationId;
          if (!docGroups.has(appId)) {
            docGroups.set(appId, []);
          }
          docGroups.get(appId)!.push(doc);
        }

        return applicationIds.map(appId => docGroups.get(appId) || []);
      },
      'planning:docs',
      600
    );
  }

  private createPlanningCommentsLoader(): DataLoader<number, PlanningComment[]> {
    return createCachedDataLoader(
      async (applicationIds: readonly number[]) => {
        const comments = await sql<PlanningComment[]>`
          SELECT * FROM planning_comments
          WHERE planning_application_id = ANY(${applicationIds as number[]})
          ORDER BY submitted_date DESC
        `;

        // Group comments by application
        const commentGroups = new Map<number, PlanningComment[]>();
        for (const comment of comments) {
          const appId = comment.planningApplicationId;
          if (!commentGroups.has(appId)) {
            commentGroups.set(appId, []);
          }
          commentGroups.get(appId)!.push(comment);
        }

        return applicationIds.map(appId => commentGroups.get(appId) || []);
      },
      'planning:comments',
      300
    );
  }

  // Area DataLoaders
  private createAreaLoader(): DataLoader<number, Area> {
    return createCachedDataLoader(
      async (ids: readonly number[]) => {
        const areas = await sql<Area[]>`
          SELECT * FROM areas
          WHERE id = ANY(${ids as number[]})
        `;

        const areaMap = new Map(areas.map(a => [a.id, a]));
        return ids.map(id => areaMap.get(id) || new Error(`Area ${id} not found`));
      },
      'area',
      1800 // 30 minutes cache
    );
  }

  // Street DataLoaders
  private createStreetLoader(): DataLoader<number, Street> {
    return createCachedDataLoader(
      async (ids: readonly number[]) => {
        const streets = await sql<Street[]>`
          SELECT * FROM streets
          WHERE id = ANY(${ids as number[]})
        `;

        const streetMap = new Map(streets.map(s => [s.id, s]));
        return ids.map(id => streetMap.get(id) || new Error(`Street ${id} not found`));
      },
      'street',
      1800
    );
  }

  private createStreetsByAreaLoader(): DataLoader<number, Street[]> {
    return createCachedDataLoader(
      async (areaIds: readonly number[]) => {
        const streets = await sql<Street[]>`
          SELECT * FROM streets
          WHERE area_id = ANY(${areaIds as number[]})
          ORDER BY name
        `;

        // Group streets by area
        const streetGroups = new Map<number, Street[]>();
        for (const street of streets) {
          const areaId = street.areaId!;
          if (!streetGroups.has(areaId)) {
            streetGroups.set(areaId, []);
          }
          streetGroups.get(areaId)!.push(street);
        }

        return areaIds.map(areaId => streetGroups.get(areaId) || []);
      },
      'streets:area',
      1800
    );
  }

  // School DataLoaders
  private createSchoolLoader(): DataLoader<number, School> {
    return createCachedDataLoader(
      async (ids: readonly number[]) => {
        const schools = await sql<School[]>`
          SELECT * FROM schools
          WHERE id = ANY(${ids as number[]})
        `;

        const schoolMap = new Map(schools.map(s => [s.id, s]));
        return ids.map(id => schoolMap.get(id) || new Error(`School ${id} not found`));
      },
      'school',
      3600 // 1 hour cache
    );
  }

  private createSchoolsByAreaLoader(): DataLoader<number, School[]> {
    return createCachedDataLoader(
      async (areaIds: readonly number[]) => {
        const schools = await sql<School[]>`
          SELECT * FROM schools
          WHERE area_id = ANY(${areaIds as number[]})
          ORDER BY ofsted_rating DESC, name
        `;

        // Group schools by area
        const schoolGroups = new Map<number, School[]>();
        for (const school of schools) {
          const areaId = school.areaId!;
          if (!schoolGroups.has(areaId)) {
            schoolGroups.set(areaId, []);
          }
          schoolGroups.get(areaId)!.push(school);
        }

        return areaIds.map(areaId => schoolGroups.get(areaId) || []);
      },
      'schools:area',
      3600
    );
  }

  // Property Sales DataLoader
  private createPropertySalesLoader(): DataLoader<number, PropertySale[]> {
    return createCachedDataLoader(
      async (propertyIds: readonly number[]) => {
        const sales = await sql<PropertySale[]>`
          SELECT * FROM property_sales
          WHERE property_id = ANY(${propertyIds as number[]})
          ORDER BY sale_date DESC
        `;

        // Group sales by property
        const salesGroups = new Map<number, PropertySale[]>();
        for (const sale of sales) {
          const propertyId = sale.propertyId;
          if (!salesGroups.has(propertyId)) {
            salesGroups.set(propertyId, []);
          }
          salesGroups.get(propertyId)!.push(sale);
        }

        return propertyIds.map(propertyId => salesGroups.get(propertyId) || []);
      },
      'property:sales',
      600
    );
  }

  // Area Stats DataLoader
  private createAreaStatsLoader(): DataLoader<number, AreaStats> {
    return createCachedDataLoader(
      async (areaIds: readonly number[]) => {
        const statsPromises = areaIds.map(async (areaId) => {
          // Fetch all stats in parallel
          const [area, propertyStats, planningStats, schools] = await Promise.all([
            this.areaLoader.load(areaId),
            sql<any[]>`
              SELECT
                COUNT(*) as property_count,
                AVG(current_value) as average_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current_value) as median_price
              FROM properties
              WHERE area_id = ${areaId}
            `,
            sql<any[]>`
              SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'Approved') as approved,
                COUNT(*) FILTER (WHERE status = 'Pending') as pending,
                COUNT(*) FILTER (WHERE status = 'Refused') as refused
              FROM planning_applications
              WHERE area_id = ${areaId}
            `,
            sql<any[]>`
              SELECT COUNT(*) as school_count
              FROM schools
              WHERE area_id = ${areaId}
            `
          ]);

          const propStats = propertyStats[0];
          const planStats = planningStats[0];
          const schoolCount = schools[0].school_count;

          return {
            area,
            propertyCount: parseInt(propStats.property_count),
            averagePrice: parseFloat(propStats.average_price) || 0,
            medianPrice: parseFloat(propStats.median_price) || 0,
            priceChange1Year: 0, // Would need historical data
            priceChange5Year: 0, // Would need historical data
            schoolCount: parseInt(schoolCount),
            avgOfstedRating: 'Good', // Would need to calculate
            planningApplications: {
              total: parseInt(planStats.total),
              approved: parseInt(planStats.approved),
              pending: parseInt(planStats.pending),
              refused: parseInt(planStats.refused)
            }
          } as AreaStats;
        });

        return Promise.all(statsPromises);
      },
      'area:stats',
      300
    );
  }

  // Clear all DataLoader caches
  clearAll() {
    this.propertyLoader.clearAll();
    this.propertiesByAreaLoader.clearAll();
    this.propertiesByStreetLoader.clearAll();
    this.planningLoader.clearAll();
    this.planningByAreaLoader.clearAll();
    this.planningDocumentsLoader.clearAll();
    this.planningCommentsLoader.clearAll();
    this.areaLoader.clearAll();
    this.streetLoader.clearAll();
    this.streetsByAreaLoader.clearAll();
    this.schoolLoader.clearAll();
    this.schoolsByAreaLoader.clearAll();
    this.propertySalesLoader.clearAll();
    this.areaStatsLoader.clearAll();
  }
}

// Export singleton instance for use in resolvers
export const createDataLoaders = () => new DataLoaders();