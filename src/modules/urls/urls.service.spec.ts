import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UrlsService } from './urls.service.js';
import { Url } from './entities/url.entity.js';
import { RedisService } from '../../redis/redis.service.js';

describe('UrlsService', () => {
  let service: UrlsService;
  const urlRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  const redis = {
    getJson: vi.fn(),
    setJson: vi.fn(),
    delete: vi.fn(),
    recordUrlAccess: vi.fn(),
    getMostAccessedUrlCodes: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    redis.getJson.mockResolvedValue(null);
    redis.setJson.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(undefined);
    redis.recordUrlAccess.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,
        { provide: getRepositoryToken(Url), useValue: urlRepository },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<UrlsService>(UrlsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('resolves a valid destination for a known short code', async () => {
    urlRepository.findOne.mockResolvedValue({
      shortCode: 'abc12345',
      longUrl: 'https://example.com/path',
    });

    await expect(service.getDestination('abc12345')).resolves.toBe(
      'https://example.com/path',
    );
    expect(urlRepository.findOne).toHaveBeenCalledWith({
      where: { shortCode: 'abc12345' },
    });
    expect(redis.setJson).toHaveBeenCalledWith(
      'urls:destination:abc12345',
      'https://example.com/path',
      300,
    );
    expect(redis.recordUrlAccess).toHaveBeenCalledWith('abc12345');
  });

  it('serves a cached destination and counts the access without querying MySQL', async () => {
    redis.getJson.mockResolvedValue('https://cached.example/path');
    redis.recordUrlAccess.mockResolvedValue(undefined);

    await expect(service.getDestination('hot-code')).resolves.toBe(
      'https://cached.example/path',
    );
    expect(urlRepository.findOne).not.toHaveBeenCalled();
    expect(redis.recordUrlAccess).toHaveBeenCalledWith('hot-code');
  });

  it('returns not found for an unknown short code', async () => {
    urlRepository.findOne.mockResolvedValue(null);

    await expect(service.getDestination('missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses unsafe stored protocols', async () => {
    urlRepository.findOne.mockResolvedValue({
      shortCode: 'abc12345',
      longUrl: 'javascript:alert(1)',
    });

    await expect(service.getDestination('abc12345')).rejects.toMatchObject({
      status: 500,
    });
  });

  it('lists URLs ordered newest first', async () => {
    const urls = [{ id: 'url-id' }];
    urlRepository.find.mockResolvedValue(urls);

    await expect(service.findAll()).resolves.toBe(urls);
    expect(urlRepository.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
    });
  });

  it('returns current URL rows in Redis popularity order', async () => {
    redis.getMostAccessedUrlCodes.mockResolvedValue(['second', 'first']);
    urlRepository.find.mockResolvedValue([
      { shortCode: 'first', id: '1' },
      { shortCode: 'second', id: '2' },
    ]);

    await expect(service.findMostAccessed()).resolves.toEqual([
      { shortCode: 'second', id: '2' },
      { shortCode: 'first', id: '1' },
    ]);
  });

  it('finds a URL by UUID', async () => {
    const url = { id: 'url-id', longUrl: 'https://example.com' };
    urlRepository.findOne.mockResolvedValue(url);

    await expect(service.findOne('url-id')).resolves.toBe(url);
    expect(urlRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'url-id' },
    });
  });

  it('returns 404 when a URL ID does not exist', async () => {
    urlRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('updates and saves the destination URL', async () => {
    const url = {
      id: 'url-id',
      shortCode: 'abc12345',
      longUrl: 'https://old.example',
    };
    urlRepository.findOne.mockResolvedValue(url);
    urlRepository.save.mockImplementation(async (value) => value);

    await expect(
      service.update('url-id', { longUrl: 'https://new.example/path' }),
    ).resolves.toMatchObject({ longUrl: 'https://new.example/path' });
    expect(urlRepository.save).toHaveBeenCalledWith(url);
    expect(redis.delete).toHaveBeenCalledWith('urls:destination:abc12345');
  });

  it('rejects an empty update', async () => {
    await expect(service.update('url-id', {})).rejects.toMatchObject({ status: 400 });
    expect(urlRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects non-HTTP destinations during update', async () => {
    await expect(
      service.update('url-id', { longUrl: 'javascript:alert(1)' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(urlRepository.findOne).not.toHaveBeenCalled();
  });

  it('removes an existing URL', async () => {
    const url = { id: 'url-id', longUrl: 'https://example.com' };
    urlRepository.findOne.mockResolvedValue(url);
    urlRepository.remove.mockResolvedValue(url);

    await expect(service.remove('url-id')).resolves.toBeUndefined();
    expect(urlRepository.remove).toHaveBeenCalledWith(url);
  });

  it('does not remove an unknown URL', async () => {
    urlRepository.findOne.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toMatchObject({ status: 404 });
    expect(urlRepository.remove).not.toHaveBeenCalled();
  });
});
