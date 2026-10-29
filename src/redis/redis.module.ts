import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
    providers: [
        {
            // Create one client for the whole Nest application; feature modules
            // should use RedisService rather than opening their own connections.
            provide: REDIS_CLIENT,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const logger = new Logger('RedisClient');
                const client = createClient({
                    // Set REDIS_URL in .env or deployment secrets. The localhost
                    // value is only a convenient fallback for local development.
                    url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
                    socket: {
                        // Bound connection attempts and retry delays so a Redis
                        // outage does not create an unbounded reconnect storm.
                        connectTimeout: 5_000,
                        reconnectStrategy: (retries) => Math.min(retries * 250, 5_000),
                    },
                });
                // node-redis requires an error listener; log connection issues
                // without logging credentials or cached values.
                client.on('error', (error) => {
                    logger.warn(`Redis client error: ${error.message}`);
                });
                return client;
            },
        },
        RedisService,
    ],
    // RedisService is available to feature modules without repeatedly importing
    // RedisModule, while the client token itself stays an implementation detail.
    exports: [RedisService],
})
export class RedisModule { }
