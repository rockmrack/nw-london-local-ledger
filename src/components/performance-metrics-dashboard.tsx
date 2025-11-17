/**
 * Performance Metrics Dashboard
 * Real-time monitoring of deduplication and edge caching performance
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getGlobalDeduplicator } from '@/lib/deduplication';

interface Metrics {
  deduplication: {
    totalRequests: number;
    duplicateRequests: number;
    coalescedRequests: number;
    uniqueRequests: number;
    activeRequests: number;
    deduplicationRate: number;
    avgWaitTime: number;
    errors: number;
  };
  edgeCache: {
    hitRate: number;
    missRate: number;
    avgLatency: number;
    bandwidth: {
      saved: number;
      total: number;
    };
    locations: number;
  };
  multiLayer: {
    l1HitRate: number;
    l2HitRate: number;
    dbHitRate: number;
    avgRetrievalTime: number;
  };
}

export function PerformanceMetricsDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Get deduplication metrics
        const deduplicator = getGlobalDeduplicator();
        const dedupMetrics = deduplicator.getMetrics();

        // Fetch edge cache metrics
        const edgeResponse = await fetch('/api/cache/metrics?type=edge');
        const edgeMetrics = await edgeResponse.json();

        // Fetch multi-layer cache metrics
        const cacheResponse = await fetch('/api/cache/metrics');
        const cacheMetrics = await cacheResponse.json();

        setMetrics({
          deduplication: dedupMetrics,
          edgeCache: edgeMetrics,
          multiLayer: cacheMetrics,
        });
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    // Auto-refresh every 5 seconds
    const interval = autoRefresh ? setInterval(fetchMetrics, 5000) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center text-gray-500 py-8">
        No metrics available
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toString();
  };

  const formatPercentage = (num: number) => `${(num * 100).toFixed(2)}%`;

  const formatLatency = (ms: number) => {
    if (ms < 1) return '<1ms';
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(0)}ms`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          Performance Metrics Dashboard
        </h2>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="mr-2"
          />
          <span className="text-sm text-gray-600">Auto-refresh</span>
        </label>
      </div>

      {/* Request Deduplication Metrics */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Request Deduplication
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total Requests"
            value={formatNumber(metrics.deduplication.totalRequests)}
            color="blue"
          />
          <MetricCard
            label="Deduplication Rate"
            value={formatPercentage(metrics.deduplication.deduplicationRate)}
            color="green"
            highlight={metrics.deduplication.deduplicationRate > 0.1}
          />
          <MetricCard
            label="Coalesced Requests"
            value={formatNumber(metrics.deduplication.coalescedRequests)}
            color="purple"
          />
          <MetricCard
            label="Avg Wait Time"
            value={formatLatency(metrics.deduplication.avgWaitTime)}
            color="yellow"
          />
          <MetricCard
            label="Active Requests"
            value={metrics.deduplication.activeRequests.toString()}
            color="indigo"
          />
          <MetricCard
            label="Unique Requests"
            value={formatNumber(metrics.deduplication.uniqueRequests)}
            color="gray"
          />
          <MetricCard
            label="Errors"
            value={metrics.deduplication.errors.toString()}
            color="red"
            highlight={metrics.deduplication.errors > 0}
          />
        </div>
      </div>

      {/* Edge Cache Metrics */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Cloudflare Edge Cache
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Hit Rate"
            value={formatPercentage(metrics.edgeCache.hitRate)}
            color="green"
            highlight={metrics.edgeCache.hitRate > 0.9}
          />
          <MetricCard
            label="Miss Rate"
            value={formatPercentage(metrics.edgeCache.missRate)}
            color="orange"
            highlight={metrics.edgeCache.missRate > 0.2}
          />
          <MetricCard
            label="Avg Latency"
            value={formatLatency(metrics.edgeCache.avgLatency)}
            color="blue"
            highlight={metrics.edgeCache.avgLatency < 50}
          />
          <MetricCard
            label="Edge Locations"
            value={metrics.edgeCache.locations.toString()}
            color="purple"
          />
          <MetricCard
            label="Bandwidth Saved"
            value={formatBytes(metrics.edgeCache.bandwidth.saved)}
            color="green"
          />
          <MetricCard
            label="Total Bandwidth"
            value={formatBytes(metrics.edgeCache.bandwidth.total)}
            color="gray"
          />
        </div>
      </div>

      {/* Multi-Layer Cache Metrics */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Multi-Layer Cache
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="L1 Hit Rate"
            value={formatPercentage(metrics.multiLayer.l1HitRate)}
            color="green"
            highlight={metrics.multiLayer.l1HitRate > 0.7}
          />
          <MetricCard
            label="L2 Hit Rate"
            value={formatPercentage(metrics.multiLayer.l2HitRate)}
            color="blue"
            highlight={metrics.multiLayer.l2HitRate > 0.8}
          />
          <MetricCard
            label="DB Hit Rate"
            value={formatPercentage(metrics.multiLayer.dbHitRate)}
            color="yellow"
          />
          <MetricCard
            label="Avg Retrieval"
            value={formatLatency(metrics.multiLayer.avgRetrievalTime)}
            color="purple"
            highlight={metrics.multiLayer.avgRetrievalTime < 10}
          />
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Performance Summary
        </h3>
        <div className="space-y-2">
          <SummaryItem
            label="Overall Cache Effectiveness"
            value={calculateOverallEffectiveness(metrics)}
          />
          <SummaryItem
            label="Request Reduction"
            value={calculateRequestReduction(metrics)}
          />
          <SummaryItem
            label="Latency Improvement"
            value={calculateLatencyImprovement(metrics)}
          />
          <SummaryItem
            label="Expected Performance Gain"
            value={calculatePerformanceGain(metrics)}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  const bgColor = highlight ? `bg-${color}-100` : 'bg-gray-50';
  const textColor = highlight ? `text-${color}-800` : 'text-gray-800';

  return (
    <div className={`${bgColor} rounded-lg p-4`}>
      <p className="text-xs text-gray-600 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}:</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function calculateOverallEffectiveness(metrics: Metrics): string {
  const dedupRate = metrics.deduplication.deduplicationRate;
  const edgeHitRate = metrics.edgeCache.hitRate;
  const l1HitRate = metrics.multiLayer.l1HitRate;

  const overall = (dedupRate * 0.3 + edgeHitRate * 0.4 + l1HitRate * 0.3) * 100;
  return `${overall.toFixed(1)}%`;
}

function calculateRequestReduction(metrics: Metrics): string {
  const coalescedRequests = metrics.deduplication.coalescedRequests;
  const totalRequests = metrics.deduplication.totalRequests;

  if (totalRequests === 0) return '0%';

  const reduction = (coalescedRequests / totalRequests) * 100;
  return `${reduction.toFixed(1)}% reduction`;
}

function calculateLatencyImprovement(metrics: Metrics): string {
  const edgeLatency = metrics.edgeCache.avgLatency;
  const baselineLatency = 200; // Assumed baseline

  const improvement = ((baselineLatency - edgeLatency) / baselineLatency) * 100;
  return `${improvement.toFixed(1)}% faster`;
}

function calculatePerformanceGain(metrics: Metrics): string {
  const dedupRate = metrics.deduplication.deduplicationRate;
  const edgeHitRate = metrics.edgeCache.hitRate;

  // Calculate compound performance gain
  const dedupGain = 1 + dedupRate * 2; // 2x for deduplicated requests
  const edgeGain = 1 + edgeHitRate * 4; // 4x for edge cache hits
  const totalGain = dedupGain * edgeGain;

  return `${totalGain.toFixed(1)}x`;
}

export default PerformanceMetricsDashboard;