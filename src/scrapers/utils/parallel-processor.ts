/**
 * Parallel processing utilities for scrapers
 * Enables concurrent processing with chunking and error handling
 */

export interface ProcessResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  index: number;
}

export interface ParallelProcessorConfig {
  concurrency: number;
  retryAttempts?: number;
  retryDelay?: number;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Process items in parallel with controlled concurrency
 */
export class ParallelProcessor {
  /**
   * Process array of items in parallel chunks
   */
  static async processInChunks<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    config: ParallelProcessorConfig
  ): Promise<ProcessResult<R>[]> {
    const results: ProcessResult<R>[] = [];
    const chunks = this.chunkArray(items, config.concurrency);
    let completedCount = 0;

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async ({ item, originalIndex }) => {
          try {
            const data = await this.processWithRetry(
              () => processor(item, originalIndex),
              config.retryAttempts || 3,
              config.retryDelay || 1000
            );

            completedCount++;
            if (config.onProgress) {
              config.onProgress(completedCount, items.length);
            }

            return {
              success: true,
              data,
              index: originalIndex
            } as ProcessResult<R>;
          } catch (error) {
            completedCount++;
            if (config.onProgress) {
              config.onProgress(completedCount, items.length);
            }

            return {
              success: false,
              error: error as Error,
              index: originalIndex
            } as ProcessResult<R>;
          }
        })
      );

      results.push(...chunkResults);
    }

    return results.sort((a, b) => a.index - b.index);
  }

  /**
   * Process all items in parallel without chunking
   */
  static async processAll<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<ProcessResult<R>[]> {
    return Promise.all(
      items.map(async (item, index) => {
        try {
          const data = await processor(item, index);
          return {
            success: true,
            data,
            index
          } as ProcessResult<R>;
        } catch (error) {
          return {
            success: false,
            error: error as Error,
            index
          } as ProcessResult<R>;
        }
      })
    );
  }

  /**
   * Process with retry logic
   */
  private static async processWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    retryDelay: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Split array into chunks
   */
  private static chunkArray<T>(
    array: T[],
    chunkSize: number
  ): Array<Array<{ item: T; originalIndex: number }>> {
    const chunks: Array<Array<{ item: T; originalIndex: number }>> = [];

    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array
        .slice(i, i + chunkSize)
        .map((item, localIndex) => ({
          item,
          originalIndex: i + localIndex
        }));
      chunks.push(chunk);
    }

    return chunks;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Batch processor for handling large datasets
 */
export class BatchProcessor {
  private successCount = 0;
  private errorCount = 0;
  private errors: Array<{ index: number; error: Error }> = [];

  /**
   * Process items in batches with progress tracking
   */
  async processBatch<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    batchSize: number = 10,
    onProgress?: (progress: {
      total: number;
      completed: number;
      success: number;
      errors: number;
      percentage: number;
    }) => void
  ): Promise<{ results: R[]; errors: Array<{ index: number; error: Error }> }> {
    const results: R[] = [];
    const totalItems = items.length;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchResults = await ParallelProcessor.processAll(
        batch,
        async (item, localIndex) => processor(item, i + localIndex)
      );

      for (const result of batchResults) {
        if (result.success && result.data) {
          this.successCount++;
          results.push(result.data);
        } else if (result.error) {
          this.errorCount++;
          this.errors.push({ index: result.index, error: result.error });
        }
      }

      if (onProgress) {
        const completed = this.successCount + this.errorCount;
        onProgress({
          total: totalItems,
          completed,
          success: this.successCount,
          errors: this.errorCount,
          percentage: Math.round((completed / totalItems) * 100)
        });
      }
    }

    return { results, errors: this.errors };
  }

  getStats() {
    return {
      successCount: this.successCount,
      errorCount: this.errorCount,
      totalProcessed: this.successCount + this.errorCount,
      errors: this.errors
    };
  }
}