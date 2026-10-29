import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Url } from './entities/url.entity.js';
import { RedisService } from '../../redis/redis.service.js';

import { generateShortCode } from './helpers/short-code.generator.js';

import { CreateUrlDto } from './dto/create-url.dto.js';
import { UpdateUrlDto } from './dto/update-url.dto.js';

const URL_CACHE_TTL_SECONDS = 300;
const MOST_ACCESSED_LIMIT = 10;

@Injectable()
export class UrlsService {
  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,
    private readonly redis: RedisService,
  ) { }

  // 1.CREATE SHORT URL
  async createShortCode(createUrlDto: CreateUrlDto,) {

    // 1.Check if provided url exists in the database
    const existingUrl = await this.urlRepository.findOne(
      {
        where: {
          longUrl: createUrlDto.longUrl
        }
      });

    if (existingUrl) {
      return existingUrl.id;
    }

    // 2. Generate a unique short code
    const shortCode = generateShortCode();

    const url = this.urlRepository.create({
      longUrl: createUrlDto.longUrl,
      shortCode: shortCode,
    });

    try {
      await this.urlRepository.save(url);
      return url;
    } catch (error: unknown) {
      // if mysql finds existing code
      const isDuplicateKey = typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'ER_DUP_ENTRY';

      if (!isDuplicateKey) {
        throw error;
      }

      // Another req may have saved this long url meanwhile
      const existingUrl = await this.urlRepository.findOne({
        where: { longUrl: createUrlDto.longUrl }
      });

      if (existingUrl) {
        return existingUrl;
      }

      throw new InternalServerErrorException('Failed to create a unique short code. Please try again.');
    }
  }

  async getDestination(shortCode: string): Promise<string> {
    const cacheKey = this.destinationCacheKey(shortCode);
    // Cache-aside: check Redis first; a hit avoids a MySQL lookup.
    const cachedDestination = await this.redis.getJson<string>(cacheKey);
    if (cachedDestination) {
      // Count all redirects, including cache hits, so rankings reflect traffic.
      await this.redis.recordUrlAccess(shortCode);
      return this.validateStoredDestination(cachedDestination);
    }

    // A miss falls back to the source of truth. Missing URLs are not cached.
    const url = await this.urlRepository.findOne({ where: { shortCode } });

    if (!url) {
      throw new NotFoundException('Short URL not found');
    }

    // Validate database values before caching too, so corrupt rows cannot
    // become javascript: (or another unsafe protocol) redirects.
    const normalizedDestination = this.validateStoredDestination(url.longUrl);
    await Promise.all([
      // Cache only the normalized destination and give it a bounded five-minute
      // life; update/remove methods also explicitly invalidate this key.
      this.redis.setJson(cacheKey, normalizedDestination, URL_CACHE_TTL_SECONDS),
      this.redis.recordUrlAccess(shortCode),
    ]);
    return normalizedDestination;
  }

  async findMostAccessed(): Promise<Url[]> {
    // Redis stores popularity, while MySQL supplies current URL records.
    const shortCodes = await this.redis.getMostAccessedUrlCodes(MOST_ACCESSED_LIMIT);
    if (shortCodes.length === 0) return [];

    const urls = await this.urlRepository.find({
      where: { shortCode: In(shortCodes) },
    });
    // SQL IN does not preserve the Redis rank order, so restore it explicitly.
    const byShortCode = new Map(urls.map((url) => [url.shortCode, url]));
    return shortCodes
      .map((shortCode) => byShortCode.get(shortCode))
      .filter((url): url is Url => url !== undefined);
  }

  private validateStoredDestination(value: string): string {
    let destination: URL;
    try {
      destination = new URL(value);
    } catch {
      throw new InternalServerErrorException('Stored destination URL is invalid');
    }

    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      throw new InternalServerErrorException('Stored destination URL is invalid');
    }

    return destination.toString();
  }

  private destinationCacheKey(shortCode: string): string {
    // Prefix keys by entity/purpose to avoid collisions with other cache data.
    return `urls:destination:${shortCode}`;
  }

  async findAll() {
    return this.urlRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Url> {
    const url = await this.urlRepository.findOne({ where: { id } });

    if (!url) {
      throw new NotFoundException(`URL with id "${id}" not found`);
    }

    return url;
  }

  async update(id: string, updateUrlDto: UpdateUrlDto): Promise<Url> {
    if (updateUrlDto.longUrl === undefined) {
      throw new BadRequestException('At least one updatable field is required');
    }

    this.assertHttpDestination(updateUrlDto.longUrl);

    const url = await this.findOne(id);
    url.longUrl = new URL(updateUrlDto.longUrl).toString();
    const savedUrl = await this.urlRepository.save(url);
    // Write to MySQL first, then invalidate. The TTL bounds staleness if Redis
    // is unavailable during invalidation.
    await this.redis.delete(this.destinationCacheKey(url.shortCode));
    return savedUrl;
  }

  async remove(id: string): Promise<void> {
    const url = await this.findOne(id);
    await this.urlRepository.remove(url);
    // Remove redirects for deleted URLs immediately when Redis is reachable.
    await this.redis.delete(this.destinationCacheKey(url.shortCode));
  }

  private assertHttpDestination(value: string): void {
    let destination: URL;

    try {
      destination = new URL(value);
    } catch {
      throw new BadRequestException('longUrl must be a valid absolute URL');
    }

    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      throw new BadRequestException('longUrl must use HTTP or HTTPS');
    }
  }
}
