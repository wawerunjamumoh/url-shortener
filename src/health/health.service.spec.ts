import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
    let service: HealthService;
    const dataSource = {
        isInitialized: true,
        query: vi.fn(),
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        dataSource.isInitialized = true;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HealthService,
                { provide: DataSource, useValue: dataSource },
            ],
        }).compile();

        service = module.get(HealthService);
    });

    it('reports liveness without checking dependencies', () => {
        expect(service.checkLiveness()).toEqual({ status: 'ok' });
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('reports readiness when the database responds', async () => {
        dataSource.query.mockResolvedValue([{ 1: 1 }]);

        await expect(service.checkReadiness()).resolves.toEqual({
            status: 'ok',
            checks: { database: 'ok' },
        });
        expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns unavailable without leaking database errors', async () => {
        dataSource.query.mockRejectedValue(new Error('database connection secret'));

        const error = await service.checkReadiness().then(
            () => null,
            (reason: unknown) => reason,
        );

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as Error).message).not.toContain('database connection secret');
    });

    it('returns unavailable when the data source is not initialized', async () => {
        dataSource.isInitialized = false;

        await expect(service.checkReadiness()).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
        expect(dataSource.query).not.toHaveBeenCalled();
    });
});
