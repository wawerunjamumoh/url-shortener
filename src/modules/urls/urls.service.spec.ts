import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UrlsService } from './urls.service.js';
import { Url } from './entities/url.entity.js';

describe('UrlsService', () => {
  let service: UrlsService;
  const urlRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlsService,
        { provide: getRepositoryToken(Url), useValue: urlRepository },
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
    const url = { id: 'url-id', longUrl: 'https://old.example' };
    urlRepository.findOne.mockResolvedValue(url);
    urlRepository.save.mockImplementation(async (value) => value);

    await expect(
      service.update('url-id', { longUrl: 'https://new.example/path' }),
    ).resolves.toMatchObject({ longUrl: 'https://new.example/path' });
    expect(urlRepository.save).toHaveBeenCalledWith(url);
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
