import type { Request } from 'express';

export interface TokenPayload {
    sub: string;
    email: string;
    tokenType: 'access' | 'refresh';
}

export interface AuthenticatedRequestUser {
    userId: string;
    email: string;
}

export interface AuthenticatedRequest extends Request {
    user: AuthenticatedRequestUser;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
}