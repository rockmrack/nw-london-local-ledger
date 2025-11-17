/**
 * Advanced Search System
 * Faceted search with filters, autocomplete, and suggestions
 */

import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
});

export interface SearchFilters {
  // Location filters
  areas?: string[];
  postcodes?: string[];
  radiusKm?: number;
  centerLat?: number;
  centerLng?: number;

  // Property filters
  propertyType?: string[]; // 'flat', 'house', 'bungalow', 'land'
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  epcRating?: string[]; // 'A', 'B', 'C', 'D', 'E', 'F', 'G'

  // Planning filters
  planningStatus?: string[]; // 'approved', 'pending', 'rejected', 'withdrawn'
  applicationType?: string[]; // 'extension', 'new_build', 'change_of_use'
  submittedAfter?: Date;
  submittedBefore?: Date;

  // Additional filters
  hasGarden?: boolean;
  hasParking?: boolean;
  newBuild?: boolean;
  tenure?: string[]; // 'freehold', 'leasehold'
}

export interface SearchOptions {
  query?: string;
  filters?: SearchFilters;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc';
  page?: number;
  limit?: number;
  includeAggregations?: boolean;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  aggregations?: SearchAggregations;
}

export interface SearchAggregations {
  areas: { key: string; count: number }[];
  propertyTypes: { key: string; count: number }[];
  priceRanges: { key: string; count: number }[];
  bedrooms: { key: number; count: number }[];
  epcRatings: { key: string; count: number }[];
  planningStatus: { key: string; count: number }[];
}

/**
 * Advanced property search with faceted filtering
 */
export async function searchProperties(
  options: SearchOptions
): Promise<SearchResult<any>> {
  const {
    query = '',
    filters = {},
    sort = 'relevance',
    page = 1,
    limit = 20,
    includeAggregations = false,
  } = options;

  // Build Elasticsearch query
  const mustClauses: any[] = [];
  const filterClauses: any[] = [];

  // Text search
  if (query) {
    mustClauses.push({
      multi_match: {
        query,
        fields: [
          'address^3',
          'street^2',
          'area^2',
          'postcode',
          'description',
        ],
        fuzziness: 'AUTO',
      },
    });
  }

  // Area filter
  if (filters.areas?.length) {
    filterClauses.push({
      terms: { 'area.keyword': filters.areas },
    });
  }

  // Postcode filter
  if (filters.postcodes?.length) {
    filterClauses.push({
      terms: { 'postcode.keyword': filters.postcodes },
    });
  }

  // Geo distance filter
  if (filters.centerLat && filters.centerLng && filters.radiusKm) {
    filterClauses.push({
      geo_distance: {
        distance: `${filters.radiusKm}km`,
        location: {
          lat: filters.centerLat,
          lon: filters.centerLng,
        },
      },
    });
  }

  // Property type filter
  if (filters.propertyType?.length) {
    filterClauses.push({
      terms: { 'property_type.keyword': filters.propertyType },
    });
  }

  // Price range filter
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const range: any = {};
    if (filters.minPrice !== undefined) range.gte = filters.minPrice;
    if (filters.maxPrice !== undefined) range.lte = filters.maxPrice;
    filterClauses.push({ range: { current_value: range } });
  }

  // Bedrooms filter
  if (filters.minBedrooms !== undefined || filters.maxBedrooms !== undefined) {
    const range: any = {};
    if (filters.minBedrooms !== undefined) range.gte = filters.minBedrooms;
    if (filters.maxBedrooms !== undefined) range.lte = filters.maxBedrooms;
    filterClauses.push({ range: { bedrooms: range } });
  }

  // Bathrooms filter
  if (filters.minBathrooms !== undefined) {
    filterClauses.push({
      range: { bathrooms: { gte: filters.minBathrooms } },
    });
  }

  // EPC rating filter
  if (filters.epcRating?.length) {
    filterClauses.push({
      terms: { 'epc_rating.keyword': filters.epcRating },
    });
  }

  // Boolean filters
  if (filters.hasGarden !== undefined) {
    filterClauses.push({ term: { has_garden: filters.hasGarden } });
  }
  if (filters.hasParking !== undefined) {
    filterClauses.push({ term: { has_parking: filters.hasParking } });
  }
  if (filters.newBuild !== undefined) {
    filterClauses.push({ term: { new_build: filters.newBuild } });
  }

  // Tenure filter
  if (filters.tenure?.length) {
    filterClauses.push({
      terms: { 'tenure.keyword': filters.tenure },
    });
  }

  // Build sort
  const sortConfig = getSortConfig(sort);

  // Build aggregations
  const aggregations = includeAggregations
    ? buildAggregations()
    : undefined;

  // Execute search
  const response = await esClient.search({
    index: 'properties',
    body: {
      query: {
        bool: {
          must: mustClauses.length ? mustClauses : [{ match_all: {} }],
          filter: filterClauses,
        },
      },
      sort: sortConfig,
      from: (page - 1) * limit,
      size: limit,
      aggs: aggregations,
    },
  });

  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : response.hits.total?.value || 0;

  const items = response.hits.hits.map((hit: any) => ({
    id: hit._id,
    ...hit._source,
    _score: hit._score,
  }));

  const result: SearchResult<any> = {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  // Parse aggregations if requested
  if (includeAggregations && response.aggregations) {
    result.aggregations = parseAggregations(response.aggregations);
  }

  return result;
}

/**
 * Search planning applications with filters
 */
export async function searchPlanningApplications(
  options: SearchOptions
): Promise<SearchResult<any>> {
  const {
    query = '',
    filters = {},
    sort = 'date_desc',
    page = 1,
    limit = 20,
  } = options;

  const mustClauses: any[] = [];
  const filterClauses: any[] = [];

  // Text search
  if (query) {
    mustClauses.push({
      multi_match: {
        query,
        fields: [
          'application_number^3',
          'address^2',
          'description^2',
          'applicant_name',
        ],
        fuzziness: 'AUTO',
      },
    });
  }

  // Area filter
  if (filters.areas?.length) {
    filterClauses.push({
      terms: { 'council.keyword': filters.areas },
    });
  }

  // Status filter
  if (filters.planningStatus?.length) {
    filterClauses.push({
      terms: { 'status.keyword': filters.planningStatus },
    });
  }

  // Application type filter
  if (filters.applicationType?.length) {
    filterClauses.push({
      terms: { 'application_type.keyword': filters.applicationType },
    });
  }

  // Date range filter
  if (filters.submittedAfter || filters.submittedBefore) {
    const range: any = {};
    if (filters.submittedAfter) range.gte = filters.submittedAfter.toISOString();
    if (filters.submittedBefore) range.lte = filters.submittedBefore.toISOString();
    filterClauses.push({ range: { submitted_date: range } });
  }

  const sortConfig = getSortConfig(sort, 'planning');

  const response = await esClient.search({
    index: 'planning_applications',
    body: {
      query: {
        bool: {
          must: mustClauses.length ? mustClauses : [{ match_all: {} }],
          filter: filterClauses,
        },
      },
      sort: sortConfig,
      from: (page - 1) * limit,
      size: limit,
    },
  });

  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : response.hits.total?.value || 0;

  const items = response.hits.hits.map((hit: any) => ({
    id: hit._id,
    ...hit._source,
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Autocomplete suggestions
 */
export async function autocomplete(
  query: string,
  type: 'property' | 'planning' | 'area' = 'property',
  limit: number = 10
): Promise<string[]> {
  if (!query || query.length < 2) return [];

  const index = type === 'planning' ? 'planning_applications' : 'properties';
  const fields = type === 'planning'
    ? ['address', 'application_number']
    : ['address', 'street', 'postcode'];

  const response = await esClient.search({
    index,
    body: {
      suggest: {
        autocomplete: {
          prefix: query,
          completion: {
            field: 'autocomplete',
            size: limit,
            skip_duplicates: true,
          },
        },
      },
      _source: false,
    },
  });

  const suggestions = response.suggest?.autocomplete?.[0]?.options || [];
  return suggestions.map((s: any) => s.text);
}

/**
 * Get popular searches
 */
export async function getPopularSearches(limit: number = 10): Promise<string[]> {
  // This would query the search_history table
  // For now, return mock data
  return [
    'Hampstead flats',
    'Belsize Park houses',
    'Swiss Cottage 2 bedroom',
    'West Hampstead parking',
    'Primrose Hill garden',
  ];
}

// Helper functions

function getSortConfig(sort: string, type: 'property' | 'planning' = 'property') {
  if (type === 'planning') {
    switch (sort) {
      case 'date_desc':
        return [{ submitted_date: 'desc' }];
      case 'date_asc':
        return [{ submitted_date: 'asc' }];
      default:
        return [{ _score: 'desc' }, { submitted_date: 'desc' }];
    }
  }

  switch (sort) {
    case 'price_asc':
      return [{ current_value: 'asc' }];
    case 'price_desc':
      return [{ current_value: 'desc' }];
    case 'date_desc':
      return [{ last_sale_date: 'desc' }];
    case 'date_asc':
      return [{ last_sale_date: 'asc' }];
    default:
      return [{ _score: 'desc' }, { current_value: 'desc' }];
  }
}

function buildAggregations() {
  return {
    areas: {
      terms: { field: 'area.keyword', size: 20 },
    },
    property_types: {
      terms: { field: 'property_type.keyword', size: 10 },
    },
    price_ranges: {
      range: {
        field: 'current_value',
        ranges: [
          { key: '<250k', to: 250000 },
          { key: '250k-500k', from: 250000, to: 500000 },
          { key: '500k-750k', from: 500000, to: 750000 },
          { key: '750k-1M', from: 750000, to: 1000000 },
          { key: '1M-2M', from: 1000000, to: 2000000 },
          { key: '>2M', from: 2000000 },
        ],
      },
    },
    bedrooms: {
      terms: { field: 'bedrooms', size: 10 },
    },
    epc_ratings: {
      terms: { field: 'epc_rating.keyword', size: 7 },
    },
  };
}

function parseAggregations(aggs: any): SearchAggregations {
  return {
    areas: aggs.areas?.buckets?.map((b: any) => ({
      key: b.key,
      count: b.doc_count,
    })) || [],
    propertyTypes: aggs.property_types?.buckets?.map((b: any) => ({
      key: b.key,
      count: b.doc_count,
    })) || [],
    priceRanges: aggs.price_ranges?.buckets?.map((b: any) => ({
      key: b.key,
      count: b.doc_count,
    })) || [],
    bedrooms: aggs.bedrooms?.buckets?.map((b: any) => ({
      key: b.key,
      count: b.doc_count,
    })) || [],
    epcRatings: aggs.epc_ratings?.buckets?.map((b: any) => ({
      key: b.key,
      count: b.doc_count,
    })) || [],
    planningStatus: [],
  };
}
