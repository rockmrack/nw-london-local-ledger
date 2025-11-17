/**
 * Property Service
 * Handles all property-related database operations
 */

import sql from '@/lib/db/client';
import type {
  Property,
  PropertySale,
  PropertyWithSales,
  PropertySearchParams,
  PropertySearchResult,
} from '@/types/property';
import { slugifyPropertyAddress } from '@/lib/utils/slugify';

export class PropertyService {
  /**
   * Get property by ID
   */
  async getPropertyById(id: number): Promise<Property | null> {
    const [property] = await sql<Property[]>`
      SELECT * FROM properties WHERE id = ${id}
    `;
    return property || null;
  }

  /**
   * Get property by slug
   */
  async getPropertyBySlug(slug: string): Promise<Property | null> {
    const [property] = await sql<Property[]>`
      SELECT * FROM properties WHERE slug = ${slug}
    `;
    return property || null;
  }

  /**
   * Get property with sales history
   */
  async getPropertyWithSales(id: number): Promise<PropertyWithSales | null> {
    const property = await this.getPropertyById(id);
    if (!property) return null;

    const sales = await sql<PropertySale[]>`
      SELECT * FROM property_sales
      WHERE property_id = ${id}
      ORDER BY sale_date DESC
    `;

    return {
      ...property,
      sales,
    };
  }

  /**
   * Search properties with filters and pagination
   */
  async searchProperties(params: PropertySearchParams): Promise<PropertySearchResult> {
    const {
      postcode,
      areaId,
      propertyType,
      minPrice,
      maxPrice,
      minBedrooms,
      maxBedrooms,
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
    } = params;

    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];
    const values: any[] = [];

    if (postcode) {
      conditions.push(`postcode ILIKE $${conditions.length + 1}`);
      values.push(`%${postcode}%`);
    }

    if (areaId) {
      conditions.push(`area_id = $${conditions.length + 1}`);
      values.push(areaId);
    }

    if (propertyType) {
      conditions.push(`property_type = $${conditions.length + 1}`);
      values.push(propertyType);
    }

    if (minPrice !== undefined) {
      conditions.push(`current_value >= $${conditions.length + 1}`);
      values.push(minPrice);
    }

    if (maxPrice !== undefined) {
      conditions.push(`current_value <= $${conditions.length + 1}`);
      values.push(maxPrice);
    }

    if (minBedrooms !== undefined) {
      conditions.push(`bedrooms >= $${conditions.length + 1}`);
      values.push(minBedrooms);
    }

    if (maxBedrooms !== undefined) {
      conditions.push(`bedrooms <= $${conditions.length + 1}`);
      values.push(maxBedrooms);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    const orderByMap: Record<string, string> = {
      price: 'current_value',
      date: 'last_sale_date',
      bedrooms: 'bedrooms',
    };
    const orderColumn = orderByMap[sortBy] || 'last_sale_date';
    const orderDirection = sortOrder.toUpperCase();

    // Get total count
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*) as count
      FROM properties
      ${sql.unsafe(whereClause)}
    `;

    // Get properties
    const properties = await sql<Property[]>`
      SELECT *
      FROM properties
      ${sql.unsafe(whereClause)}
      ORDER BY ${sql.unsafe(orderColumn)} ${sql.unsafe(orderDirection)}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return {
      properties,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Get properties by street
   */
  async getPropertiesByStreet(streetId: number, limit = 50): Promise<Property[]> {
    return await sql<Property[]>`
      SELECT * FROM properties
      WHERE street_id = ${streetId}
      ORDER BY address_line_1
      LIMIT ${limit}
    `;
  }

  /**
   * Get properties by area
   */
  async getPropertiesByArea(areaId: number, limit = 50): Promise<Property[]> {
    return await sql<Property[]>`
      SELECT * FROM properties
      WHERE area_id = ${areaId}
      ORDER BY last_sale_date DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get nearby properties using geographical coordinates
   */
  async getNearbyProperties(
    latitude: number,
    longitude: number,
    radiusMeters = 500,
    limit = 10
  ): Promise<Property[]> {
    return await sql<Property[]>`
      SELECT *,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as distance
      FROM properties
      WHERE location IS NOT NULL
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY distance
      LIMIT ${limit}
    `;
  }

  /**
   * Get similar properties (same type, similar bedrooms, same area)
   */
  async getSimilarProperties(propertyId: number, limit = 5): Promise<Property[]> {
    const property = await this.getPropertyById(propertyId);
    if (!property) return [];

    return await sql<Property[]>`
      SELECT * FROM properties
      WHERE id != ${propertyId}
        AND area_id = ${property.areaId}
        AND property_type = ${property.propertyType}
        AND bedrooms BETWEEN ${(property.bedrooms || 0) - 1} AND ${(property.bedrooms || 0) + 1}
        AND current_value IS NOT NULL
      ORDER BY ABS(current_value - ${property.currentValue || 0})
      LIMIT ${limit}
    `;
  }

  /**
   * Create a new property
   */
  async createProperty(data: Partial<Property>): Promise<Property> {
    // Generate slug
    const slug = slugifyPropertyAddress(
      data.addressLine1 || '',
      data.postcode || ''
    );

    const [property] = await sql<Property[]>`
      INSERT INTO properties (
        address_line_1, address_line_2, postcode, street_id, area_id,
        property_type, tenure, bedrooms, bathrooms, floor_area_sqm,
        current_value, latitude, longitude, slug
      ) VALUES (
        ${data.addressLine1}, ${data.addressLine2}, ${data.postcode},
        ${data.streetId}, ${data.areaId}, ${data.propertyType},
        ${data.tenure}, ${data.bedrooms}, ${data.bathrooms},
        ${data.floorAreaSqm}, ${data.currentValue}, ${data.latitude},
        ${data.longitude}, ${slug}
      )
      RETURNING *
    `;

    return property;
  }

  /**
   * Update property
   */
  async updateProperty(id: number, data: Partial<Property>): Promise<Property | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        updates.push(`${this.camelToSnake(key)} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return this.getPropertyById(id);
    }

    const [property] = await sql<Property[]>`
      UPDATE properties
      SET ${sql.unsafe(updates.join(', '))}
      WHERE id = ${id}
      RETURNING *
    `;

    return property || null;
  }

  /**
   * Delete property
   */
  async deleteProperty(id: number): Promise<boolean> {
    const result = await sql`
      DELETE FROM properties WHERE id = ${id}
    `;
    return result.count > 0;
  }

  /**
   * Get property statistics for an area
   */
  async getAreaPropertyStats(areaId: number) {
    const [stats] = await sql`
      SELECT
        COUNT(*) as total_properties,
        AVG(current_value) as average_price,
        MIN(current_value) as min_price,
        MAX(current_value) as max_price,
        AVG(bedrooms) as average_bedrooms,
        COUNT(CASE WHEN property_type = 'flat' THEN 1 END) as flat_count,
        COUNT(CASE WHEN property_type = 'terraced' THEN 1 END) as terraced_count,
        COUNT(CASE WHEN property_type = 'semi-detached' THEN 1 END) as semi_detached_count,
        COUNT(CASE WHEN property_type = 'detached' THEN 1 END) as detached_count
      FROM properties
      WHERE area_id = ${areaId}
        AND current_value IS NOT NULL
    `;

    return stats;
  }

  /**
   * Helper: Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Export singleton instance
export const propertyService = new PropertyService();
