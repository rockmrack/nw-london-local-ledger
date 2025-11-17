/**
 * WASM Benchmark API
 * Compare performance between WASM and JavaScript implementations
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  propertyProcessorService,
  geoCalculatorService,
  statsEngineService,
  searchOptimizerService,
  dataTransformerService,
} from '@/lib/wasm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dataSize = parseInt(searchParams.get('size') || '1000');
    const iterations = parseInt(searchParams.get('iterations') || '100');

    console.log(`Running WASM benchmark with ${dataSize} items, ${iterations} iterations...`);

    const results: any = {
      dataSize,
      iterations,
      benchmarks: {},
      summary: {
        totalSpeedup: 0,
        modules: [],
      },
    };

    // Generate test data
    const testProperties = generateTestProperties(dataSize);
    const testNumbers = Array.from({ length: dataSize }, () => Math.random() * 1000000);
    const testDocuments = generateTestDocuments(Math.min(dataSize, 1000));
    const testData = generateTestData(dataSize);

    // 1. PropertyProcessor Benchmark
    console.log('Benchmarking PropertyProcessor...');
    const propertyBenchmark = await propertyProcessorService.benchmark(testProperties, iterations);
    results.benchmarks.propertyProcessor = {
      ...propertyBenchmark,
      operations: ['filter', 'sort', 'stats'],
    };

    // 2. GeoCalculator Benchmark
    console.log('Benchmarking GeoCalculator...');
    const geoBenchmark = await geoCalculatorService.benchmark(iterations * 10);
    results.benchmarks.geoCalculator = {
      ...geoBenchmark,
      operations: ['distance', 'bearing', 'spatial-index'],
    };

    // 3. StatsEngine Benchmark
    console.log('Benchmarking StatsEngine...');
    const statsBenchmark = await statsEngineService.benchmark(dataSize, iterations);
    results.benchmarks.statsEngine = {
      ...statsBenchmark,
      operations: ['mean', 'median', 'std-dev', 'percentiles'],
    };

    // 4. SearchOptimizer Benchmark
    console.log('Benchmarking SearchOptimizer...');
    const searchQueries = ['london', 'property', 'flat', '2 bedroom'];
    const searchBenchmark = await searchOptimizerService.benchmark(
      testDocuments,
      searchQueries,
      Math.floor(iterations / 10)
    );
    results.benchmarks.searchOptimizer = {
      ...searchBenchmark,
      operations: ['index', 'search', 'rank'],
    };

    // 5. DataTransformer Benchmark
    console.log('Benchmarking DataTransformer...');
    const transformBenchmark = await dataTransformerService.benchmark(dataSize, iterations);
    results.benchmarks.dataTransformer = {
      ...transformBenchmark,
      operations: ['parse', 'transform', 'compress'],
    };

    // Calculate summary
    const speedups = Object.values(results.benchmarks).map((b: any) => b.speedup);
    results.summary.totalSpeedup = speedups.reduce((a, b) => a + b, 0) / speedups.length;
    results.summary.modules = Object.keys(results.benchmarks);

    // Add performance comparison
    results.comparison = {
      totalJsTime: Object.values(results.benchmarks).reduce((sum: number, b: any) => sum + b.js, 0),
      totalWasmTime: Object.values(results.benchmarks).reduce((sum: number, b: any) => sum + b.wasm, 0),
    };
    results.comparison.overallSpeedup =
      results.comparison.totalJsTime / results.comparison.totalWasmTime;

    // Add recommendations
    results.recommendations = generateRecommendations(results.benchmarks);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Benchmark error:', error);
    return NextResponse.json(
      { error: 'Failed to run benchmark' },
      { status: 500 }
    );
  }
}

// POST endpoint for custom benchmark
export async function POST(request: NextRequest) {
  try {
    const { module, operation, data, iterations = 100 } = await request.json();

    let result;
    const startTime = performance.now();

    switch (module) {
      case 'propertyProcessor':
        await propertyProcessorService.loadProperties(data);
        for (let i = 0; i < iterations; i++) {
          if (operation === 'filter') {
            await propertyProcessorService.filterProperties({ minPrice: 500000 });
          } else if (operation === 'sort') {
            await propertyProcessorService.sortProperties({ field: 'price', ascending: true });
          } else if (operation === 'stats') {
            await propertyProcessorService.calculateStats();
          }
        }
        propertyProcessorService.clear();
        break;

      case 'geoCalculator':
        if (operation === 'distance') {
          for (let i = 0; i < iterations; i++) {
            for (const point of data) {
              await geoCalculatorService.calculateDistance(
                point.lat1,
                point.lng1,
                point.lat2,
                point.lng2
              );
            }
          }
        } else if (operation === 'cluster') {
          for (let i = 0; i < iterations; i++) {
            await geoCalculatorService.clusterPoints(data, 1000);
          }
        }
        break;

      case 'statsEngine':
        for (let i = 0; i < iterations; i++) {
          if (operation === 'stats') {
            await statsEngineService.calculateStats(data);
          } else if (operation === 'correlation') {
            await statsEngineService.calculateCorrelation(data.x, data.y);
          } else if (operation === 'regression') {
            await statsEngineService.linearRegression(data.x, data.y);
          }
        }
        break;

      case 'searchOptimizer':
        await searchOptimizerService.loadDocuments(data.documents);
        for (let i = 0; i < iterations; i++) {
          if (operation === 'search') {
            for (const query of data.queries) {
              await searchOptimizerService.search({ query, limit: 10 });
            }
          }
        }
        searchOptimizerService.clear();
        break;

      case 'dataTransformer':
        for (let i = 0; i < iterations; i++) {
          if (operation === 'compress') {
            const compressed = await dataTransformerService.compress(JSON.stringify(data));
            await dataTransformerService.decompress(compressed);
          } else if (operation === 'transform') {
            await dataTransformerService.transformBatch(data, {
              fieldsToKeep: ['id', 'name', 'value'],
              fieldTransforms: {
                name: { type: 'uppercase' },
              },
            });
          }
        }
        break;

      default:
        throw new Error(`Unknown module: ${module}`);
    }

    const elapsedTime = performance.now() - startTime;

    result = {
      module,
      operation,
      dataSize: Array.isArray(data) ? data.length : 1,
      iterations,
      totalTimeMs: elapsedTime,
      avgTimeMs: elapsedTime / iterations,
      throughput: (Array.isArray(data) ? data.length : 1) * iterations / (elapsedTime / 1000),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Custom benchmark error:', error);
    return NextResponse.json(
      { error: 'Failed to run custom benchmark' },
      { status: 500 }
    );
  }
}

// Helper functions
function generateTestProperties(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `prop-${i}`,
    address: `${i} Test Street, London`,
    postcode: `NW${(i % 10) + 1} ${i % 9}XY`,
    price: 200000 + Math.random() * 1800000,
    bedrooms: Math.floor(Math.random() * 5) + 1,
    bathrooms: Math.floor(Math.random() * 3) + 1,
    propertyType: ['flat', 'house', 'terraced', 'detached'][Math.floor(Math.random() * 4)],
    areaSqft: 500 + Math.random() * 2500,
    latitude: 51.5 + Math.random() * 0.1,
    longitude: -0.2 + Math.random() * 0.3,
    listingDate: new Date(2024, 0, 1 + (i % 365)).toISOString(),
    features: ['parking', 'garden', 'balcony'].slice(0, Math.floor(Math.random() * 3) + 1),
    councilTaxBand: String.fromCharCode(65 + Math.floor(Math.random() * 8)),
    epcRating: String.fromCharCode(65 + Math.floor(Math.random() * 7)),
  }));
}

function generateTestDocuments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    title: `Document ${i}: ${['London Property', 'Real Estate News', 'Market Update'][i % 3]}`,
    content: `This is test content for document ${i}. It contains information about properties, real estate, and market trends in London.`,
    tags: ['property', 'london', 'real-estate', 'market'].slice(0, Math.floor(Math.random() * 4) + 1),
    category: ['news', 'analysis', 'listing'][i % 3],
  }));
}

function generateTestData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    value: Math.random() * 1000,
    category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    timestamp: Date.now() - Math.floor(Math.random() * 86400000),
  }));
}

function generateRecommendations(benchmarks: any) {
  const recommendations = [];

  for (const [module, results] of Object.entries(benchmarks)) {
    const { speedup } = results as any;

    if (speedup > 10) {
      recommendations.push({
        module,
        priority: 'high',
        message: `Excellent ${speedup.toFixed(1)}x speedup - use for all ${module} operations`,
      });
    } else if (speedup > 5) {
      recommendations.push({
        module,
        priority: 'medium',
        message: `Good ${speedup.toFixed(1)}x speedup - recommended for large datasets`,
      });
    } else if (speedup > 2) {
      recommendations.push({
        module,
        priority: 'low',
        message: `Moderate ${speedup.toFixed(1)}x speedup - use for performance-critical paths`,
      });
    } else {
      recommendations.push({
        module,
        priority: 'info',
        message: `Limited speedup (${speedup.toFixed(1)}x) - consider for specific use cases`,
      });
    }
  }

  return recommendations;
}