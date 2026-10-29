import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { TokenPair, TokenPayload } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class AuthService {
    private readonly refreshTokenSecret: string;
    private readonly refreshTokenTtl: JwtSignOptions['expiresIn'];

    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
        private readonly jwtService: JwtService,
        config: ConfigService,
    ) {
        this.refreshTokenSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
        this.refreshTokenTtl = (config.get<string>('JWT_REFRESH_TTL') ??
            '7d') as JwtSignOptions['expiresIn'];
    }

    async register(dto: RegisterDto): Promise<TokenPair> {
        const email = dto.email.toLowerCase();
        if (await this.users.findOne({ where: { email } })) {
            throw new ConflictException('An account with this email already exists');
        }

        const user = this.users.create({
            firstName: dto.firstName,
            lastName: dto.lastName,
            email,
            passwordHash: await hash(dto.password, 12),
            refreshTokenHash: null,
        });

        try {
            await this.users.save(user);
        } catch (error) {
            // Protect against concurrent registration attempts for the same email.
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === 'ER_DUP_ENTRY'
            ) {
                throw new ConflictException('An account with this email already exists');
            }
            throw error;
        }

        return this.issueTokenPair(user);
    }

    async login(dto: LoginDto): Promise<TokenPair> {
        const user = await this.users
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.email = :email', { email: dto.email.toLowerCase() })
            .getOne();

        if (!user || !(await compare(dto.password, user.passwordHash))) {
            throw new UnauthorizedException('Invalid email or password');
        }

        return this.issueTokenPair(user);
    }

    async refresh(refreshToken: string): Promise<TokenPair> {
        let payload: TokenPayload;
        try {
            payload = await this.jwtService.verifyAsync<TokenPayload>(refreshToken, {
                secret: this.refreshTokenSecret,
            });
        } catch {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        if (payload.tokenType !== 'refresh' || !payload.sub || !payload.email) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.users
            .createQueryBuilder('user')
            .addSelect('user.refreshTokenHash')
            .where('user.userId = :userId', { userId: payload.sub })
            .getOne();

        if (
            !user?.refreshTokenHash ||
            !this.matchesRefreshToken(refreshToken, user.refreshTokenHash)
        ) {
            throw new UnauthorizedException('Refresh token has been revoked');
        }

        return this.issueTokenPair(user);
    }

    async logout(userId: string): Promise<{ message: string }> {
        await this.users.update({ userId }, { refreshTokenHash: null });
        return { message: 'Logged out' };
    }

    async getProfile(
        userId: string,
    ): Promise<Pick<User, 'userId' | 'firstName' | 'lastName' | 'email' | 'joinedAt'>> {
        const user = await this.users.findOne({ where: { userId } });
        if (!user) {
            throw new UnauthorizedException('Account no longer exists');
        }

        return {
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            joinedAt: user.joinedAt,
        };
    }

    private async issueTokenPair(user: User): Promise<TokenPair> {
        const accessPayload: TokenPayload = {
            sub: user.userId,
            email: user.email,
            tokenType: 'access',
        };
        const refreshPayload: TokenPayload = {
            ...accessPayload,
            tokenType: 'refresh',
        };
        const refreshOptions: JwtSignOptions = {
            secret: this.refreshTokenSecret,
            expiresIn: this.refreshTokenTtl,
        };

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(accessPayload),
            this.jwtService.signAsync(refreshPayload, refreshOptions),
        ]);

        // Store only a one-way hash; rotating it invalidates the prior refresh token.
        user.refreshTokenHash = this.hashRefreshToken(refreshToken);
        await this.users.save(user);

        return { accessToken, refreshToken, tokenType: 'Bearer' };
    }

    private hashRefreshToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private matchesRefreshToken(token: string, storedHash: string): boolean {
        const candidate = Buffer.from(this.hashRefreshToken(token), 'hex');
        const stored = Buffer.from(storedHash, 'hex');
        return candidate.length === stored.length && timingSafeEqual(candidate, stored);
    }
}