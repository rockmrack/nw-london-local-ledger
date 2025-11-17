/**
 * TypeScript wrapper for Search Optimizer WASM module
 * Provides high-performance search and indexing
 */

let wasmModule: any = null;
let optimizer: any = null;

export interface SearchDocument {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  score?: number;
  metadata?: Record<string, string>;
}

export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  boostFields?: Record<string, number>;
  fuzzy?: boolean;
  fuzzyDistance?: number;
}

export interface SearchFilters {
  categories?: string[];
  tags?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
  scoreThreshold?: number;
}

export interface SearchResult {
  documents: SearchDocument[];
  total: number;
  tookMs: number;
  facets?: Record<string, Record<string, number>>;
}

export interface IndexStats {
  totalDocuments: number;
  totalTerms: number;
  avgDocumentLength: number;
  categories: number;
  tags: number;
}

class SearchOptimizerService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import WASM module
      wasmModule = await import('./pkg/search-optimizer/search_optimizer');
      await wasmModule.default();

      // Create optimizer instance
      optimizer = new wasmModule.SearchOptimizer();
      this.initialized = true;

      console.log('[SearchOptimizer] WASM module initialized');
    } catch (error) {
      console.error('[SearchOptimizer] Failed to initialize:', error);
      throw new Error('Failed to initialize SearchOptimizer WASM module');
    }
  }

  async loadDocuments(documents: SearchDocument[]): Promise<number> {
    await this.ensureInitialized();
    const documentsJson = JSON.stringify(documents);
    return optimizer.loadDocuments(documentsJson);
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    await this.ensureInitialized();
    const queryJson = JSON.stringify(query);
    const resultJson = optimizer.search(queryJson);
    return JSON.parse(resultJson);
  }

  async getSuggestions(prefix: string, limit = 10): Promise<string[]> {
    await this.ensureInitialized();
    const resultJson = optimizer.getSuggestions(prefix, limit);
    return JSON.parse(resultJson);
  }

  async batchScore(queries: string[]): Promise<Array<Array<[string, number]>>> {
    await this.ensureInitialized();
    const queriesJson = JSON.stringify(queries);
    const resultJson = optimizer.batchScore(queriesJson);
    return JSON.parse(resultJson);
  }

  async getIndexStats(): Promise<IndexStats> {
    await this.ensureInitialized();
    const statsJson = optimizer.getIndexStats();
    return JSON.parse(statsJson);
  }

  clear(): void {
    if (!this.initialized) return;
    optimizer.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Utility methods for property and planning search

  async searchProperties(
    query: string,
    filters?: {
      propertyTypes?: string[];
      priceRange?: [number, number];
      locations?: string[];
    }
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      filters: {
        categories: filters?.propertyTypes,
        tags: filters?.locations,
      },
      boostFields: {
        title: 2.0, // Boost title matches
        'residential': 1.5, // Boost residential properties
      },
      fuzzy: true,
      fuzzyDistance: 2,
      limit: 20,
    };

    return this.search(searchQuery);
  }

  async searchPlanningApplications(
    query: string,
    status?: string[],
    councils?: string[]
  ): Promise<SearchResult> {
    const searchQuery: SearchQuery = {
      query,
      filters: {
        categories: status,
        tags: councils,
      },
      boostFields: {
        title: 1.5,
        'approved': 1.2, // Slightly boost approved applications
      },
      limit: 50,
    };

    return this.search(searchQuery);
  }

  async buildPropertyIndex(properties: any[]): Promise<number> {
    const documents: SearchDocument[] = properties.map(property => ({
      id: property.id,
      title: `${property.bedrooms} bed ${property.propertyType} in ${property.address}`,
      content: `${property.description || ''} ${property.features?.join(' ') || ''}`,
      tags: [
        property.postcode,
        property.area,
        property.councilTaxBand,
        property.epcRating,
      ].filter(Boolean),
      category: property.propertyType,
    }));

    return this.loadDocuments(documents);
  }

  async autocompletAddress(prefix: string): Promise<string[]> {
    const suggestions = await this.getSuggestions(prefix, 20);

    // Filter and format for addresses
    return suggestions
      .filter(s => s.length > 3)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1));
  }

  async findSimilarProperties(
    propertyId: string,
    limit = 10
  ): Promise<SearchDocument[]> {
    const stats = await this.getIndexStats();

    // Get the current property document
    const searchResult = await this.search({
      query: propertyId,
      limit: 1,
    });

    if (searchResult.documents.length === 0) {
      return [];
    }

    const currentProperty = searchResult.documents[0];

    // Search for similar properties based on content
    const similarResult = await this.search({
      query: currentProperty.content.slice(0, 100), // Use part of content
      filters: {
        categories: [currentProperty.category],
      },
      limit: limit + 1, // Get one extra to remove self
    });

    // Remove the original property from results
    return similarResult.documents.filter(doc => doc.id !== propertyId).slice(0, limit);
  }

  // Performance comparison
  async benchmark(documents: SearchDocument[], queries: string[], iterations = 100): Promise<{
    wasm: number;
    js: number;
    speedup: number;
  }> {
    await this.ensureInitialized();

    // Load documents for WASM
    await this.loadDocuments(documents);

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const query of queries) {
        await this.search({ query, limit: 10 });
      }
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      for (const query of queries) {
        this.jsSearch(documents, query, 10);
      }
    }
    const jsTime = performance.now() - jsStart;

    this.clear();

    return {
      wasm: wasmTime,
      js: jsTime,
      speedup: jsTime / wasmTime,
    };
  }

  private jsSearch(documents: SearchDocument[], query: string, limit: number): SearchDocument[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = documents.map(doc => {
      let score = 0;
      const titleLower = doc.title.toLowerCase();
      const contentLower = doc.content.toLowerCase();

      for (const term of queryTerms) {
        if (titleLower.includes(term)) score += 2;
        if (contentLower.includes(term)) score += 1;
        if (doc.tags.some(tag => tag.toLowerCase().includes(term))) score += 0.5;
      }

      return { doc, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({ ...item.doc, score: item.score }));
  }
}

// Export singleton instance
export const searchOptimizerService = new SearchOptimizerService();

// Export types
export type { SearchOptimizerService };