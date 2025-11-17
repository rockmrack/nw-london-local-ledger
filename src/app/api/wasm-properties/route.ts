/**
 * WASM-Optimized Properties API
 * Demonstrates integration with Rust WASM modules for 10x performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { propertyProcessorService, geoCalculatorService, statsEngineService } from '@/lib/wasm';
import { getCache, setCache } from '@/lib/cache/redis';
import { measureWASMOperation } from '@/lib/wasm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const params = {
      postcode: searchParams.get('postcode') || undefined,
      propertyType: searchParams.getAll('propertyType'),
      minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
      maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
      minBedrooms: searchParams.get('minBedrooms') ? parseInt(searchParams.get('minBedrooms')!) : undefined,
      maxBedrooms: searchParams.get('maxBedrooms') ? parseInt(searchParams.get('maxBedrooms')!) : undefined,
      lat: searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : undefined,
      lng: searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : undefined,
      radius: searchParams.get('radius') ? parseFloat(searchParams.get('radius')!) : 1000,
      sortBy: searchParams.get('sortBy') as 'price' | 'bedrooms' | 'area' | 'date' || 'price',
      ascending: searchParams.get('order') === 'asc',
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
      includeStats: searchParams.get('stats') === 'true',
    };

    // Generate cache key
    const cacheKey = `wasm:properties:${JSON.stringify(params)}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
      });
    }

    // Load properties from database (simulated here - in production, load from DB)
    const allProperties = await loadPropertiesFromDatabase();

    // Use WASM property processor for filtering and sorting
    const startTime = performance.now();

    // Load properties into WASM module
    await measureWASMOperation(
      'PropertyProcessor',
      'loadProperties',
      allProperties.length,
      () => propertyProcessorService.loadProperties(allProperties)
    );

    // Apply filters using WASM
    const filter = {
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      minBedrooms: params.minBedrooms,
      maxBedrooms: params.maxBedrooms,
      propertyTypes: params.propertyType.length > 0 ? params.propertyType : undefined,
      postcodes: params.postcode ? [params.postcode] : undefined,
    };

    let filteredProperties = await measureWASMOperation(
      'PropertyProcessor',
      'filterProperties',
      allProperties.length,
      () => propertyProcessorService.filterProperties(filter)
    );

    // Apply geographic filtering if coordinates provided
    if (params.lat && params.lng) {
      // Build spatial index
      const locations = filteredProperties.map(p => ({
        id: p.id,
        lat: p.latitude,
        lng: p.longitude,
      }));

      await measureWASMOperation(
        'GeoCalculator',
        'buildSpatialIndex',
        locations.length,
        () => geoCalculatorService.buildSpatialIndex(locations)
      );

      // Find properties within radius
      const nearbyResults = await measureWASMOperation(
        'GeoCalculator',
        'findWithinRadius',
        locations.length,
        () => geoCalculatorService.findWithinRadius(params.lat!, params.lng!, params.radius)
      );

      const nearbyIds = new Set(nearbyResults.map(r => r.id));
      filteredProperties = filteredProperties.filter(p => nearbyIds.has(p.id));

      // Add distance information
      filteredProperties = filteredProperties.map(p => {
        const result = nearbyResults.find(r => r.id === p.id);
        return {
          ...p,
          distance: result?.distanceMeters,
          bearing: result?.bearingDegrees,
        };
      });
    }

    // Sort using WASM
    await propertyProcessorService.loadProperties(filteredProperties);
    const sortedProperties = await measureWASMOperation(
      'PropertyProcessor',
      'sortProperties',
      filteredProperties.length,
      () => propertyProcessorService.sortProperties({
        field: params.sortBy,
        ascending: params.ascending,
      })
    );

    // Apply pagination
    const paginatedProperties = sortedProperties.slice(
      params.offset,
      params.offset + params.limit
    );

    // Calculate statistics if requested
    let statistics = null;
    if (params.includeStats && filteredProperties.length > 0) {
      const prices = filteredProperties.map(p => p.price);
      statistics = await measureWASMOperation(
        'StatsEngine',
        'calculateStats',
        prices.length,
        () => statsEngineService.calculateStats(prices)
      );

      // Add market insights
      const insights = await statsEngineService.analyzePriceDistribution(prices);
      statistics = { ...statistics, ...insights };
    }

    const processingTime = performance.now() - startTime;

    const response = {
      properties: paginatedProperties,
      total: filteredProperties.length,
      page: Math.floor(params.offset / params.limit) + 1,
      limit: params.limit,
      totalPages: Math.ceil(filteredProperties.length / params.limit),
      statistics,
      performance: {
        processingTimeMs: processingTime,
        wasmOptimized: true,
        modulesUsed: ['PropertyProcessor', 'GeoCalculator', 'StatsEngine'],
      },
    };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    // Clear WASM module data to free memory
    propertyProcessorService.clear();
    geoCalculatorService.clear();

    return NextResponse.json(response);
  } catch (error) {
    console.error('WASM Properties API error:', error);
    return NextResponse.json(
      { error: 'Failed to process properties' },
      { status: 500 }
    );
  }
}

// Simulated database loader (replace with actual DB query)
async function loadPropertiesFromDatabase() {
  // In production, this would query your database
  return [
    {
      id: '1',
      address: '123 Baker Street, London',
      postcode: 'NW1 6XE',
      price: 750000,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'flat',
      areaSqft: 850,
      latitude: 51.5237,
      longitude: -0.1585,
      listingDate: '2024-01-15',
      features: ['garden', 'parking'],
      councilTaxBand: 'D',
      epcRating: 'C',
    },
    // Add more properties...
  ];
}

// POST endpoint for batch processing
export async function POST(request: NextRequest) {
  try {
    const { properties, operations } = await request.json();

    if (!properties || !Array.isArray(properties)) {
      return NextResponse.json(
        { error: 'Properties array is required' },
        { status: 400 }
      );
    }

    const results: any = {
      processed: properties.length,
      operations: {},
    };

    // Load properties
    await propertyProcessorService.loadProperties(properties);

    // Execute requested operations
    for (const operation of operations) {
      switch (operation.type) {
        case 'filter':
          results.operations.filter = await propertyProcessorService.filterProperties(operation.config);
          break;

        case 'stats':
          results.operations.stats = await propertyProcessorService.calculateStats();
          break;

        case 'cluster':
          const locations = properties.map(p => ({
            id: p.id,
            lat: p.latitude,
            lng: p.longitude,
          }));
          await geoCalculatorService.buildSpatialIndex(locations);
          results.operations.clusters = await geoCalculatorService.clusterPoints(
            locations,
            operation.radius || 1000
          );
          break;

        case 'transform':
          results.operations.transformed = await propertyProcessorService.batchTransform(
            operation.transformFn || (p => p)
          );
          break;

        default:
          console.warn(`Unknown operation type: ${operation.type}`);
      }
    }

    // Clean up
    propertyProcessorService.clear();
    geoCalculatorService.clear();

    return NextResponse.json(results);
  } catch (error) {
    console.error('Batch processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process batch operations' },
      { status: 500 }
    );
  }
}