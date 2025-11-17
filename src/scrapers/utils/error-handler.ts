/**
 * Error handling utilities for scrapers
 */

export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly council: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

export class NetworkError extends ScraperError {
  constructor(council: string, originalError?: Error) {
    super(`Network error occurred while scraping ${council}`, council, originalError);
    this.name = 'NetworkError';
  }
}

export class ParsingError extends ScraperError {
  constructor(council: string, originalError?: Error) {
    super(`Failed to parse data from ${council}`, council, originalError);
    this.name = 'ParsingError';
  }
}

export class RateLimitError extends ScraperError {
  constructor(council: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${council}${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
      council
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle scraper errors with logging
 */
export function handleScraperError(error: unknown, context: string): void {
  if (error instanceof ScraperError) {
    console.error(`[${error.council}] ${error.name}: ${error.message}`);
    if (error.originalError) {
      console.error('Original error:', error.originalError);
    }
  } else if (error instanceof Error) {
    console.error(`[${context}] Error: ${error.message}`);
    console.error(error.stack);
  } else {
    console.error(`[${context}] Unknown error:`, error);
  }
}
