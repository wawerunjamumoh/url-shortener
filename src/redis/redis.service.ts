import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT, URL_POPULARITY_KEY } from './redis.constants.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);

    constructor(
        @Inject(REDIS_CLIENT) private readonly client: RedisClientType,
    ) { }

    async onModuleInit(): Promise<void> {
        // Attach the listener before connect(): connection failures can happen
        // during startup and later while the client is reconnecting.
        this.client.on('error', (error) => {
            this.logger.warn(`Redis connection error: ${error.message}`);
        });

        // Do not await Redis here. The API can start while Redis is down; cache
        // methods below return misses/no-ops until the client becomes ready.
        void this.client.connect().then(
            () => this.logger.log('Connected to Redis'),
            (error: unknown) => {
                this.logger.warn(`Redis unavailable; cache operations will fail open: ${this.errorMessage(error)}`);
            },
        );
    }

    async onModuleDestroy(): Promise<void> {
        // Close the socket cleanly during Nest shutdown to avoid hanging process
        // exits and to release the connection in container deployments.
        if (this.client.isOpen) {
            await this.client.quit().catch((error: unknown) => {
                this.logger.warn(`Could not close Redis connection cleanly: ${this.errorMessage(error)}`);
            });
        }
    }

    async getJson<T>(key: string): Promise<T | null> {
        // A non-ready client behaves like a cache miss so callers use MySQL.
        if (!this.client.isReady) return null;
        try {
            const value = await this.client.get(key);
            // JSON decoding is centralized here so cache consumers deal with
            // typed application values instead of Redis strings.
            return value === null ? null : (JSON.parse(value) as T);
        } catch (error) {
            // Cache data is disposable: malformed values or Redis errors should
            // not make an otherwise healthy database-backed request fail.
            this.logger.warn(`Redis read failed for ${key}: ${this.errorMessage(error)}`);
            return null;
        }
    }

    async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        // Every cache write must provide a TTL to prevent unbounded stale data.
        if (!this.client.isReady) return;
        try {
            await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
        } catch (error) {
            this.logger.warn(`Redis write failed for ${key}: ${this.errorMessage(error)}`);
        }
    }

    async delete(key: string): Promise<void> {
        // Delete is best-effort; TTLs provide a fallback if invalidation fails.
        if (!this.client.isReady) return;
        try {
            await this.client.del(key);
        } catch (error) {
            this.logger.warn(`Redis delete failed for ${key}: ${this.errorMessage(error)}`);
        }
    }

    async recordUrlAccess(shortCode: string): Promise<void> {
        if (!this.client.isReady) return;
        try {
            // MULTI keeps increment and trimming together, avoiding an
            // intermediate over-sized leaderboard between the two commands.
            const multi = this.client.multi();
            multi.zIncrBy(URL_POPULARITY_KEY, 1, shortCode);
            // Keep only the 1,000 highest-ranked short codes. This is an
            // approximate popularity feature, not durable analytics data.
            multi.zRemRangeByRank(URL_POPULARITY_KEY, 0, -1001);
            await multi.exec();
        } catch (error) {
            this.logger.warn(`Could not record URL popularity: ${this.errorMessage(error)}`);
        }
    }

    async getMostAccessedUrlCodes(limit: number): Promise<string[]> {
        if (!this.client.isReady) return [];
        try {
            // REV requests descending score order: most accesses first.
            return await this.client.zRange(URL_POPULARITY_KEY, 0, limit - 1, {
                REV: true,
            });
        } catch (error) {
            this.logger.warn(`Could not read URL popularity: ${this.errorMessage(error)}`);
            return [];
        }
    }

    private errorMessage(error: unknown): string {
        // Keep logging safe even when a client/library throws a non-Error value.
        return error instanceof Error ? error.message : 'unknown error';
    }
}
