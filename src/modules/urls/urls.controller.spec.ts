import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UrlsController } from './urls.controller.js';
import { UrlsService } from './urls.service.js';

describe('UrlsController', () => {
  let controller: UrlsController;
  const urlsService = {
    createShortCode: vi.fn(),
    getDestination: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UrlsController],
      providers: [{ provide: UrlsService, useValue: urlsService }],
    }).compile();

    controller = module.get<UrlsController>(UrlsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns a temporary redirect to the resolved destination', async () => {
    urlsService.getDestination.mockResolvedValue('https://example.com/');

    await expect(controller.redirectToOriginalUrl('abc12345')).resolves.toEqual({
      url: 'https://example.com/',
      statusCode: 302,
    });
    expect(urlsService.getDestination).toHaveBeenCalledWith('abc12345');
  });

  it('propagates not-found errors for unknown short codes', async () => {
    urlsService.getDestination.mockRejectedValue(new NotFoundException());

    await expect(controller.redirectToOriginalUrl('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
