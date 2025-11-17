/**
 * GraphQL Resolvers
 * Implements efficient data fetching using DataLoaders
 */

import { GraphQLError } from 'graphql';
import type { DataLoaders } from '../dataloaders';
import { PropertyService } from '@/services/property/PropertyService';
import { PlanningService } from '@/services/planning/PlanningService';
import { AreaService } from '@/services/area/AreaService';
import sql from '@/lib/db/client';
import { MultiLayerCache } from '@/lib/cache/multi-layer-cache';

// Context type
export interface GraphQLContext {
  dataloaders: DataLoaders;
  cache: MultiLayerCache;
}

// Helper function to create cursor
const encodeCursor = (id: number): string => Buffer.from(`cursor:${id}`).toString('base64');
const decodeCursor = (cursor: string): number => {
  const decoded = Buffer.from(cursor, 'base64').toString('ascii');
  return parseInt(decoded.replace('cursor:', ''));
};

export const resolvers = {
  Query: {
    // Property queries
    property: async (_: any, args: any, context: GraphQLContext) => {
      if (args.id) {
        return context.dataloaders.propertyLoader.load(args.id);
      } else if (args.slug) {
        const propertyService = new PropertyService();
        const property = await propertyService.getPropertyBySlug(args.slug);
        if (property) {
          // Prime the loader cache
          context.dataloaders.propertyLoader.prime(property.id, property);
        }
        return property;
      }
      throw new GraphQLError('Must provide either id or slug');
    },

    properties: async (_: any, args: any, context: GraphQLContext) => {
      const { search = {}, pagination = {} } = args;
      const { limit = 10, offset = 0, cursor } = pagination;

      let whereConditions: string[] = [];
      let params: any = { limit, offset };

      if (cursor) {
        const cursorId = decodeCursor(cursor);
        whereConditions.push(`id > ${cursorId}`);
      }

      if (search.postcode) {
        whereConditions.push(`postcode ILIKE '${search.postcode}%'`);
      }
      if (search.areaId) {
        whereConditions.push(`area_id = ${search.areaId}`);
      }
      if (search.propertyType) {
        whereConditions.push(`property_type = '${search.propertyType.toLowerCase().replace('_', '-')}'`);
      }
      if (search.minPrice) {
        whereConditions.push(`current_value >= ${search.minPrice}`);
      }
      if (search.maxPrice) {
        whereConditions.push(`current_value <= ${search.maxPrice}`);
      }
      if (search.minBedrooms) {
        whereConditions.push(`bedrooms >= ${search.minBedrooms}`);
      }
      if (search.maxBedrooms) {
        whereConditions.push(`bedrooms <= ${search.maxBedrooms}`);
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const sortBy = search.sortBy || 'DATE';
      const sortOrder = search.sortOrder || 'DESC';
      let orderBy = 'created_at DESC';

      switch (sortBy) {
        case 'PRICE':
          orderBy = `current_value ${sortOrder}`;
          break;
        case 'BEDROOMS':
          orderBy = `bedrooms ${sortOrder}`;
          break;
        case 'AREA':
          orderBy = `floor_area_sqm ${sortOrder}`;
          break;
      }

      const [properties, totalCount] = await Promise.all([
        sql.unsafe(`
          SELECT * FROM properties
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        sql.unsafe(`
          SELECT COUNT(*) as count FROM properties
          ${whereClause}
        `)
      ]);

      const edges = properties.map((property: any) => ({
        node: property,
        cursor: encodeCursor(property.id)
      }));

      return {
        nodes: properties,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < totalCount[0].count,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: parseInt(totalCount[0].count)
      };
    },

    propertiesByIds: async (_: any, args: any, context: GraphQLContext) => {
      const properties = await Promise.all(
        args.ids.map((id: number) => context.dataloaders.propertyLoader.load(id))
      );
      return properties.filter(p => p && !(p instanceof Error));
    },

    propertiesByArea: async (_: any, args: any, context: GraphQLContext) => {
      const { areaId, pagination = {} } = args;
      const properties = await context.dataloaders.propertiesByAreaLoader.load(areaId);

      const { limit = 10, offset = 0 } = pagination;
      const paginatedProperties = properties.slice(offset, offset + limit);

      const edges = paginatedProperties.map((property: any) => ({
        node: property,
        cursor: encodeCursor(property.id)
      }));

      return {
        nodes: paginatedProperties,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < properties.length,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: properties.length
      };
    },

    nearbyProperties: async (_: any, args: any, context: GraphQLContext) => {
      const { latitude, longitude, radiusKm = 1 } = args;

      // Use PostGIS for spatial queries or calculate distance manually
      const properties = await sql`
        SELECT *,
          (
            6371 * acos(
              cos(radians(${latitude})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${longitude})) +
              sin(radians(${latitude})) * sin(radians(latitude))
            )
          ) AS distance
        FROM properties
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        HAVING distance < ${radiusKm}
        ORDER BY distance
        LIMIT 20
      `;

      return properties;
    },

    // Planning queries
    planningApplication: async (_: any, args: any, context: GraphQLContext) => {
      if (args.id) {
        return context.dataloaders.planningLoader.load(args.id);
      } else if (args.reference) {
        const planningService = new PlanningService();
        const app = await planningService.getPlanningByReference(args.reference);
        if (app) {
          context.dataloaders.planningLoader.prime(app.id, app);
        }
        return app;
      } else if (args.slug) {
        const planningService = new PlanningService();
        const app = await planningService.getPlanningBySlug(args.slug);
        if (app) {
          context.dataloaders.planningLoader.prime(app.id, app);
        }
        return app;
      }
      throw new GraphQLError('Must provide either id, reference, or slug');
    },

    planningApplications: async (_: any, args: any, context: GraphQLContext) => {
      const { search = {}, pagination = {} } = args;
      const { limit = 10, offset = 0 } = pagination;

      let whereConditions: string[] = [];

      if (search.council) {
        whereConditions.push(`council = '${search.council}'`);
      }
      if (search.status) {
        whereConditions.push(`status = '${search.status}'`);
      }
      if (search.developmentType) {
        whereConditions.push(`development_type = '${search.developmentType.toLowerCase().replace('_', '_')}'`);
      }
      if (search.areaId) {
        whereConditions.push(`area_id = ${search.areaId}`);
      }
      if (search.postcode) {
        whereConditions.push(`postcode ILIKE '${search.postcode}%'`);
      }
      if (search.fromDate) {
        whereConditions.push(`submitted_date >= '${search.fromDate}'`);
      }
      if (search.toDate) {
        whereConditions.push(`submitted_date <= '${search.toDate}'`);
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const sortOrder = search.sortOrder || 'DESC';

      const [applications, totalCount] = await Promise.all([
        sql.unsafe(`
          SELECT * FROM planning_applications
          ${whereClause}
          ORDER BY submitted_date ${sortOrder}
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        sql.unsafe(`
          SELECT COUNT(*) as count FROM planning_applications
          ${whereClause}
        `)
      ]);

      const edges = applications.map((app: any) => ({
        node: app,
        cursor: encodeCursor(app.id)
      }));

      return {
        nodes: applications,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < totalCount[0].count,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: parseInt(totalCount[0].count)
      };
    },

    planningApplicationsByIds: async (_: any, args: any, context: GraphQLContext) => {
      const applications = await Promise.all(
        args.ids.map((id: number) => context.dataloaders.planningLoader.load(id))
      );
      return applications.filter(a => a && !(a instanceof Error));
    },

    planningApplicationsByArea: async (_: any, args: any, context: GraphQLContext) => {
      const { areaId, status, pagination = {} } = args;
      let applications = await context.dataloaders.planningByAreaLoader.load(areaId);

      if (status) {
        applications = applications.filter(app => app.status === status);
      }

      const { limit = 10, offset = 0 } = pagination;
      const paginatedApps = applications.slice(offset, offset + limit);

      const edges = paginatedApps.map((app: any) => ({
        node: app,
        cursor: encodeCursor(app.id)
      }));

      return {
        nodes: paginatedApps,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < applications.length,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: applications.length
      };
    },

    // Area queries
    area: async (_: any, args: any, context: GraphQLContext) => {
      if (args.id) {
        return context.dataloaders.areaLoader.load(args.id);
      } else if (args.slug || args.postcodePrefix) {
        const areaService = new AreaService();
        const area = args.slug
          ? await areaService.getAreaBySlug(args.slug)
          : await areaService.getAreaByPostcodePrefix(args.postcodePrefix);
        if (area) {
          context.dataloaders.areaLoader.prime(area.id, area);
        }
        return area;
      }
      throw new GraphQLError('Must provide either id, slug, or postcodePrefix');
    },

    areas: async (_: any, args: any, context: GraphQLContext) => {
      const areaService = new AreaService();
      return areaService.getAllAreas();
    },

    areasByIds: async (_: any, args: any, context: GraphQLContext) => {
      const areas = await Promise.all(
        args.ids.map((id: number) => context.dataloaders.areaLoader.load(id))
      );
      return areas.filter(a => a && !(a instanceof Error));
    },

    // Street queries
    street: async (_: any, args: any, context: GraphQLContext) => {
      if (args.id) {
        return context.dataloaders.streetLoader.load(args.id);
      } else if (args.slug) {
        const [street] = await sql`
          SELECT * FROM streets WHERE slug = ${args.slug}
        `;
        if (street) {
          context.dataloaders.streetLoader.prime(street.id, street);
        }
        return street;
      }
      throw new GraphQLError('Must provide either id or slug');
    },

    streetsByArea: async (_: any, args: any, context: GraphQLContext) => {
      return context.dataloaders.streetsByAreaLoader.load(args.areaId);
    },

    // School queries
    school: async (_: any, args: any, context: GraphQLContext) => {
      if (args.id) {
        return context.dataloaders.schoolLoader.load(args.id);
      } else if (args.slug) {
        const [school] = await sql`
          SELECT * FROM schools WHERE slug = ${args.slug}
        `;
        if (school) {
          context.dataloaders.schoolLoader.prime(school.id, school);
        }
        return school;
      }
      throw new GraphQLError('Must provide either id or slug');
    },

    schoolsByArea: async (_: any, args: any, context: GraphQLContext) => {
      return context.dataloaders.schoolsByAreaLoader.load(args.areaId);
    },

    nearbySchools: async (_: any, args: any, context: GraphQLContext) => {
      const { latitude, longitude, radiusKm = 2 } = args;

      const schools = await sql`
        SELECT *,
          (
            6371 * acos(
              cos(radians(${latitude})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${longitude})) +
              sin(radians(${latitude})) * sin(radians(latitude))
            )
          ) AS distance
        FROM schools
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        HAVING distance < ${radiusKm}
        ORDER BY distance
        LIMIT 20
      `;

      return schools;
    },

    // Search queries
    search: async (_: any, args: any, context: GraphQLContext) => {
      const { query, filters = {} } = args;

      // Perform search across multiple entities
      const [properties, planningApplications, areas, streets] = await Promise.all([
        sql`
          SELECT * FROM properties
          WHERE
            address_line1 ILIKE ${'%' + query + '%'} OR
            postcode ILIKE ${'%' + query + '%'}
          LIMIT 10
        `,
        sql`
          SELECT * FROM planning_applications
          WHERE
            reference ILIKE ${'%' + query + '%'} OR
            address ILIKE ${'%' + query + '%'} OR
            proposal ILIKE ${'%' + query + '%'}
          LIMIT 10
        `,
        sql`
          SELECT * FROM areas
          WHERE
            name ILIKE ${'%' + query + '%'} OR
            postcode_prefix ILIKE ${'%' + query + '%'}
          LIMIT 5
        `,
        sql`
          SELECT * FROM streets
          WHERE name ILIKE ${'%' + query + '%'}
          LIMIT 5
        `
      ]);

      // Calculate facets
      const facets = {
        propertyTypes: [],
        councils: [],
        priceRanges: []
      };

      return {
        properties,
        planningApplications,
        areas,
        streets,
        totalResults: properties.length + planningApplications.length + areas.length + streets.length,
        facets
      };
    },

    autocomplete: async (_: any, args: any, context: GraphQLContext) => {
      const { query, limit = 5 } = args;

      const suggestions = await sql`
        SELECT DISTINCT suggestion FROM (
          SELECT address_line1 as suggestion FROM properties
          WHERE address_line1 ILIKE ${'%' + query + '%'}
          UNION
          SELECT name as suggestion FROM areas
          WHERE name ILIKE ${'%' + query + '%'}
          UNION
          SELECT name as suggestion FROM streets
          WHERE name ILIKE ${'%' + query + '%'}
        ) t
        LIMIT ${limit}
      `;

      return suggestions.map(s => s.suggestion);
    },

    // Statistics queries
    marketStats: async (_: any, args: any, context: GraphQLContext) => {
      if (args.areaId) {
        return context.dataloaders.areaStatsLoader.load(args.areaId);
      } else if (args.postcodePrefix) {
        const areaService = new AreaService();
        const area = await areaService.getAreaByPostcodePrefix(args.postcodePrefix);
        if (area) {
          return context.dataloaders.areaStatsLoader.load(area.id);
        }
      }
      return null;
    },

    priceHistory: async (_: any, args: any, context: GraphQLContext) => {
      const { propertyId, areaId, period = '1Y' } = args;

      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case '1M':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case '3M':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6M':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1Y':
        default:
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case '5Y':
          startDate.setFullYear(startDate.getFullYear() - 5);
          break;
      }

      // This would need a price history table in real implementation
      // For now, return mock data
      return [
        { date: startDate.toISOString(), price: 500000, changePercent: 0 },
        { date: new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2).toISOString(), price: 525000, changePercent: 5 },
        { date: endDate.toISOString(), price: 550000, changePercent: 10 }
      ];
    }
  },

  // Field resolvers
  Property: {
    street: async (property: any, _: any, context: GraphQLContext) => {
      if (property.streetId) {
        return context.dataloaders.streetLoader.load(property.streetId);
      }
      return null;
    },
    area: async (property: any, _: any, context: GraphQLContext) => {
      if (property.areaId) {
        return context.dataloaders.areaLoader.load(property.areaId);
      }
      return null;
    },
    sales: async (property: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.propertySalesLoader.load(property.id);
    },
    planningApplications: async (property: any, _: any, context: GraphQLContext) => {
      const applications = await sql`
        SELECT * FROM planning_applications
        WHERE property_id = ${property.id}
        ORDER BY submitted_date DESC
      `;
      return applications;
    },
    nearbyProperties: async (property: any, args: any, context: GraphQLContext) => {
      const limit = args.limit || 5;
      if (!property.latitude || !property.longitude) return [];

      const nearby = await sql`
        SELECT *,
          (
            6371 * acos(
              cos(radians(${property.latitude})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians(${property.longitude})) +
              sin(radians(${property.latitude})) * sin(radians(latitude))
            )
          ) AS distance
        FROM properties
        WHERE id != ${property.id}
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        HAVING distance < 1
        ORDER BY distance
        LIMIT ${limit}
      `;

      return nearby;
    },
    priceHistory: async (property: any, _: any, context: GraphQLContext) => {
      // Mock implementation - would need price history table
      return [
        { date: new Date().toISOString(), price: property.currentValue, changePercent: 0 }
      ];
    }
  },

  PlanningApplication: {
    property: async (application: any, _: any, context: GraphQLContext) => {
      if (application.propertyId) {
        return context.dataloaders.propertyLoader.load(application.propertyId);
      }
      return null;
    },
    area: async (application: any, _: any, context: GraphQLContext) => {
      if (application.areaId) {
        return context.dataloaders.areaLoader.load(application.areaId);
      }
      return null;
    },
    documents: async (application: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.planningDocumentsLoader.load(application.id);
    },
    comments: async (application: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.planningCommentsLoader.load(application.id);
    }
  },

  Area: {
    properties: async (area: any, args: any, context: GraphQLContext) => {
      const { limit = 10, offset = 0 } = args;
      const properties = await context.dataloaders.propertiesByAreaLoader.load(area.id);
      const paginatedProperties = properties.slice(offset, offset + limit);

      const edges = paginatedProperties.map((property: any) => ({
        node: property,
        cursor: encodeCursor(property.id)
      }));

      return {
        nodes: paginatedProperties,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < properties.length,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: properties.length
      };
    },
    planningApplications: async (area: any, args: any, context: GraphQLContext) => {
      const { limit = 10, offset = 0, status } = args;
      let applications = await context.dataloaders.planningByAreaLoader.load(area.id);

      if (status) {
        applications = applications.filter(app => app.status === status);
      }

      const paginatedApps = applications.slice(offset, offset + limit);

      const edges = paginatedApps.map((app: any) => ({
        node: app,
        cursor: encodeCursor(app.id)
      }));

      return {
        nodes: paginatedApps,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < applications.length,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: applications.length
      };
    },
    streets: async (area: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.streetsByAreaLoader.load(area.id);
    },
    schools: async (area: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.schoolsByAreaLoader.load(area.id);
    },
    stats: async (area: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.areaStatsLoader.load(area.id);
    }
  },

  Street: {
    area: async (street: any, _: any, context: GraphQLContext) => {
      if (street.areaId) {
        return context.dataloaders.areaLoader.load(street.areaId);
      }
      return null;
    },
    properties: async (street: any, args: any, context: GraphQLContext) => {
      const { limit = 10, offset = 0 } = args;
      const properties = await context.dataloaders.propertiesByStreetLoader.load(street.id);
      const paginatedProperties = properties.slice(offset, offset + limit);

      const edges = paginatedProperties.map((property: any) => ({
        node: property,
        cursor: encodeCursor(property.id)
      }));

      return {
        nodes: paginatedProperties,
        edges,
        pageInfo: {
          hasNextPage: offset + limit < properties.length,
          hasPreviousPage: offset > 0,
          startCursor: edges[0]?.cursor,
          endCursor: edges[edges.length - 1]?.cursor
        },
        totalCount: properties.length
      };
    }
  },

  School: {
    area: async (school: any, _: any, context: GraphQLContext) => {
      if (school.areaId) {
        return context.dataloaders.areaLoader.load(school.areaId);
      }
      return null;
    }
  },

  PropertySale: {
    property: async (sale: any, _: any, context: GraphQLContext) => {
      return context.dataloaders.propertyLoader.load(sale.propertyId);
    }
  },

  // Mutations
  Mutation: {
    createProperty: async (_: any, args: any, context: GraphQLContext) => {
      const { input } = args;
      const propertyService = new PropertyService();

      // Create property (would need proper implementation)
      const [property] = await sql`
        INSERT INTO properties (
          address_line1, address_line2, postcode, property_type,
          tenure, bedrooms, bathrooms, floor_area_sqm, current_value,
          latitude, longitude
        ) VALUES (
          ${input.addressLine1}, ${input.addressLine2}, ${input.postcode},
          ${input.propertyType}, ${input.tenure}, ${input.bedrooms},
          ${input.bathrooms}, ${input.floorAreaSqm}, ${input.currentValue},
          ${input.latitude}, ${input.longitude}
        )
        RETURNING *
      `;

      // Clear relevant caches
      context.dataloaders.clearAll();

      return property;
    },

    updateProperty: async (_: any, args: any, context: GraphQLContext) => {
      const { id, input } = args;

      // Update property (would need proper implementation)
      const [property] = await sql`
        UPDATE properties
        SET
          address_line1 = COALESCE(${input.addressLine1}, address_line1),
          address_line2 = COALESCE(${input.addressLine2}, address_line2),
          current_value = COALESCE(${input.currentValue}, current_value),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      // Clear relevant caches
      context.dataloaders.propertyLoader.clear(id);
      if (property.areaId) {
        context.dataloaders.propertiesByAreaLoader.clear(property.areaId);
      }

      return property;
    },

    deleteProperty: async (_: any, args: any, context: GraphQLContext) => {
      const { id } = args;

      // Get property first to clear related caches
      const property = await context.dataloaders.propertyLoader.load(id);

      await sql`DELETE FROM properties WHERE id = ${id}`;

      // Clear relevant caches
      context.dataloaders.propertyLoader.clear(id);
      if (property && property.areaId) {
        context.dataloaders.propertiesByAreaLoader.clear(property.areaId);
      }

      return { success: true, message: 'Property deleted successfully' };
    },

    invalidateCache: async (_: any, args: any, context: GraphQLContext) => {
      const { keys } = args;

      for (const key of keys) {
        await context.cache.delete(key);
      }

      return { success: true, message: `Invalidated ${keys.length} cache keys` };
    },

    warmCache: async (_: any, args: any, context: GraphQLContext) => {
      const { entityType } = args;

      // Warm cache based on entity type
      switch (entityType) {
        case 'properties':
          const properties = await sql`SELECT * FROM properties LIMIT 100`;
          for (const property of properties) {
            context.dataloaders.propertyLoader.prime(property.id, property);
          }
          break;
        case 'areas':
          const areas = await sql`SELECT * FROM areas`;
          for (const area of areas) {
            context.dataloaders.areaLoader.prime(area.id, area);
          }
          break;
      }

      return { success: true, message: `Cache warmed for ${entityType}` };
    }
  }
};