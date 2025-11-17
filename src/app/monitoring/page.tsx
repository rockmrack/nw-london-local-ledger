/**
 * Performance Monitoring Dashboard
 */

'use client';

import { useState, useEffect } from 'react';

interface DashboardData {
  health: {
    status: string;
    uptime: number;
  };
  keyMetrics: {
    apiRequests: number;
    avgResponseTime: number;
    errorRate: number;
    databaseQueries: number;
    avgQueryTime: number;
    slowQueryRate: number;
    cacheHitRate: number;
    memoryUsage: number;
    cpuUsage: number;
    activeAlertCount: number;
  };
  performance: any;
  alerts: any;
  errors: any;
  database: any;
}

export default function MonitoringDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [timeRange, setTimeRange] = useState(24);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, timeRange]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/monitoring/dashboard?hours=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      const result = await response.json();
      setData(result);
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading monitoring dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="py-6 md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                Performance Monitoring Dashboard
              </h1>
              <div className="mt-1 flex items-center">
                <span className={`text-lg font-medium ${getStatusColor(data.health.status)}`}>
                  System Status: {data.health.status.toUpperCase()}
                </span>
                <span className="ml-4 text-sm text-gray-500">
                  Uptime: {formatUptime(data.health.uptime)}
                </span>
              </div>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4 space-x-2">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(Number(e.target.value))}
                className="px-3 py-2 border rounded-lg"
              >
                <option value={1}>Last Hour</option>
                <option value={6}>Last 6 Hours</option>
                <option value={24}>Last 24 Hours</option>
                <option value={168}>Last 7 Days</option>
              </select>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-2 border rounded-lg"
              >
                <option value={10000}>10s refresh</option>
                <option value={30000}>30s refresh</option>
                <option value={60000}>1m refresh</option>
                <option value={300000}>5m refresh</option>
              </select>
              <button
                onClick={fetchDashboardData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Refresh Now
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="API Requests"
            value={formatNumber(data.keyMetrics.apiRequests)}
            subtitle={`${data.keyMetrics.avgResponseTime.toFixed(0)}ms avg`}
            status={data.keyMetrics.avgResponseTime > 1000 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Error Rate"
            value={`${data.keyMetrics.errorRate.toFixed(1)}%`}
            subtitle={`${data.errors?.total || 0} total errors`}
            status={data.keyMetrics.errorRate > 5 ? 'danger' : data.keyMetrics.errorRate > 2 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Database"
            value={formatNumber(data.keyMetrics.databaseQueries)}
            subtitle={`${data.keyMetrics.avgQueryTime.toFixed(0)}ms avg`}
            status={data.keyMetrics.slowQueryRate > 20 ? 'danger' : data.keyMetrics.slowQueryRate > 10 ? 'warning' : 'success'}
          />
          <MetricCard
            title="Cache Hit Rate"
            value={`${data.keyMetrics.cacheHitRate.toFixed(1)}%`}
            subtitle="Cache performance"
            status={data.keyMetrics.cacheHitRate < 70 ? 'warning' : 'success'}
          />
        </div>

        {/* System Resources */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">System Resources</h3>
              <div className="mt-3 space-y-3">
                <ResourceBar
                  label="CPU Usage"
                  value={data.keyMetrics.cpuUsage}
                  threshold={80}
                />
                <ResourceBar
                  label="Memory Usage"
                  value={data.keyMetrics.memoryUsage}
                  threshold={85}
                />
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Active Alerts</h3>
              <div className="mt-3">
                {data.alerts.active.length === 0 ? (
                  <p className="text-sm text-gray-500">No active alerts</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {data.alerts.active.slice(0, 5).map((alert: any, idx: number) => (
                      <li key={idx} className="py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`text-sm font-medium ${
                              alert.severity === 'critical' ? 'text-red-600' :
                              alert.severity === 'error' ? 'text-orange-600' :
                              'text-yellow-600'
                            }`}>
                              [{alert.severity.toUpperCase()}]
                            </span>
                            <span className="ml-2 text-sm text-gray-900">{alert.title}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.keyMetrics.activeAlertCount > 5 && (
                  <p className="mt-2 text-sm text-gray-500">
                    +{data.keyMetrics.activeAlertCount - 5} more alerts
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Database Performance */}
        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Database Performance</h3>
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-sm text-gray-500">Active Queries:</span>
                  <span className="ml-2 text-sm font-medium">{data.database.statistics?.activeQueries || 0}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Connection Pool:</span>
                  <span className="ml-2 text-sm font-medium">
                    {data.database.poolStatus?.activeConnections || 0} active
                  </span>
                </div>
              </div>

              {data.database.slowQueries?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900">Recent Slow Queries</h4>
                  <ul className="mt-2 divide-y divide-gray-200">
                    {data.database.slowQueries.slice(0, 3).map((query: any, idx: number) => (
                      <li key={idx} className="py-2">
                        <div className="text-sm">
                          <code className="text-xs text-gray-600">
                            {query.query.substring(0, 100)}...
                          </code>
                          <span className="ml-2 text-xs text-red-600">
                            {query.duration}ms
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Summary */}
        {data.errors?.total > 0 && (
          <div className="mt-8 bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium text-gray-900">Error Summary</h3>
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(data.errors.byType || {}).map(([type, count]) => (
                    <div key={type}>
                      <span className="text-sm text-gray-500">{type}:</span>
                      <span className="ml-2 text-sm font-medium">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value, subtitle, status }: {
  title: string;
  value: string;
  subtitle: string;
  status: 'success' | 'warning' | 'danger';
}) {
  const statusColors = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
        <dd className="mt-1 text-3xl font-semibold text-gray-900">{value}</dd>
        <dd className="mt-2">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
            {subtitle}
          </span>
        </dd>
      </div>
    </div>
  );
}

// Resource Bar Component
function ResourceBar({ label, value, threshold }: {
  label: string;
  value: number;
  threshold: number;
}) {
  const percentage = Math.min(100, Math.max(0, value));
  const isWarning = percentage > threshold;
  const isCritical = percentage > threshold + 10;

  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={`font-medium ${
          isCritical ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-gray-900'
        }`}>
          {percentage.toFixed(1)}%
        </span>
      </div>
      <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${
            isCritical ? 'bg-red-600' : isWarning ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}