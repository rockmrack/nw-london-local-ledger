/**
 * TypeScript wrapper for Property Processor WASM module
 * Provides high-performance property data processing
 */

import type { Property } from '@/types';

// Lazy-loaded WASM module
let wasmModule: any = null;
let processor: any = null;

export interface PropertyFilter {
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  propertyTypes?: string[];
  postcodes?: string[];
  minAreaSqft?: number;
  maxAreaSqft?: number;
  features?: string[];
  councilTaxBands?: string[];
  epcRatings?: string[];
}

export interface PropertyStats {
  totalCount: number;
  averagePrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePerSqft: number;
  averageBedrooms: number;
  propertyTypeDistribution: Record<string, number>;
  postcodeDistribution: Record<string, number>;
  pricePercentiles: Record<string, number>;
}

export interface SortConfig {
  field: 'price' | 'bedrooms' | 'area' | 'date';
  ascending: boolean;
}

class PropertyProcessorService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import WASM module
      wasmModule = await import('./pkg/property-processor/property_processor');
      await wasmModule.default();

      // Create processor instance
      processor = new wasmModule.PropertyProcessor();
      this.initialized = true;

      console.log('[PropertyProcessor] WASM module initialized');
    } catch (error) {
      console.error('[PropertyProcessor] Failed to initialize:', error);
      throw new Error('Failed to initialize PropertyProcessor WASM module');
    }
  }

  async loadProperties(properties: Property[]): Promise<number> {
    await this.ensureInitialized();

    const jsonStr = JSON.stringify(properties);
    return processor.loadProperties(jsonStr);
  }

  async filterProperties(filter: PropertyFilter): Promise<Property[]> {
    await this.ensureInitialized();

    const filterJson = JSON.stringify(filter);
    const resultJson = processor.filterProperties(filterJson);
    return JSON.parse(resultJson);
  }

  async sortProperties(sortConfig: SortConfig): Promise<Property[]> {
    await this.ensureInitialized();

    const configJson = JSON.stringify(sortConfig);
    const resultJson = processor.sortProperties(configJson);
    return JSON.parse(resultJson);
  }

  async calculateStats(): Promise<PropertyStats> {
    await this.ensureInitialized();

    const statsJson = processor.calculateStats();
    return JSON.parse(statsJson);
  }

  async batchTransform(
    transformFn: (property: Property) => Property
  ): Promise<Property[]> {
    await this.ensureInitialized();

    // Create a wrapper function that works with JSON strings
    const wasmTransformFn = (propertyJson: string) => {
      const property = JSON.parse(propertyJson);
      const transformed = transformFn(property);
      return JSON.stringify(transformed);
    };

    const resultJson = processor.batchTransform(wasmTransformFn);
    return JSON.parse(resultJson);
  }

  getCount(): number {
    if (!this.initialized) return 0;
    return processor.getCount();
  }

  clear(): void {
    if (!this.initialized) return;
    processor.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Performance comparison methods
  async benchmark(properties: Property[], iterations = 100): Promise<{
    wasm: number;
    js: number;
    speedup: number;
  }> {
    await this.ensureInitialized();

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await this.loadProperties(properties);
      await this.filterProperties({ minPrice: 500000, maxPrice: 1000000 });
      this.clear();
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.jsFilterProperties(properties, { minPrice: 500000, maxPrice: 1000000 });
    }
    const jsTime = performance.now() - jsStart;

    return {
      wasm: wasmTime,
      js: jsTime,
      speedup: jsTime / wasmTime,
    };
  }

  private jsFilterProperties(
    properties: Property[],
    filter: PropertyFilter
  ): Property[] {
    return properties.filter(property => {
      if (filter.minPrice && property.price < filter.minPrice) return false;
      if (filter.maxPrice && property.price > filter.maxPrice) return false;
      if (filter.minBedrooms && property.bedrooms < filter.minBedrooms) return false;
      if (filter.maxBedrooms && property.bedrooms > filter.maxBedrooms) return false;
      return true;
    });
  }
}

// Export singleton instance
export const propertyProcessorService = new PropertyProcessorService();

// Export types
export type { Property, PropertyProcessorService };