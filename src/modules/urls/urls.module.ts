import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UrlsService } from './urls.service.js';
import { UrlsController } from './urls.controller.js';
import { Url } from './entities/url.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Url])],
  controllers: [UrlsController],
  providers: [UrlsService],
})
export class UrlsModule {}
