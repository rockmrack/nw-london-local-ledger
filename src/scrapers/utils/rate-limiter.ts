/**
 * Rate limiter for controlling scraper request frequency
 */

export class RateLimiter {
  private lastRequestTime: number | null = null;
  private readonly minInterval: number; // milliseconds

  constructor(requestsPerSecond: number = 1) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  /**
   * Wait if necessary to respect rate limit
   */
  async acquire(): Promise<void> {
    if (this.lastRequestTime) {
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < this.minInterval) {
        const waitTime = this.minInterval - elapsed;
        await this.sleep(waitTime);
      }
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.lastRequestTime = null;
  }
}

/**
 * Token bucket rate limiter for burst handling
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Acquire tokens, waiting if necessary
   */
  async acquire(tokensNeeded: number = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokensNeeded) {
        this.tokens -= tokensNeeded;
        return;
      }

      // Wait for tokens to be available
      const tokensShortage = tokensNeeded - this.tokens;
      const waitTime = (tokensShortage / this.refillRate) * 1000;
      await this.sleep(waitTime);
    }
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
