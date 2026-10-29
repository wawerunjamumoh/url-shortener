import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get('live')
    @SkipThrottle()
    checkLiveness() {
        return this.healthService.checkLiveness();
    }

    @Get('ready')
    @SkipThrottle()
    checkReadiness() {
        return this.healthService.checkReadiness();
    }
}
