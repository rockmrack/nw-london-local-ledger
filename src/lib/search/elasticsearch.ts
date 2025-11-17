/**
 * Elasticsearch Search Service
 * Full-text search across properties, planning applications, and areas
 */

import { Client } from '@elastic/elasticsearch';

const esUrl = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

// Create Elasticsearch client
const esClient = new Client({
  node: esUrl,
  auth:
    process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
      ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD,
        }
      : undefined,
});

export interface SearchResult {
  id: string;
  type: 'property' | 'planning' | 'area' | 'news';
  title: string;
  description: string;
  url: string;
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  took: number; // milliseconds
}

export class SearchService {
  /**
   * Initialize search indexes
   */
  async initializeIndexes(): Promise<void> {
    try {
      // Create properties index
      await this.createIndex('properties', {
        mappings: {
          properties: {
            id: { type: 'integer' },
            address: { type: 'text', analyzer: 'standard' },
            postcode: { type: 'keyword' },
            property_type: { type: 'keyword' },
            bedrooms: { type: 'integer' },
            price: { type: 'integer' },
            description: { type: 'text' },
            slug: { type: 'keyword' },
          },
        },
      });

      // Create planning index
      await this.createIndex('planning', {
        mappings: {
          properties: {
            id: { type: 'integer' },
            reference: { type: 'keyword' },
            address: { type: 'text' },
            proposal: { type: 'text', analyzer: 'standard' },
            council: { type: 'keyword' },
            status: { type: 'keyword' },
            development_type: { type: 'keyword' },
            slug: { type: 'keyword' },
          },
        },
      });

      // Create areas index
      await this.createIndex('areas', {
        mappings: {
          properties: {
            id: { type: 'integer' },
            name: { type: 'text', boost: 2.0 },
            postcode_prefix: { type: 'keyword' },
            description: { type: 'text' },
            council: { type: 'keyword' },
            slug: { type: 'keyword' },
          },
        },
      });

      // Create news index
      await this.createIndex('news', {
        mappings: {
          properties: {
            id: { type: 'integer' },
            title: { type: 'text', boost: 2.0 },
            excerpt: { type: 'text' },
            content: { type: 'text' },
            article_type: { type: 'keyword' },
            slug: { type: 'keyword' },
            published_at: { type: 'date' },
          },
        },
      });

      console.log('✅ Search indexes initialized');
    } catch (error) {
      console.error('Error initializing search indexes:', error);
      throw error;
    }
  }

  /**
   * Create an index if it doesn't exist
   */
  private async createIndex(indexName: string, body: any): Promise<void> {
    const exists = await esClient.indices.exists({ index: indexName });

    if (!exists) {
      await esClient.indices.create({
        index: indexName,
        body,
      });
      console.log(`Created index: ${indexName}`);
    }
  }

  /**
   * Global search across all entities
   */
  async search(query: string, options?: { limit?: number; offset?: number }): Promise<SearchResponse> {
    const { limit = 20, offset = 0 } = options || {};

    try {
      const startTime = Date.now();

      // Multi-index search
      const response = await esClient.search({
        index: ['properties', 'planning', 'areas', 'news'],
        body: {
          from: offset,
          size: limit,
          query: {
            multi_match: {
              query,
              fields: ['title^3', 'name^3', 'address^2', 'proposal^2', 'description', 'content'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          highlight: {
            fields: {
              title: {},
              name: {},
              address: {},
              proposal: {},
              description: {},
              content: { fragment_size: 150, number_of_fragments: 1 },
            },
          },
        },
      });

      const results: SearchResult[] = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        const type = hit._index as 'property' | 'planning' | 'area' | 'news';

        return {
          id: source.id.toString(),
          type,
          title: this.getTitle(type, source),
          description: this.getDescription(type, source),
          url: this.getUrl(type, source),
          score: hit._score || 0,
          highlights: hit.highlight,
        };
      });

      const took = Date.now() - startTime;

      return {
        results,
        total: (response.hits.total as any).value || 0,
        took,
      };
    } catch (error) {
      console.error('Search error:', error);
      return { results: [], total: 0, took: 0 };
    }
  }

  /**
   * Search properties only
   */
  async searchProperties(query: string, limit = 20): Promise<SearchResult[]> {
    try {
      const response = await esClient.search({
        index: 'properties',
        body: {
          size: limit,
          query: {
            multi_match: {
              query,
              fields: ['address^2', 'postcode^2', 'description'],
              fuzziness: 'AUTO',
            },
          },
        },
      });

      return this.mapResults(response.hits.hits, 'property');
    } catch (error) {
      console.error('Property search error:', error);
      return [];
    }
  }

  /**
   * Index a property
   */
  async indexProperty(property: any): Promise<void> {
    try {
      await esClient.index({
        index: 'properties',
        id: property.id.toString(),
        body: {
          id: property.id,
          address: `${property.addressLine1} ${property.addressLine2 || ''}`.trim(),
          postcode: property.postcode,
          property_type: property.propertyType,
          bedrooms: property.bedrooms,
          price: property.currentValue || property.lastSalePrice,
          description: `${property.propertyType || ''} property in ${property.postcode}`,
          slug: property.slug,
        },
      });
    } catch (error) {
      console.error('Error indexing property:', error);
    }
  }

  /**
   * Index a planning application
   */
  async indexPlanning(application: any): Promise<void> {
    try {
      await esClient.index({
        index: 'planning',
        id: application.id.toString(),
        body: {
          id: application.id,
          reference: application.reference,
          address: application.address,
          proposal: application.proposal,
          council: application.council,
          status: application.status,
          development_type: application.developmentType,
          slug: application.slug,
        },
      });
    } catch (error) {
      console.error('Error indexing planning:', error);
    }
  }

  /**
   * Index an area
   */
  async indexArea(area: any): Promise<void> {
    try {
      await esClient.index({
        index: 'areas',
        id: area.id.toString(),
        body: {
          id: area.id,
          name: area.name,
          postcode_prefix: area.postcodePrefix,
          description: area.description,
          council: area.council,
          slug: area.slug,
        },
      });
    } catch (error) {
      console.error('Error indexing area:', error);
    }
  }

  /**
   * Bulk index multiple documents
   */
  async bulkIndex(type: 'property' | 'planning' | 'area', documents: any[]): Promise<void> {
    try {
      const body = documents.flatMap((doc) => [
        { index: { _index: `${type}s`, _id: doc.id.toString() } },
        this.prepareDocument(type, doc),
      ]);

      await esClient.bulk({ body });
      console.log(`✅ Bulk indexed ${documents.length} ${type}s`);
    } catch (error) {
      console.error(`Error bulk indexing ${type}s:`, error);
    }
  }

  /**
   * Helper methods
   */
  private getTitle(type: string, source: any): string {
    switch (type) {
      case 'property':
        return source.address;
      case 'planning':
        return `${source.reference} - ${source.address}`;
      case 'area':
        return source.name;
      case 'news':
        return source.title;
      default:
        return '';
    }
  }

  private getDescription(type: string, source: any): string {
    switch (type) {
      case 'property':
        return `${source.property_type || ''} • ${source.bedrooms || '?'} bed • ${source.postcode}`;
      case 'planning':
        return source.proposal.substring(0, 150) + '...';
      case 'area':
        return source.description || '';
      case 'news':
        return source.excerpt || '';
      default:
        return '';
    }
  }

  private getUrl(type: string, source: any): string {
    switch (type) {
      case 'property':
        return `/property/${source.slug}`;
      case 'planning':
        return `/planning/${source.slug}`;
      case 'area':
        return `/areas/${source.slug}`;
      case 'news':
        return `/news/${source.slug}`;
      default:
        return '/';
    }
  }

  private mapResults(hits: any[], type: string): SearchResult[] {
    return hits.map((hit: any) => ({
      id: hit._source.id.toString(),
      type: type as any,
      title: this.getTitle(type, hit._source),
      description: this.getDescription(type, hit._source),
      url: this.getUrl(type, hit._source),
      score: hit._score || 0,
    }));
  }

  private prepareDocument(type: string, doc: any): any {
    // Prepare document based on type - implementation similar to individual index methods
    return doc;
  }
}

// Export singleton instance
export const searchService = new SearchService();
