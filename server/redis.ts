import Redis from 'ioredis';

export const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
    console.error('[redis] error', err);
});
