import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthenticatedRequest, TokenPayload } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const token = this.getBearerToken(request);

        if (!token) {
            throw new UnauthorizedException('Bearer access token is required');
        }

        try {
            const payload = await this.jwtService.verifyAsync<TokenPayload>(token);
            if (payload.tokenType !== 'access' || !payload.sub || !payload.email) {
                throw new UnauthorizedException('Invalid access token');
            }

            request.user = { userId: payload.sub, email: payload.email };
            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired access token');
        }
    }

    private getBearerToken(request: Request): string | undefined {
        const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
        return scheme?.toLowerCase() === 'bearer' ? token : undefined;
    }
}