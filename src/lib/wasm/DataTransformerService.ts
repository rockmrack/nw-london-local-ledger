/**
 * TypeScript wrapper for Data Transformer WASM module
 * Provides high-performance data transformation and compression
 */

let wasmModule: any = null;
let transformer: any = null;

export interface TransformConfig {
  fieldsToKeep?: string[];
  fieldsToRemove?: string[];
  fieldMappings?: Record<string, string>;
  fieldTransforms?: Record<string, TransformType>;
  filters?: FilterConfig[];
  aggregations?: AggregationConfig[];
}

export type TransformType =
  | { type: 'lowercase' }
  | { type: 'uppercase' }
  | { type: 'trim' }
  | { type: 'round'; decimals: number }
  | { type: 'multiply'; factor: number }
  | { type: 'add'; amount: number }
  | { type: 'dateFormat'; format: string }
  | { type: 'replace'; from: string; to: string }
  | { type: 'hash' }
  | { type: 'truncate'; maxLength: number };

export interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: any;
}

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn';

export interface AggregationConfig {
  groupBy: string[];
  aggregates: AggregateFunction[];
}

export interface AggregateFunction {
  field: string;
  function: 'sum' | 'average' | 'min' | 'max' | 'count' | 'countDistinct';
  alias: string;
}

export interface BatchResult {
  processed: number;
  filtered: number;
  errors: string[];
  timeMs: number;
}

export interface TransformResult {
  data: any[];
  metadata: BatchResult;
}

class DataTransformerService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import WASM module
      wasmModule = await import('./pkg/data-transformer/data_transformer');
      await wasmModule.default();

      // Create transformer instance
      transformer = new wasmModule.DataTransformer();
      this.initialized = true;

      console.log('[DataTransformer] WASM module initialized');
    } catch (error) {
      console.error('[DataTransformer] Failed to initialize:', error);
      throw new Error('Failed to initialize DataTransformer WASM module');
    }
  }

  async parseJson(jsonStr: string): Promise<any> {
    await this.ensureInitialized();
    const resultJson = transformer.parseJson(jsonStr);
    return JSON.parse(resultJson);
  }

  async serializeJson(data: any): Promise<string> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    return transformer.serializeJson(dataJson);
  }

  async compress(data: string): Promise<Uint8Array> {
    await this.ensureInitialized();
    return transformer.compress(data);
  }

  async decompress(compressedData: Uint8Array): Promise<string> {
    await this.ensureInitialized();
    return transformer.decompress(compressedData);
  }

  async compressLZ4(data: string): Promise<Uint8Array> {
    await this.ensureInitialized();
    return transformer.compressLZ4(data);
  }

  async decompressLZ4(compressedData: Uint8Array): Promise<string> {
    await this.ensureInitialized();
    return transformer.decompressLZ4(compressedData);
  }

  async transformBatch(data: any[], config: TransformConfig): Promise<TransformResult> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const configJson = JSON.stringify(this.normalizeConfig(config));
    const resultJson = transformer.transformBatch(dataJson, configJson);
    return JSON.parse(resultJson);
  }

  async streamProcess(
    data: any[],
    chunkSize: number,
    processor: (chunk: any[]) => any[]
  ): Promise<any[]> {
    await this.ensureInitialized();

    const wasmProcessor = (chunkJson: string) => {
      const chunk = JSON.parse(chunkJson);
      const processed = processor(chunk);
      return JSON.stringify(processed);
    };

    const dataJson = JSON.stringify(data);
    const resultJson = transformer.streamProcess(dataJson, chunkSize, wasmProcessor);
    return JSON.parse(resultJson);
  }

  async aggregate(data: any[], config: AggregationConfig): Promise<any[]> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const configJson = JSON.stringify(config);
    const resultJson = transformer.aggregate(dataJson, configJson);
    return JSON.parse(resultJson);
  }

  setCompressionLevel(level: number): void {
    if (!this.initialized) return;
    transformer.setCompressionLevel(Math.min(9, Math.max(0, level)));
  }

  clearCache(): void {
    if (!this.initialized) return;
    transformer.clearCache();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private normalizeConfig(config: TransformConfig): any {
    const normalized: any = { ...config };

    // Convert TypeScript transform types to WASM format
    if (config.fieldTransforms) {
      const transforms: any = {};
      for (const [field, transform] of Object.entries(config.fieldTransforms)) {
        if (typeof transform === 'object' && 'type' in transform) {
          const { type, ...params } = transform as any;
          transforms[field] = this.convertTransformType(type, params);
        }
      }
      normalized.field_transforms = transforms;
      delete normalized.fieldTransforms;
    }

    // Convert camelCase to snake_case for WASM
    if (config.fieldsToKeep) {
      normalized.fields_to_keep = config.fieldsToKeep;
      delete normalized.fieldsToKeep;
    }
    if (config.fieldsToRemove) {
      normalized.fields_to_remove = config.fieldsToRemove;
      delete normalized.fieldsToRemove;
    }
    if (config.fieldMappings) {
      normalized.field_mappings = config.fieldMappings;
      delete normalized.fieldMappings;
    }

    return normalized;
  }

  private convertTransformType(type: string, params: any): any {
    switch (type) {
      case 'lowercase':
        return 'Lowercase';
      case 'uppercase':
        return 'Uppercase';
      case 'trim':
        return 'Trim';
      case 'round':
        return { Round: params.decimals };
      case 'multiply':
        return { Multiply: params.factor };
      case 'add':
        return { Add: params.amount };
      case 'dateFormat':
        return { DateFormat: params.format };
      case 'replace':
        return { Replace: [params.from, params.to] };
      case 'hash':
        return 'Hash';
      case 'truncate':
        return { Truncate: params.maxLength };
      default:
        return 'Trim';
    }
  }

  // Utility methods for common transformations

  async cleanPropertyData(properties: any[]): Promise<any[]> {
    const config: TransformConfig = {
      fieldsToRemove: ['_id', '__v', 'createdAt', 'updatedAt'],
      fieldTransforms: {
        address: { type: 'trim' },
        postcode: { type: 'uppercase' },
        price: { type: 'round', decimals: 0 },
        description: { type: 'truncate', maxLength: 500 },
      },
      filters: [
        {
          field: 'price',
          operator: 'greaterThan',
          value: 0,
        },
      ],
    };

    const result = await this.transformBatch(properties, config);
    return result.data;
  }

  async compressApiResponse(data: any): Promise<{
    compressed: Uint8Array;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }> {
    const jsonStr = JSON.stringify(data);
    const originalSize = new TextEncoder().encode(jsonStr).length;

    const compressed = await this.compressLZ4(jsonStr);
    const compressedSize = compressed.length;

    return {
      compressed,
      originalSize,
      compressedSize,
      compressionRatio: originalSize / compressedSize,
    };
  }

  async aggregatePropertyStats(properties: any[]): Promise<any[]> {
    const priceData = properties.map(p => p.price);
    const areas = properties.map(p => p.area || 'Unknown');

    const config: AggregationConfig = {
      groupBy: ['area'],
      aggregates: [
        { field: 'price', function: 'average', alias: 'avgPrice' },
        { field: 'price', function: 'min', alias: 'minPrice' },
        { field: 'price', function: 'max', alias: 'maxPrice' },
        { field: 'id', function: 'count', alias: 'propertyCount' },
      ],
    };

    const dataWithArea = properties.map((p, i) => ({
      ...p,
      area: areas[i],
    }));

    return this.aggregate(dataWithArea, config);
  }

  async processLargeDataset<T>(
    data: T[],
    chunkSize = 1000,
    transform: (item: T) => T
  ): Promise<T[]> {
    return this.streamProcess(data, chunkSize, (chunk: T[]) =>
      chunk.map(transform)
    );
  }

  // Base64 utilities
  async base64Encode(data: Uint8Array): Promise<string> {
    await this.ensureInitialized();
    return wasmModule.base64Encode(data);
  }

  async base64Decode(encoded: string): Promise<Uint8Array> {
    await this.ensureInitialized();
    return wasmModule.base64Decode(encoded);
  }

  // Performance comparison
  async benchmark(dataSize = 1000, iterations = 100): Promise<{
    wasm: number;
    js: number;
    speedup: number;
  }> {
    await this.ensureInitialized();

    const data = Array.from({ length: dataSize }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random() * 1000,
      category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    }));

    const config: TransformConfig = {
      fieldsToKeep: ['id', 'name', 'value'],
      fieldTransforms: {
        name: { type: 'uppercase' },
        value: { type: 'round', decimals: 2 },
      },
    };

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await this.transformBatch(data, config);
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.jsTransformBatch(data, config);
    }
    const jsTime = performance.now() - jsStart;

    return {
      wasm: wasmTime,
      js: jsTime,
      speedup: jsTime / wasmTime,
    };
  }

  private jsTransformBatch(data: any[], config: TransformConfig): any[] {
    return data.map(item => {
      const transformed = { ...item };

      // Apply field keeping
      if (config.fieldsToKeep) {
        const kept: any = {};
        for (const field of config.fieldsToKeep) {
          if (field in transformed) {
            kept[field] = transformed[field];
          }
        }
        Object.keys(transformed).forEach(key => delete transformed[key]);
        Object.assign(transformed, kept);
      }

      // Apply field removal
      if (config.fieldsToRemove) {
        for (const field of config.fieldsToRemove) {
          delete transformed[field];
        }
      }

      // Apply transforms
      if (config.fieldTransforms) {
        for (const [field, transform] of Object.entries(config.fieldTransforms)) {
          if (field in transformed) {
            const t = transform as any;
            switch (t.type) {
              case 'uppercase':
                transformed[field] = String(transformed[field]).toUpperCase();
                break;
              case 'lowercase':
                transformed[field] = String(transformed[field]).toLowerCase();
                break;
              case 'round':
                transformed[field] = Math.round(transformed[field] * Math.pow(10, t.decimals)) / Math.pow(10, t.decimals);
                break;
            }
          }
        }
      }

      return transformed;
    });
  }
}

// Export singleton instance
export const dataTransformerService = new DataTransformerService();

// Export types
export type { DataTransformerService };