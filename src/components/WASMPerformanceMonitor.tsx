/**
 * WASM Performance Monitor Component
 * Real-time visualization of WASM module performance
 */

'use client';

import { useState, useEffect } from 'react';
import { wasmPerformanceMonitor, type WASMPerformanceMetrics } from '@/lib/wasm';

interface ModuleStats {
  module: string;
  avgTimeMs: number;
  operations: number;
  avgThroughput: number;
  speedup?: number;
}

export function WASMPerformanceMonitor() {
  const [metrics, setMetrics] = useState<WASMPerformanceMetrics[]>([]);
  const [moduleStats, setModuleStats] = useState<ModuleStats[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isMonitoring) {
        const currentMetrics = wasmPerformanceMonitor.getMetrics();
        setMetrics(currentMetrics);

        // Calculate module stats
        const stats = calculateModuleStats(currentMetrics);
        setModuleStats(stats);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  const calculateModuleStats = (metrics: WASMPerformanceMetrics[]): ModuleStats[] => {
    const moduleMap = new Map<string, ModuleStats>();

    metrics.forEach(metric => {
      if (!moduleMap.has(metric.module)) {
        moduleMap.set(metric.module, {
          module: metric.module,
          avgTimeMs: 0,
          operations: 0,
          avgThroughput: 0,
        });
      }

      const stats = moduleMap.get(metric.module)!;
      stats.operations++;
      stats.avgTimeMs = (stats.avgTimeMs * (stats.operations - 1) + metric.timeMs) / stats.operations;
      stats.avgThroughput = (stats.avgThroughput * (stats.operations - 1) + metric.throughput) / stats.operations;
    });

    // Calculate speedup based on typical JS performance
    const jsPerformance: Record<string, number> = {
      PropertyProcessor: 120,
      GeoCalculator: 45,
      StatsEngine: 200,
      SearchOptimizer: 80,
      DataTransformer: 150,
    };

    return Array.from(moduleMap.values()).map(stats => ({
      ...stats,
      speedup: jsPerformance[stats.module] ? jsPerformance[stats.module] / stats.avgTimeMs : undefined,
    }));
  };

  const getModuleColor = (module: string): string => {
    const colors: Record<string, string> = {
      PropertyProcessor: 'bg-blue-500',
      GeoCalculator: 'bg-green-500',
      StatsEngine: 'bg-purple-500',
      SearchOptimizer: 'bg-yellow-500',
      DataTransformer: 'bg-red-500',
    };
    return colors[module] || 'bg-gray-500';
  };

  const getSpeedupColor = (speedup?: number): string => {
    if (!speedup) return 'text-gray-500';
    if (speedup >= 10) return 'text-green-600';
    if (speedup >= 5) return 'text-yellow-600';
    if (speedup >= 2) return 'text-orange-600';
    return 'text-red-600';
  };

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-white rounded-lg shadow-xl border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">WASM Performance</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            <button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`px-3 py-1 text-xs rounded ${
                isMonitoring ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}
            >
              {isMonitoring ? 'Monitoring' : 'Paused'}
            </button>
            <button
              onClick={() => wasmPerformanceMonitor.clearMetrics()}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {moduleStats.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No WASM operations recorded yet
          </p>
        ) : (
          <>
            {/* Module Summary */}
            <div className="space-y-2">
              {moduleStats.map(stats => (
                <div key={stats.module} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full ${getModuleColor(stats.module)} mr-2`} />
                      <span className="font-medium text-sm">{stats.module}</span>
                    </div>
                    {stats.speedup && (
                      <span className={`text-sm font-bold ${getSpeedupColor(stats.speedup)}`}>
                        {stats.speedup.toFixed(1)}x faster
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Avg Time:</span>
                      <span className="ml-1 font-medium">{stats.avgTimeMs.toFixed(2)}ms</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ops:</span>
                      <span className="ml-1 font-medium">{stats.operations}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Throughput:</span>
                      <span className="ml-1 font-medium">{Math.round(stats.avgThroughput)}/s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Metrics */}
            {showDetails && (
              <div className="border-t pt-3 max-h-60 overflow-y-auto">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Operations</h4>
                <div className="space-y-1">
                  {metrics.slice(-10).reverse().map((metric, i) => (
                    <div key={i} className="text-xs bg-gray-50 rounded p-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{metric.module}::{metric.operation}</span>
                        <span className="text-gray-600">{metric.timeMs.toFixed(2)}ms</span>
                      </div>
                      <div className="text-gray-500 mt-1">
                        Input size: {metric.inputSize} | Throughput: {Math.round(metric.throughput)}/s
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overall Stats */}
            <div className="border-t pt-3 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Total Operations:</span>
                <span className="font-medium">{metrics.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Average Speedup:</span>
                <span className="font-medium text-green-600">
                  {(
                    moduleStats.reduce((sum, s) => sum + (s.speedup || 0), 0) /
                    moduleStats.filter(s => s.speedup).length
                  ).toFixed(1)}x
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Time Saved:</span>
                <span className="font-medium text-blue-600">
                  {Math.round(
                    moduleStats.reduce((sum, s) => {
                      const jsTime = s.speedup ? s.avgTimeMs * s.speedup : s.avgTimeMs;
                      return sum + (jsTime - s.avgTimeMs) * s.operations;
                    }, 0)
                  )}ms
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Export for use in layouts
export default WASMPerformanceMonitor;