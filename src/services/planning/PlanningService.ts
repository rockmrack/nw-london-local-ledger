/**
 * Planning Service
 * Handles all planning application-related database operations
 */

import sql from '@/lib/db/client';
import type {
  PlanningApplication,
  PlanningDocument,
  PlanningComment,
  PlanningSearchParams,
  PlanningSearchResult,
  Council,
} from '@/types/planning';
import { slugifyPlanningReference } from '@/lib/utils/slugify';

export class PlanningService {
  /**
   * Get planning application by ID
   */
  async getPlanningById(id: number): Promise<PlanningApplication | null> {
    const [application] = await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications WHERE id = ${id}
    `;
    return application || null;
  }

  /**
   * Get planning application by reference
   */
  async getPlanningByReference(reference: string): Promise<PlanningApplication | null> {
    const [application] = await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications WHERE reference = ${reference}
    `;
    return application || null;
  }

  /**
   * Get planning application by slug
   */
  async getPlanningBySlug(slug: string): Promise<PlanningApplication | null> {
    const [application] = await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications WHERE slug = ${slug}
    `;
    return application || null;
  }

  /**
   * Search planning applications with filters
   */
  async searchPlanningApplications(
    params: PlanningSearchParams
  ): Promise<PlanningSearchResult> {
    const {
      council,
      status,
      developmentType,
      areaId,
      postcode,
      reference,
      fromDate,
      toDate,
      page = 1,
      limit = 20,
    } = params;

    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];

    if (council) conditions.push(sql`council = ${council}`);
    if (status) conditions.push(sql`status = ${status}`);
    if (developmentType) conditions.push(sql`development_type = ${developmentType}`);
    if (areaId) conditions.push(sql`area_id = ${areaId}`);
    if (postcode) conditions.push(sql`postcode ILIKE ${'%' + postcode + '%'}`);
    if (reference) conditions.push(sql`reference ILIKE ${'%' + reference + '%'}`);
    if (fromDate) conditions.push(sql`submitted_date >= ${fromDate}`);
    if (toDate) conditions.push(sql`submitted_date <= ${toDate}`);

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    // Get total count
    const [{ count }] = await sql<[{ count: number }]>`
      SELECT COUNT(*) as count FROM planning_applications ${whereClause}
    `;

    // Get applications
    const applications = await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications
      ${whereClause}
      ORDER BY submitted_date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return {
      applications,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Get planning applications by property
   */
  async getPlanningByProperty(propertyId: number): Promise<PlanningApplication[]> {
    return await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications
      WHERE property_id = ${propertyId}
      ORDER BY submitted_date DESC
    `;
  }

  /**
   * Get planning applications by area
   */
  async getPlanningByArea(areaId: number, limit = 50): Promise<PlanningApplication[]> {
    return await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications
      WHERE area_id = ${areaId}
      ORDER BY submitted_date DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get recent planning applications
   */
  async getRecentApplications(limit = 20): Promise<PlanningApplication[]> {
    return await sql<PlanningApplication[]>`
      SELECT * FROM planning_applications
      ORDER BY submitted_date DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get nearby planning applications
   */
  async getNearbyApplications(
    latitude: number,
    longitude: number,
    radiusMeters = 500,
    limit = 10
  ): Promise<PlanningApplication[]> {
    return await sql<PlanningApplication[]>`
      SELECT *,
        ST_Distance(
          location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as distance
      FROM planning_applications
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
   * Get documents for a planning application
   */
  async getDocuments(planningId: number): Promise<PlanningDocument[]> {
    return await sql<PlanningDocument[]>`
      SELECT * FROM planning_documents
      WHERE planning_application_id = ${planningId}
      ORDER BY published_date DESC
    `;
  }

  /**
   * Get comments for a planning application
   */
  async getComments(planningId: number): Promise<PlanningComment[]> {
    return await sql<PlanningComment[]>`
      SELECT * FROM planning_comments
      WHERE planning_application_id = ${planningId}
      ORDER BY submitted_date DESC
    `;
  }

  /**
   * Create planning application
   */
  async createPlanningApplication(
    data: Partial<PlanningApplication>
  ): Promise<PlanningApplication> {
    const slug = slugifyPlanningReference(
      data.reference || '',
      data.address || ''
    );

    const [application] = await sql<PlanningApplication[]>`
      INSERT INTO planning_applications (
        reference, council, address, postcode, area_id,
        proposal, application_type, development_type,
        status, submitted_date, latitude, longitude, slug
      ) VALUES (
        ${data.reference}, ${data.council}, ${data.address},
        ${data.postcode}, ${data.areaId}, ${data.proposal},
        ${data.applicationType}, ${data.developmentType},
        ${data.status}, ${data.submittedDate}, ${data.latitude},
        ${data.longitude}, ${slug}
      )
      RETURNING *
    `;

    return application;
  }

  /**
   * Update planning application
   */
  async updatePlanningApplication(
    id: number,
    data: Partial<PlanningApplication>
  ): Promise<PlanningApplication | null> {
    const [application] = await sql<PlanningApplication[]>`
      UPDATE planning_applications
      SET
        status = COALESCE(${data.status}, status),
        decision = COALESCE(${data.decision}, decision),
        decision_date = COALESCE(${data.decisionDate}, decision_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    return application || null;
  }

  /**
   * Get planning statistics for an area
   */
  async getAreaPlanningStats(areaId: number, monthsBack = 12) {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    const [stats] = await sql`
      SELECT
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'Refused' THEN 1 END) as refused_count,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN development_type = 'extension' THEN 1 END) as extension_count,
        COUNT(CASE WHEN development_type = 'loft_conversion' THEN 1 END) as loft_conversion_count,
        COUNT(CASE WHEN development_type = 'basement' THEN 1 END) as basement_count,
        COUNT(CASE WHEN development_type = 'new_build' THEN 1 END) as new_build_count
      FROM planning_applications
      WHERE area_id = ${areaId}
        AND submitted_date >= ${fromDate.toISOString()}
    `;

    return stats;
  }

  /**
   * Get planning statistics by council
   */
  async getCouncilStats(council: Council, monthsBack = 12) {
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    const [stats] = await sql`
      SELECT
        COUNT(*) as total_applications,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN status = 'Refused' THEN 1 END) as refused_count,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count,
        AVG(
          CASE WHEN decision_date IS NOT NULL AND submitted_date IS NOT NULL
          THEN EXTRACT(EPOCH FROM (decision_date - submitted_date))/86400
          END
        ) as avg_decision_days
      FROM planning_applications
      WHERE council = ${council}
        AND submitted_date >= ${fromDate.toISOString()}
    `;

    return stats;
  }

  /**
   * Mark application as scraped
   */
  async markAsScraped(id: number): Promise<void> {
    await sql`
      UPDATE planning_applications
      SET last_scraped_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  }
}

// Export singleton instance
export const planningService = new PlanningService();
