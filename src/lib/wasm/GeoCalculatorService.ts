/**
 * TypeScript wrapper for Geo Calculator WASM module
 * Provides high-performance geographic calculations
 */

let wasmModule: any = null;
let calculator: any = null;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface GeoPolygon {
  coordinates: LatLng[];
  holes?: LatLng[][];
  properties?: Record<string, string>;
}

export interface ProximityResult {
  id: string;
  distanceMeters: number;
  bearingDegrees: number;
  location: LatLng;
}

export interface ClusterResult {
  center: LatLng;
  count: number;
  bbox: BoundingBox;
  items: string[];
}

export interface LocationData {
  id: string;
  lat: number;
  lng: number;
}

class GeoCalculatorService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import WASM module
      wasmModule = await import('./pkg/geo-calculator/geo_calculator');
      await wasmModule.default();

      // Create calculator instance
      calculator = new wasmModule.GeoCalculator();
      this.initialized = true;

      console.log('[GeoCalculator] WASM module initialized');
    } catch (error) {
      console.error('[GeoCalculator] Failed to initialize:', error);
      throw new Error('Failed to initialize GeoCalculator WASM module');
    }
  }

  async calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): Promise<number> {
    await this.ensureInitialized();
    return calculator.calculateDistance(lat1, lng1, lat2, lng2);
  }

  async calculateBearing(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): Promise<number> {
    await this.ensureInitialized();
    return calculator.calculateBearing(lat1, lng1, lat2, lng2);
  }

  async calculateArea(polygon: GeoPolygon): Promise<number> {
    await this.ensureInitialized();
    const polygonJson = JSON.stringify(polygon);
    return calculator.calculateArea(polygonJson);
  }

  async isPointInPolygon(
    lat: number,
    lng: number,
    polygonId: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    return calculator.isPointInPolygon(lat, lng, polygonId);
  }

  async loadPolygon(id: string, polygon: GeoPolygon): Promise<void> {
    await this.ensureInitialized();
    const polygonJson = JSON.stringify(polygon);
    calculator.loadPolygon(id, polygonJson);
  }

  async buildSpatialIndex(locations: LocationData[]): Promise<number> {
    await this.ensureInitialized();
    const locationsJson = JSON.stringify(locations);
    return calculator.buildSpatialIndex(locationsJson);
  }

  async findNearest(
    lat: number,
    lng: number,
    maxResults: number
  ): Promise<ProximityResult[]> {
    await this.ensureInitialized();
    const resultJson = calculator.findNearest(lat, lng, maxResults);
    return JSON.parse(resultJson);
  }

  async findWithinRadius(
    lat: number,
    lng: number,
    radiusMeters: number
  ): Promise<ProximityResult[]> {
    await this.ensureInitialized();
    const resultJson = calculator.findWithinRadius(lat, lng, radiusMeters);
    return JSON.parse(resultJson);
  }

  async calculateBoundingBox(points: LatLng[]): Promise<BoundingBox> {
    await this.ensureInitialized();
    const pointsJson = JSON.stringify(points);
    const resultJson = calculator.calculateBoundingBox(pointsJson);
    return JSON.parse(resultJson);
  }

  async clusterPoints(
    points: LocationData[],
    clusterRadiusMeters: number
  ): Promise<ClusterResult[]> {
    await this.ensureInitialized();
    const pointsJson = JSON.stringify(points);
    const resultJson = calculator.clusterPoints(pointsJson, clusterRadiusMeters);
    return JSON.parse(resultJson);
  }

  async bboxIntersects(bbox1: BoundingBox, bbox2: BoundingBox): Promise<boolean> {
    await this.ensureInitialized();
    const bbox1Json = JSON.stringify(bbox1);
    const bbox2Json = JSON.stringify(bbox2);
    return calculator.bboxIntersects(bbox1Json, bbox2Json);
  }

  clear(): void {
    if (!this.initialized) return;
    calculator.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Utility methods for common use cases

  async findPropertiesNearTransport(
    properties: Array<{ id: string; lat: number; lng: number }>,
    transportStations: Array<{ id: string; lat: number; lng: number }>,
    maxDistanceMeters: number
  ): Promise<Map<string, ProximityResult[]>> {
    await this.ensureInitialized();

    // Build spatial index for transport stations
    await this.buildSpatialIndex(transportStations);

    const results = new Map<string, ProximityResult[]>();

    for (const property of properties) {
      const nearbyStations = await this.findWithinRadius(
        property.lat,
        property.lng,
        maxDistanceMeters
      );
      results.set(property.id, nearbyStations);
    }

    return results;
  }

  async createHeatmapClusters(
    points: LocationData[],
    zoomLevel: number
  ): Promise<ClusterResult[]> {
    // Adjust cluster radius based on zoom level
    const baseRadius = 5000; // 5km at zoom level 10
    const clusterRadius = baseRadius / Math.pow(2, zoomLevel - 10);

    return this.clusterPoints(points, clusterRadius);
  }

  async calculatePolygonCentroid(polygon: GeoPolygon): Promise<LatLng> {
    const coords = polygon.coordinates;
    if (coords.length === 0) {
      throw new Error('Polygon has no coordinates');
    }

    let sumLat = 0;
    let sumLng = 0;

    for (const coord of coords) {
      sumLat += coord.lat;
      sumLng += coord.lng;
    }

    return {
      lat: sumLat / coords.length,
      lng: sumLng / coords.length,
    };
  }

  // Performance comparison
  async benchmark(iterations = 1000): Promise<{
    wasm: number;
    js: number;
    speedup: number;
  }> {
    await this.ensureInitialized();

    const points: LatLng[] = Array.from({ length: 100 }, () => ({
      lat: 51.5 + Math.random() * 0.1,
      lng: -0.1 + Math.random() * 0.1,
    }));

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await this.calculateDistance(
        points[0].lat,
        points[0].lng,
        points[1].lat,
        points[1].lng
      );
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript (Haversine formula)
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.jsCalculateDistance(
        points[0].lat,
        points[0].lng,
        points[1].lat,
        points[1].lng
      );
    }
    const jsTime = performance.now() - jsStart;

    return {
      wasm: wasmTime,
      js: jsTime,
      speedup: jsTime / wasmTime,
    };
  }

  private jsCalculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

// Export singleton instance
export const geoCalculatorService = new GeoCalculatorService();

// Export types
export type { GeoCalculatorService };