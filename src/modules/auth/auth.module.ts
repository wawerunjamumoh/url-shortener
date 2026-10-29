import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { User } from './entities/user.entity.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
                const refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
                if (accessSecret.length < 32 || refreshSecret.length < 32) {
                    throw new Error('JWT secrets must each be at least 32 characters');
                }
                if (accessSecret === refreshSecret) {
                    throw new Error('JWT access and refresh secrets must be different');
                }

                return {
                    secret: accessSecret,
                    signOptions: {
                        expiresIn: (config.get<string>('JWT_ACCESS_TTL') ??
                            '15m') as JwtSignOptions['expiresIn'],
                    },
                };
            },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtAuthGuard],
    exports: [JwtAuthGuard],
})
export class AuthModule { }