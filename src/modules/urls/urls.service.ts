import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Url } from './entities/url.entity.js';

import { generateShortCode } from './helpers/short-code.generator.js';

import { CreateUrlDto } from './dto/create-url.dto.js';
import { UpdateUrlDto } from './dto/update-url.dto.js';

@Injectable()
export class UrlsService {
  constructor(
    @InjectRepository(Url)
    private readonly urlRepository: Repository<Url>,

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
    const url = await this.urlRepository.findOne({ where: { shortCode } });

    if (!url) {
      throw new NotFoundException('Short URL not found');
    }

    // Validate persisted values too, so corrupted or manually edited rows can
    // never turn this endpoint into a javascript: or other unsafe redirect.
    let destination: URL;
    try {
      destination = new URL(url.longUrl);
    } catch {
      throw new InternalServerErrorException('Stored destination URL is invalid');
    }

    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      throw new InternalServerErrorException('Stored destination URL is invalid');
    }

    return destination.toString();
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
    return this.urlRepository.save(url);
  }

  async remove(id: string): Promise<void> {
    const url = await this.findOne(id);
    await this.urlRepository.remove(url);
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
