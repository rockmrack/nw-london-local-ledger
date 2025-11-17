/**
 * TypeScript wrapper for Stats Engine WASM module
 * Provides high-performance statistical calculations
 */

let wasmModule: any = null;
let engine: any = null;

export interface StatisticsResult {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  range: number;
  percentiles: Record<number, number>;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
    iqr: number;
  };
  outliers: number[];
  skewness: number;
  kurtosis: number;
}

export interface CorrelationResult {
  pearson: number;
  spearman: number;
  rSquared: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  standardError: number;
  predictions: number[];
}

export interface AggregationConfig {
  groupBy: string[];
  aggregates: Array<{
    field: string;
    function: 'sum' | 'average' | 'min' | 'max' | 'count' | 'countDistinct';
    alias: string;
  }>;
}

export interface GroupStats {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
}

export interface AggregationResult {
  groups: Record<string, GroupStats>;
  totalCount: number;
  totalSum: number;
}

export interface Anomaly {
  index: number;
  value: number;
  zScore: number;
}

class StatsEngineService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import WASM module
      wasmModule = await import('./pkg/stats-engine/stats_engine');
      await wasmModule.default();

      // Create engine instance
      engine = new wasmModule.StatsEngine();
      this.initialized = true;

      console.log('[StatsEngine] WASM module initialized');
    } catch (error) {
      console.error('[StatsEngine] Failed to initialize:', error);
      throw new Error('Failed to initialize StatsEngine WASM module');
    }
  }

  async calculateStats(data: number[]): Promise<StatisticsResult> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const resultJson = engine.calculateStats(dataJson);
    return JSON.parse(resultJson);
  }

  async calculateCorrelation(x: number[], y: number[]): Promise<CorrelationResult> {
    await this.ensureInitialized();
    const xJson = JSON.stringify(x);
    const yJson = JSON.stringify(y);
    const resultJson = engine.calculateCorrelation(xJson, yJson);
    return JSON.parse(resultJson);
  }

  async linearRegression(x: number[], y: number[]): Promise<RegressionResult> {
    await this.ensureInitialized();
    const xJson = JSON.stringify(x);
    const yJson = JSON.stringify(y);
    const resultJson = engine.linearRegression(xJson, yJson);
    return JSON.parse(resultJson);
  }

  async aggregateByGroup(
    data: number[],
    groups: string[]
  ): Promise<AggregationResult> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const groupsJson = JSON.stringify(groups);
    const resultJson = engine.aggregateByGroup(dataJson, groupsJson);
    return JSON.parse(resultJson);
  }

  async movingAverage(data: number[], windowSize: number): Promise<number[]> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const resultJson = engine.movingAverage(dataJson, windowSize);
    return JSON.parse(resultJson);
  }

  async exponentialSmoothing(data: number[], alpha: number): Promise<number[]> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const resultJson = engine.exponentialSmoothing(dataJson, alpha);
    return JSON.parse(resultJson);
  }

  async detectAnomalies(data: number[], zThreshold = 3): Promise<Anomaly[]> {
    await this.ensureInitialized();
    const dataJson = JSON.stringify(data);
    const resultJson = engine.detectAnomalies(dataJson, zThreshold);
    return JSON.parse(resultJson);
  }

  clear(): void {
    if (!this.initialized) return;
    engine.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // Utility methods for property-specific calculations

  async analyzePriceDistribution(prices: number[]): Promise<{
    stats: StatisticsResult;
    priceRanges: Record<string, number>;
    insights: string[];
  }> {
    const stats = await this.calculateStats(prices);

    // Create price ranges
    const priceRanges: Record<string, number> = {
      '< 250k': 0,
      '250k-500k': 0,
      '500k-750k': 0,
      '750k-1m': 0,
      '1m-2m': 0,
      '> 2m': 0,
    };

    for (const price of prices) {
      if (price < 250000) priceRanges['< 250k']++;
      else if (price < 500000) priceRanges['250k-500k']++;
      else if (price < 750000) priceRanges['500k-750k']++;
      else if (price < 1000000) priceRanges['750k-1m']++;
      else if (price < 2000000) priceRanges['1m-2m']++;
      else priceRanges['> 2m']++;
    }

    // Generate insights
    const insights: string[] = [];

    if (stats.skewness > 0.5) {
      insights.push('Price distribution is right-skewed (more lower-priced properties)');
    } else if (stats.skewness < -0.5) {
      insights.push('Price distribution is left-skewed (more higher-priced properties)');
    } else {
      insights.push('Price distribution is relatively symmetric');
    }

    if (stats.outliers.length > stats.count * 0.05) {
      insights.push(`${stats.outliers.length} outlier properties detected (${(
        (stats.outliers.length / stats.count) *
        100
      ).toFixed(1)}%)`);
    }

    const coefficientOfVariation = (stats.stdDev / stats.mean) * 100;
    if (coefficientOfVariation > 50) {
      insights.push('High price variability in the market');
    } else if (coefficientOfVariation < 20) {
      insights.push('Low price variability - stable market');
    }

    return { stats, priceRanges, insights };
  }

  async calculateMarketTrend(
    prices: number[],
    timestamps: number[]
  ): Promise<{
    trend: 'rising' | 'falling' | 'stable';
    changePercent: number;
    regression: RegressionResult;
    forecast: number[];
  }> {
    const regression = await this.linearRegression(timestamps, prices);

    // Determine trend based on slope
    let trend: 'rising' | 'falling' | 'stable';
    const changePercent = (regression.slope / prices[0]) * 100;

    if (Math.abs(changePercent) < 2) {
      trend = 'stable';
    } else if (changePercent > 0) {
      trend = 'rising';
    } else {
      trend = 'falling';
    }

    // Create forecast for next 3 periods
    const lastTimestamp = timestamps[timestamps.length - 1];
    const timeStep = timestamps[1] - timestamps[0];
    const forecast: number[] = [];

    for (let i = 1; i <= 3; i++) {
      const futureTime = lastTimestamp + i * timeStep;
      const predictedPrice = regression.slope * futureTime + regression.intercept;
      forecast.push(predictedPrice);
    }

    return { trend, changePercent, regression, forecast };
  }

  async findSeasonality(data: number[], period = 12): Promise<{
    seasonal: number[];
    deseasonalized: number[];
    seasonalStrength: number;
  }> {
    const movingAvg = await this.movingAverage(data, period);

    // Calculate seasonal component
    const seasonal: number[] = [];
    const deseasonalized: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if (i < movingAvg.length) {
        const seasonalFactor = data[i] / movingAvg[i];
        seasonal.push(seasonalFactor);
        deseasonalized.push(data[i] / seasonalFactor);
      } else {
        seasonal.push(1);
        deseasonalized.push(data[i]);
      }
    }

    // Calculate seasonal strength
    const seasonalVariance = await this.calculateStats(seasonal);
    const seasonalStrength = seasonalVariance.stdDev;

    return { seasonal, deseasonalized, seasonalStrength };
  }

  // Performance comparison
  async benchmark(dataSize = 10000, iterations = 100): Promise<{
    wasm: number;
    js: number;
    speedup: number;
  }> {
    await this.ensureInitialized();

    const data = Array.from({ length: dataSize }, () => Math.random() * 1000000);

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await this.calculateStats(data);
    }
    const wasmTime = performance.now() - wasmStart;

    // Benchmark JavaScript
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      this.jsCalculateStats(data);
    }
    const jsTime = performance.now() - jsStart;

    return {
      wasm: wasmTime,
      js: jsTime,
      speedup: jsTime / wasmTime,
    };
  }

  private jsCalculateStats(data: number[]): any {
    const sorted = [...data].sort((a, b) => a - b);
    const n = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      count: n,
      sum,
      mean,
      median,
      variance,
      stdDev,
      min: sorted[0],
      max: sorted[n - 1],
    };
  }
}

// Export singleton instance
export const statsEngineService = new StatsEngineService();

// Export types
export type { StatsEngineService };