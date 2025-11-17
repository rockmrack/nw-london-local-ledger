'use client';

import { useEffect, useState } from 'react';

interface MarketStats {
  averagePrice?: number;
  priceChange?: number;
  totalListings?: number;
  newListings?: number;
  averageDaysOnMarket?: number;
  pricePerSqft?: number;
}

interface MarketInsightsProps {
  stats: MarketStats;
}

/**
 * Market Insights Component with animated counters
 */
export default function MarketInsights({ stats }: MarketInsightsProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    setAnimated(true);
  }, []);

  const insights = [
    {
      label: 'Average Price',
      value: stats.averagePrice ? `£${(stats.averagePrice / 1000).toFixed(0)}K` : 'N/A',
      change: stats.priceChange,
      icon: '💰',
    },
    {
      label: 'Active Listings',
      value: stats.totalListings?.toLocaleString() || 'N/A',
      change: stats.newListings,
      icon: '🏠',
    },
    {
      label: 'Days on Market',
      value: stats.averageDaysOnMarket?.toFixed(0) || 'N/A',
      suffix: 'days',
      icon: '📅',
    },
    {
      label: 'Price per Sq Ft',
      value: stats.pricePerSqft ? `£${stats.pricePerSqft.toFixed(0)}` : 'N/A',
      icon: '📐',
    },
  ];

  return (
    <div className="grid md:grid-cols-4 gap-4">
      {insights.map((insight, index) => (
        <div
          key={index}
          className={`bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-all duration-500 ${
            animated ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: `${index * 100}ms` }}
        >
          <div className="text-2xl mb-2">{insight.icon}</div>

          <div className="text-sm text-gray-600 mb-1">{insight.label}</div>

          <div className="text-2xl font-bold text-gray-900">
            {insight.value}
            {insight.suffix && (
              <span className="text-sm font-normal text-gray-500 ml-1">
                {insight.suffix}
              </span>
            )}
          </div>

          {insight.change !== undefined && (
            <div
              className={`text-sm mt-2 ${
                insight.change > 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {insight.change > 0 ? '↑' : '↓'} {Math.abs(insight.change)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
}