import Redis from 'ioredis';
import { log } from './logger';

const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  return 'redis://localhost:6379';
};

class RedisClient {
  private static instance: Redis;
  private static isConnected: boolean = false;

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      RedisClient.instance = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true, // Don't connect immediately
      });

      RedisClient.instance.on('connect', () => {
        RedisClient.isConnected = true;
        log.info('Redis connected');
      });

      RedisClient.instance.on('error', (err) => {
        RedisClient.isConnected = false;
        log.error('Redis connection error', err);
      });
    }

    return RedisClient.instance;
  }
}

export const redis = RedisClient.getInstance();
