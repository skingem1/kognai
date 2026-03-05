// Redis client singleton - optional dependency
// If REDIS_URL is not set, methods are no-ops
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

const redisUrl = process.env.REDIS_URL;

if (redisUrl && redisUrl !== '' && redisUrl !== 'YOUR_REDIS_URL_HERE') {
  redisClient = createClient({ url: redisUrl }) as RedisClientType;
  redisClient.connect().catch((err) => {
    console.error('[Redis] Failed to connect:', err.message);
    redisClient = null;
  });
}

export const redis = {
  ping: async (): Promise<string> => {
    if (!redisClient) throw new Error('Redis not configured');
    return String(await redisClient.ping());
  },
  get: async (key: string): Promise<string | null> => {
    if (!redisClient) return null;
    const val = await redisClient.get(key); return val as string | null;
  },
  set: async (key: string, value: string, ttl?: number): Promise<void> => {
    if (!redisClient) return;
    if (ttl) {
      await redisClient.setEx(key, ttl, value);
    } else {
      await redisClient.set(key, value);
    }
  },
  del: async (key: string): Promise<void> => {
    if (!redisClient) return;
    await redisClient.del(key);
  },
};

export default redis;
