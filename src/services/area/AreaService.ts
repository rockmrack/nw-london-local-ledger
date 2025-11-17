/**
 * Area Service
 * Handles area, postcode, and street-related operations
 */

import sql from '@/lib/db/client';
import type { Area, Postcode, Street, School, AreaStats } from '@/types/area';

export class AreaService {
  /**
   * Get area by ID
   */
  async getAreaById(id: number): Promise<Area | null> {
    const [area] = await sql<Area[]>`
      SELECT * FROM areas WHERE id = ${id}
    `;
    return area || null;
  }

  /**
   * Get area by slug
   */
  async getAreaBySlug(slug: string): Promise<Area | null> {
    const [area] = await sql<Area[]>`
      SELECT * FROM areas WHERE slug = ${slug}
    `;
    return area || null;
  }

  /**
   * Get area by postcode prefix (e.g., 'NW3')
   */
  async getAreaByPostcodePrefix(prefix: string): Promise<Area | null> {
    const [area] = await sql<Area[]>`
      SELECT * FROM areas WHERE postcode_prefix = ${prefix.toUpperCase()}
    `;
    return area || null;
  }

  /**
   * Get all areas
   */
  async getAllAreas(): Promise<Area[]> {
    return await sql<Area[]>`
      SELECT * FROM areas
      ORDER BY postcode_prefix
    `;
  }

  /**
   * Get comprehensive area statistics
   */
  async getAreaStats(areaId: number): Promise<AreaStats | null> {
    const area = await this.getAreaById(areaId);
    if (!area) return null;

    // Get property stats
    const [propertyStats] = await sql`
      SELECT
        COUNT(*) as property_count,
        AVG(current_value) as average_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current_value) as median_price
      FROM properties
      WHERE area_id = ${areaId}
        AND current_value IS NOT NULL
    `;

    // Get price changes
    const [priceChanges] = await sql`
      WITH recent_sales AS (
        SELECT AVG(price) as avg_price
        FROM property_sales ps
        JOIN properties p ON ps.property_id = p.id
        WHERE p.area_id = ${areaId}
          AND ps.sale_date >= CURRENT_DATE - INTERVAL '1 year'
      ),
      old_sales AS (
        SELECT AVG(price) as avg_price
        FROM property_sales ps
        JOIN properties p ON ps.property_id = p.id
        WHERE p.area_id = ${areaId}
          AND ps.sale_date BETWEEN CURRENT_DATE - INTERVAL '2 years' AND CURRENT_DATE - INTERVAL '1 year'
      ),
      very_old_sales AS (
        SELECT AVG(price) as avg_price
        FROM property_sales ps
        JOIN properties p ON ps.property_id = p.id
        WHERE p.area_id = ${areaId}
          AND ps.sale_date BETWEEN CURRENT_DATE - INTERVAL '6 years' AND CURRENT_DATE - INTERVAL '5 years'
      )
      SELECT
        CASE WHEN o.avg_price > 0
          THEN ((r.avg_price - o.avg_price) / o.avg_price * 100)
          ELSE 0
        END as price_change_1_year,
        CASE WHEN v.avg_price > 0
          THEN ((r.avg_price - v.avg_price) / v.avg_price * 100)
          ELSE 0
        END as price_change_5_year
      FROM recent_sales r, old_sales o, very_old_sales v
    `;

    // Get school stats
    const [schoolStats] = await sql`
      SELECT
        COUNT(*) as school_count,
        AVG(CASE ofsted_rating
          WHEN 'Outstanding' THEN 4
          WHEN 'Good' THEN 3
          WHEN 'Requires Improvement' THEN 2
          WHEN 'Inadequate' THEN 1
        END) as avg_rating_score
      FROM schools
      WHERE area_id = ${areaId}
    `;

    // Get planning stats
    const [planningStats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'Refused' THEN 1 END) as refused
      FROM planning_applications
      WHERE area_id = ${areaId}
        AND submitted_date >= CURRENT_DATE - INTERVAL '12 months'
    `;

    // Map rating score back to text
    const avgRatingScore = schoolStats.avg_rating_score || 0;
    let avgOfstedRating = 'N/A';
    if (avgRatingScore >= 3.5) avgOfstedRating = 'Outstanding';
    else if (avgRatingScore >= 2.5) avgOfstedRating = 'Good';
    else if (avgRatingScore >= 1.5) avgOfstedRating = 'Requires Improvement';
    else if (avgRatingScore >= 1) avgOfstedRating = 'Inadequate';

    return {
      area,
      propertyCount: propertyStats.property_count || 0,
      averagePrice: propertyStats.average_price || 0,
      medianPrice: propertyStats.median_price || 0,
      priceChange1Year: priceChanges?.price_change_1_year || 0,
      priceChange5Year: priceChanges?.price_change_5_year || 0,
      schoolCount: schoolStats.school_count || 0,
      avgOfstedRating,
      planningApplications: {
        total: planningStats.total || 0,
        approved: planningStats.approved || 0,
        pending: planningStats.pending || 0,
        refused: planningStats.refused || 0,
      },
    };
  }

  /**
   * Get postcode by code
   */
  async getPostcodeByCode(postcode: string): Promise<Postcode | null> {
    const [result] = await sql<Postcode[]>`
      SELECT * FROM postcodes WHERE postcode = ${postcode.toUpperCase().replace(/\s/g, '')}
    `;
    return result || null;
  }

  /**
   * Get street by slug
   */
  async getStreetBySlug(slug: string): Promise<Street | null> {
    const [street] = await sql<Street[]>`
      SELECT * FROM streets WHERE slug = ${slug}
    `;
    return street || null;
  }

  /**
   * Get streets in an area
   */
  async getStreetsByArea(areaId: number): Promise<Street[]> {
    return await sql<Street[]>`
      SELECT * FROM streets
      WHERE area_id = ${areaId}
      ORDER BY name
    `;
  }

  /**
   * Get school by slug
   */
  async getSchoolBySlug(slug: string): Promise<School | null> {
    const [school] = await sql<School[]>`
      SELECT * FROM schools WHERE slug = ${slug}
    `;
    return school || null;
  }

  /**
   * Get schools in an area
   */
  async getSchoolsByArea(areaId: number): Promise<School[]> {
    return await sql<School[]>`
      SELECT * FROM schools
      WHERE area_id = ${areaId}
      ORDER BY ofsted_rating DESC, name
    `;
  }

  /**
   * Search schools
   */
  async searchSchools(query: string, limit = 20): Promise<School[]> {
    return await sql<School[]>`
      SELECT * FROM schools
      WHERE name ILIKE ${'%' + query + '%'}
      ORDER BY ofsted_rating DESC, name
      LIMIT ${limit}
    `;
  }
}

// Export singleton instance
export const areaService = new AreaService();
