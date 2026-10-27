import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
    constructor(private readonly dataSource: DataSource) { }

    checkLiveness() {
        return { status: 'ok' as const };
    }

    async checkReadiness() {
        try {
            if (!this.dataSource.isInitialized) {
                throw new Error('Database connection is not initialized');
            }

            await this.dataSource.query('SELECT 1');
            return {
                status: 'ok' as const,
                checks: { database: 'ok' as const },
            };
        } catch {
            // Do not leak database credentials, hostnames, or driver errors in probes.
            throw new ServiceUnavailableException({
                status: 'error',
                checks: { database: 'unavailable' },
            });
        }
    }
}
