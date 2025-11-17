/**
 * WASM Module Services
 * High-performance Rust-powered modules for compute-intensive operations
 */

import { propertyProcessorService } from './PropertyProcessorService';
import { geoCalculatorService } from './GeoCalculatorService';
import { statsEngineService } from './StatsEngineService';
import { searchOptimizerService } from './SearchOptimizerService';
import { dataTransformerService } from './DataTransformerService';

export {
  propertyProcessorService,
  geoCalculatorService,
  statsEngineService,
  searchOptimizerService,
  dataTransformerService,
};

// Initialize all WASM modules
export async function initializeWASM(): Promise<void> {
  console.log('[WASM] Initializing all modules...');

  const startTime = performance.now();

  try {
    await Promise.all([
      propertyProcessorService.initialize(),
      geoCalculatorService.initialize(),
      statsEngineService.initialize(),
      searchOptimizerService.initialize(),
      dataTransformerService.initialize(),
    ]);

    const elapsed = performance.now() - startTime;
    console.log(`[WASM] All modules initialized successfully in ${elapsed.toFixed(2)}ms`);
  } catch (error) {
    console.error('[WASM] Failed to initialize modules:', error);
    throw error;
  }
}

// Performance monitoring
export interface WASMPerformanceMetrics {
  module: string;
  operation: string;
  inputSize: number;
  timeMs: number;
  throughput: number;
}

class WASMPerformanceMonitor {
  private metrics: WASMPerformanceMetrics[] = [];
  private enabled = true;

  recordMetric(metric: WASMPerformanceMetrics): void {
    if (this.enabled) {
      this.metrics.push(metric);
    }
  }

  getMetrics(): WASMPerformanceMetrics[] {
    return [...this.metrics];
  }

  getAverageTime(module: string, operation: string): number {
    const relevantMetrics = this.metrics.filter(
      m => m.module === module && m.operation === operation
    );

    if (relevantMetrics.length === 0) return 0;

    const totalTime = relevantMetrics.reduce((sum, m) => sum + m.timeMs, 0);
    return totalTime / relevantMetrics.length;
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export const wasmPerformanceMonitor = new WASMPerformanceMonitor();

// Utility function to measure WASM operation performance
export async function measureWASMOperation<T>(
  module: string,
  operation: string,
  inputSize: number,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  const result = await fn();
  const elapsed = performance.now() - startTime;

  wasmPerformanceMonitor.recordMetric({
    module,
    operation,
    inputSize,
    timeMs: elapsed,
    throughput: inputSize / (elapsed / 1000), // items per second
  });

  return result;
}

// Export types
export type {
  PropertyFilter,
  PropertyStats,
  SortConfig,
} from './PropertyProcessorService';

export type {
  LatLng,
  BoundingBox,
  GeoPolygon,
  ProximityResult,
  ClusterResult,
  LocationData,
} from './GeoCalculatorService';

export type {
  StatisticsResult,
  CorrelationResult,
  RegressionResult,
  AggregationResult,
  Anomaly,
} from './StatsEngineService';

export type {
  SearchDocument,
  SearchQuery,
  SearchFilters,
  SearchResult,
  IndexStats,
} from './SearchOptimizerService';

export type {
  TransformConfig,
  TransformType,
  FilterConfig,
  BatchResult,
  TransformResult,
} from './DataTransformerService';