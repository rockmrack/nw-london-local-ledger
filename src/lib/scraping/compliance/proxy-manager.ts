/**
 * Proxy Management System
 * Ethical proxy rotation with compliance tracking
 */

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  username?: string;
  password?: string;
  country?: string;
  city?: string;
  provider?: string;
  residential?: boolean;
  ethicalScore?: number; // 0-100, higher is more ethical
}

export interface ProxyStats {
  successRate: number;
  totalRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  lastUsed?: Date;
  blocked?: boolean;
}

export class ProxyManager {
  private proxies: Map<string, { config: ProxyConfig; stats: ProxyStats }> = new Map();
  private currentProxyIndex: number = 0;
  private readonly ETHICAL_THRESHOLD = 80; // Minimum ethical score

  constructor() {
    // Initialize with ethical proxy providers only
    this.initializeEthicalProxies();
  }

  /**
   * Initialize with ethical proxy configurations
   */
  private initializeEthicalProxies(): void {
    // Note: In production, these would be loaded from secure config
    const ethicalProxies: ProxyConfig[] = [
      // No proxy (direct connection) - most ethical
      {
        host: 'direct',
        port: 0,
        protocol: 'http',
        country: 'UK',
        ethicalScore: 100,
        provider: 'Direct Connection'
      }
      // Only add legitimate, paid proxy services here
      // Never use free proxies that might be compromised
    ];

    ethicalProxies.forEach(proxy => {
      const key = this.getProxyKey(proxy);
      this.proxies.set(key, {
        config: proxy,
        stats: {
          successRate: 100,
          totalRequests: 0,
          failedRequests: 0,
          avgResponseTime: 0
        }
      });
    });
  }

  /**
   * Get next proxy in rotation
   */
  getNextProxy(): ProxyConfig | null {
    const proxyList = Array.from(this.proxies.values())
      .filter(p => !p.stats.blocked && p.config.ethicalScore! >= this.ETHICAL_THRESHOLD)
      .sort((a, b) => b.stats.successRate - a.stats.successRate);

    if (proxyList.length === 0) return null;

    const proxy = proxyList[this.currentProxyIndex % proxyList.length];
    this.currentProxyIndex++;

    return proxy.config;
  }

  /**
   * Get proxy by specific criteria
   */
  getProxyByCriteria(criteria: {
    country?: string;
    minEthicalScore?: number;
    residential?: boolean;
  }): ProxyConfig | null {
    const filtered = Array.from(this.proxies.values()).filter(p => {
      if (criteria.country && p.config.country !== criteria.country) return false;
      if (criteria.minEthicalScore && p.config.ethicalScore! < criteria.minEthicalScore) return false;
      if (criteria.residential !== undefined && p.config.residential !== criteria.residential) return false;
      return !p.stats.blocked;
    });

    if (filtered.length === 0) return null;

    // Return proxy with best success rate
    filtered.sort((a, b) => b.stats.successRate - a.stats.successRate);
    return filtered[0].config;
  }

  /**
   * Update proxy statistics
   */
  updateProxyStats(
    proxy: ProxyConfig,
    success: boolean,
    responseTime?: number
  ): void {
    const key = this.getProxyKey(proxy);
    const proxyData = this.proxies.get(key);

    if (!proxyData) return;

    proxyData.stats.totalRequests++;
    if (!success) {
      proxyData.stats.failedRequests++;
    }

    proxyData.stats.successRate =
      ((proxyData.stats.totalRequests - proxyData.stats.failedRequests) /
        proxyData.stats.totalRequests) * 100;

    if (responseTime) {
      const prevAvg = proxyData.stats.avgResponseTime;
      const prevCount = proxyData.stats.totalRequests - 1;
      proxyData.stats.avgResponseTime =
        (prevAvg * prevCount + responseTime) / proxyData.stats.totalRequests;
    }

    proxyData.stats.lastUsed = new Date();

    // Block proxy if success rate drops too low
    if (proxyData.stats.successRate < 50 && proxyData.stats.totalRequests > 10) {
      proxyData.stats.blocked = true;
      console.warn(`Proxy blocked due to low success rate: ${key}`);
    }
  }

  /**
   * Format proxy for axios configuration
   */
  formatProxyForAxios(proxy: ProxyConfig): object | false {
    if (proxy.host === 'direct') {
      return false; // No proxy
    }

    return {
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      auth: proxy.username && proxy.password
        ? {
            username: proxy.username,
            password: proxy.password
          }
        : undefined
    };
  }

  /**
   * Validate proxy ethical compliance
   */
  validateProxyEthics(proxy: ProxyConfig): {
    isEthical: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let isEthical = true;

    // Check ethical score
    if (!proxy.ethicalScore || proxy.ethicalScore < this.ETHICAL_THRESHOLD) {
      reasons.push(`Ethical score too low: ${proxy.ethicalScore || 0}`);
      isEthical = false;
    }

    // Check if it's a known legitimate provider
    if (!proxy.provider) {
      reasons.push('Unknown proxy provider');
      isEthical = false;
    }

    // Prefer UK/EU proxies for GDPR compliance
    if (proxy.country && !['UK', 'GB', 'EU'].includes(proxy.country)) {
      reasons.push(`Non-UK/EU proxy location: ${proxy.country}`);
    }

    // Warn about residential proxies
    if (proxy.residential) {
      reasons.push('Residential proxy - ensure proper consent');
    }

    return { isEthical, reasons };
  }

  /**
   * Generate proxy usage report
   */
  generateUsageReport(): {
    summary: {
      totalProxies: number;
      activeProxies: number;
      blockedProxies: number;
      avgSuccessRate: number;
      avgResponseTime: number;
    };
    proxies: Array<{
      proxy: string;
      stats: ProxyStats;
      ethical: boolean;
    }>;
  } {
    const proxyArray = Array.from(this.proxies.entries());
    const activeProxies = proxyArray.filter(([_, data]) => !data.stats.blocked);

    const avgSuccessRate = activeProxies.length > 0
      ? activeProxies.reduce((sum, [_, data]) => sum + data.stats.successRate, 0) / activeProxies.length
      : 0;

    const avgResponseTime = activeProxies.length > 0
      ? activeProxies.reduce((sum, [_, data]) => sum + data.stats.avgResponseTime, 0) / activeProxies.length
      : 0;

    return {
      summary: {
        totalProxies: proxyArray.length,
        activeProxies: activeProxies.length,
        blockedProxies: proxyArray.length - activeProxies.length,
        avgSuccessRate,
        avgResponseTime
      },
      proxies: proxyArray.map(([key, data]) => ({
        proxy: key,
        stats: data.stats,
        ethical: this.validateProxyEthics(data.config).isEthical
      }))
    };
  }

  /**
   * Add new proxy with ethical validation
   */
  addProxy(proxy: ProxyConfig): boolean {
    const validation = this.validateProxyEthics(proxy);

    if (!validation.isEthical) {
      console.warn('Proxy rejected for ethical reasons:', validation.reasons);
      return false;
    }

    const key = this.getProxyKey(proxy);
    this.proxies.set(key, {
      config: proxy,
      stats: {
        successRate: 100,
        totalRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0
      }
    });

    return true;
  }

  /**
   * Remove blocked or underperforming proxies
   */
  cleanupProxies(): number {
    let removed = 0;

    this.proxies.forEach((data, key) => {
      if (data.stats.blocked ||
          (data.stats.totalRequests > 100 && data.stats.successRate < 60)) {
        this.proxies.delete(key);
        removed++;
      }
    });

    return removed;
  }

  /**
   * Helper: Generate proxy key
   */
  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }
}

export const proxyManager = new ProxyManager();