import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Redirect,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle,SkipThrottle } from '@nestjs/throttler';
import { UrlsService } from './urls.service.js';
import { CreateUrlDto } from './dto/create-url.dto.js';
import { UpdateUrlDto } from './dto/update-url.dto.js';

@Controller('shortcode')
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) { }


  @Post('new')
  @Throttle({default: {limit:5, ttl: 60_000}})
  async createShortUrl(@Body() createUrlDto: CreateUrlDto) {
    return this.urlsService.createShortCode(createUrlDto);
  }

  @Get(':shortCode')
  // GET /api/v1/shortcode/code
  @Redirect()
  async redirectToOriginalUrl(@Param('shortCode') shortCode: string) {
    const url = await this.urlsService.getDestination(shortCode);
    return { url, statusCode: 302 };
  }

  @Get()
  // GET /api/v1/shortcode
  async findAllUrls() {
    return this.urlsService.findAll();
  }

  @Get('id/:id')
  // GET /api/v1/shortcode/id/:id
  async findUrlbyId(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.urlsService.findOne(id);
  }

  @Patch('id/:id')
  async updateDestinationUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUrlDto: UpdateUrlDto,
  ) {
    return this.urlsService.update(id, updateUrlDto);
  }

  @Delete('id/:id')
  async deleteUrl(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.urlsService.remove(id);
    return { status: 'deleted' };
  }
}
