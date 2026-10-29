import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { RedisService } from '../../redis/redis.service.js';

describe('AuthService', () => {
    const user = {
        userId: 'user-id',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        passwordHash: '',
        refreshTokenHash: null as string | null,
        joinedAt: new Date(),
    } as User;

    const queryBuilder = {
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn(),
    };
    const repository = {
        findOne: vi.fn(),
        create: vi.fn((fields) => ({ ...fields, userId: user.userId })),
        save: vi.fn(async (value) => value),
        createQueryBuilder: vi.fn(() => queryBuilder),
        update: vi.fn(),
    };
    const jwtService = {
        signAsync: vi.fn(),
        verifyAsync: vi.fn(),
    };
    const config = {
        getOrThrow: vi.fn(() => 'different-long-refresh-secret-123456'),
        get: vi.fn(() => '7d'),
    };
    const redis = {
        getJson: vi.fn(),
        setJson: vi.fn(),
        delete: vi.fn(),
    };

    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        user.passwordHash = '';
        user.refreshTokenHash = null;
        service = new AuthService(
            repository as unknown as Repository<User>,
            jwtService as unknown as JwtService,
            redis as unknown as RedisService,
            config as unknown as ConfigService,
        );
    });

    it('hashes the password and returns a token pair on registration', async () => {
        repository.findOne.mockResolvedValue(null);
        jwtService.signAsync
            .mockResolvedValueOnce('access-token')
            .mockResolvedValueOnce('refresh-token');

        const result = await service.register({
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ADA@example.com',
            password: 'a-long-test-password',
        });

        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'ada@example.com' }),
        );
        const storedUser = repository.create.mock.results[0].value as User;
        expect(await compare('a-long-test-password', storedUser.passwordHash)).toBe(true);
        expect(storedUser.passwordHash).not.toBe('a-long-test-password');
        expect(result).toEqual({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            tokenType: 'Bearer',
        });
        expect(storedUser.refreshTokenHash).toBe(
            createHash('sha256').update('refresh-token').digest('hex'),
        );
    }, 30_000);

    it('rotates refresh tokens and rejects the previous token', async () => {
        user.refreshTokenHash = createHash('sha256')
            .update('old-refresh-token')
            .digest('hex');
        queryBuilder.getOne.mockResolvedValue(user);
        jwtService.verifyAsync.mockResolvedValue({
            sub: user.userId,
            email: user.email,
            tokenType: 'refresh',
        });
        jwtService.signAsync
            .mockResolvedValueOnce('new-access-token')
            .mockResolvedValueOnce('new-refresh-token');

        const pair = await service.refresh('old-refresh-token');
        expect(pair.refreshToken).toBe('new-refresh-token');
        expect(user.refreshTokenHash).toBe(
            createHash('sha256').update('new-refresh-token').digest('hex'),
        );

        await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    }, 30_000);

    it('caches only the public profile for 60 seconds', async () => {
        redis.getJson.mockResolvedValue(null);
        repository.findOne.mockResolvedValue(user);

        const profile = await service.getProfile(user.userId);

        expect(profile).toEqual({
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            joinedAt: user.joinedAt,
        });
        expect(redis.setJson).toHaveBeenCalledWith(
            `users:profile:${user.userId}`,
            profile,
            60,
        );
        expect(profile).not.toHaveProperty('passwordHash');
        expect(profile).not.toHaveProperty('refreshTokenHash');
    });
});
