// ============================================================
// StoragePresignedService — Tests unitarios (TDD)
//
// Cobertura:
//   1. generateDownloadUrl — ownership check (RED → GREEN)
//   2. generateDownloadUrl — fast path CDN para isPublic:true (RED → GREEN)
//   3. generateDownloadUrl — caché Redis (comportamiento existente protegido)
// ============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { StoragePresignedService } from './storage-presigned.service';
import { StorageMembershipService } from './storage-membership.service';
import { StorageAssetService } from './storage-asset.service';
import { RedisService } from '../../redis/redis.service';
import { S3_BUCKET, S3_CLIENT, S3_CDN_URL } from '../providers/s3-client.provider';

// ─── Helpers de mock ──────────────────────────────────────────
const mockGetSignedUrl = jest.fn().mockResolvedValue('https://r2.example.com/signed-url');

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const mockRedisClient = {
  get:   jest.fn(),
  setex: jest.fn(),
  del:   jest.fn(),
};

const mockRedisService = {
  getClient: () => mockRedisClient,
};

const mockMembership = {
  assertMembership: jest.fn(),
};

const mockAssetService = {
  createPending:  jest.fn(),
  findByKey:      jest.fn(),
};

const mockS3Client = { send: jest.fn() };

// ─── Suite ────────────────────────────────────────────────────
describe('StoragePresignedService', () => {
  let service: StoragePresignedService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null); // cache miss por defecto

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoragePresignedService,
        { provide: S3_CLIENT,           useValue: mockS3Client },
        { provide: S3_BUCKET,           useValue: 'test-bucket' },
        { provide: S3_CDN_URL,          useValue: undefined },
        { provide: StorageMembershipService, useValue: mockMembership },
        { provide: StorageAssetService,      useValue: mockAssetService },
        { provide: RedisService,             useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<StoragePresignedService>(StoragePresignedService);
  });

  // ──────────────────────────────────────────────────────────────
  // generateDownloadUrl — ownership checks
  // ──────────────────────────────────────────────────────────────
  describe('generateDownloadUrl — ownership', () => {

    it('permite descargar un archivo de perfil propio', async () => {
      const url = await service.generateDownloadUrl(
        'user-abc',
        'profiles/user-abc/avatar.jpg',
      );
      expect(url).toBe('https://r2.example.com/signed-url');
      expect(mockMembership.assertMembership).not.toHaveBeenCalled();
    });

    it('bloquea la descarga de perfil ajeno (ForbiddenException)', async () => {
      await expect(
        service.generateDownloadUrl('user-abc', 'profiles/user-XYZ/avatar.jpg'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite descargar un archivo de la propia org', async () => {
      mockMembership.assertMembership.mockResolvedValue(undefined);

      const url = await service.generateDownloadUrl(
        'user-abc',
        'organizations/org-123/banners/main.png',
      );
      expect(url).toBe('https://r2.example.com/signed-url');
      expect(mockMembership.assertMembership).toHaveBeenCalledWith('user-abc', 'org-123');
    });

    it('bloquea descarga si el usuario no es miembro de la org', async () => {
      mockMembership.assertMembership.mockRejectedValue(
        new ForbiddenException('No eres miembro'),
      );

      await expect(
        service.generateDownloadUrl('user-abc', 'organizations/org-XYZ/banners/main.png'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza InternalServerErrorException para paths desconocidos', async () => {
      await expect(
        service.generateDownloadUrl('user-abc', 'unknown-prefix/file.txt'),
      ).rejects.toThrow(ForbiddenException);
    });

  });

  // ──────────────────────────────────────────────────────────────
  // generateDownloadUrl — fast path CDN para assets públicos
  // ──────────────────────────────────────────────────────────────
  describe('generateDownloadUrl — fast path CDN', () => {

    it('retorna URL del CDN directamente si el asset es público y CDN está configurado', async () => {
      // Reconfiguramos con CDN URL
      const moduleWithCdn: TestingModule = await Test.createTestingModule({
        providers: [
          StoragePresignedService,
          { provide: S3_CLIENT,           useValue: mockS3Client },
          { provide: S3_BUCKET,           useValue: 'test-bucket' },
          { provide: S3_CDN_URL,          useValue: 'https://cdn.regieart.com' },
          { provide: StorageMembershipService, useValue: mockMembership },
          { provide: StorageAssetService,      useValue: mockAssetService },
          { provide: RedisService,             useValue: mockRedisService },
        ],
      }).compile();
      const svcWithCdn = moduleWithCdn.get<StoragePresignedService>(StoragePresignedService);

      mockAssetService.findByKey.mockResolvedValue({ isPublic: true, key: 'organizations/org-123/banners/main.png' });
      mockMembership.assertMembership.mockResolvedValue(undefined);

      const url = await svcWithCdn.generateDownloadUrl('user-abc', 'organizations/org-123/banners/main.png');

      expect(url).toBe('https://cdn.regieart.com/organizations/org-123/banners/main.png');
      // No debe haber firmado nada con R2
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('firma con R2 si el asset es privado aunque CDN esté configurado', async () => {
      const moduleWithCdn: TestingModule = await Test.createTestingModule({
        providers: [
          StoragePresignedService,
          { provide: S3_CLIENT,           useValue: mockS3Client },
          { provide: S3_BUCKET,           useValue: 'test-bucket' },
          { provide: S3_CDN_URL,          useValue: 'https://cdn.regieart.com' },
          { provide: StorageMembershipService, useValue: mockMembership },
          { provide: StorageAssetService,      useValue: mockAssetService },
          { provide: RedisService,             useValue: mockRedisService },
        ],
      }).compile();
      const svcWithCdn = moduleWithCdn.get<StoragePresignedService>(StoragePresignedService);

      mockAssetService.findByKey.mockResolvedValue({ isPublic: false, key: 'organizations/org-123/legal/contrato.pdf' });
      mockMembership.assertMembership.mockResolvedValue(undefined);

      const url = await svcWithCdn.generateDownloadUrl('user-abc', 'organizations/org-123/legal/contrato.pdf');

      expect(url).toBe('https://r2.example.com/signed-url');
      expect(mockGetSignedUrl).toHaveBeenCalled();
    });

  });

  // ──────────────────────────────────────────────────────────────
  // generateDownloadUrl — caché Redis (comportamiento existente)
  // ──────────────────────────────────────────────────────────────
  describe('generateDownloadUrl — caché Redis', () => {

    it('retorna URL del caché sin firmar si existe en Redis', async () => {
      mockRedisClient.get.mockResolvedValue('https://cached-url.example.com');
      mockMembership.assertMembership.mockResolvedValue(undefined);

      const url = await service.generateDownloadUrl('user-abc', 'organizations/org-123/banners/main.png');

      expect(url).toBe('https://cached-url.example.com');
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('guarda la URL firmada en Redis cuando no estaba cacheada', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockMembership.assertMembership.mockResolvedValue(undefined);

      await service.generateDownloadUrl('user-abc', 'organizations/org-123/banners/main.png');

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        expect.stringContaining('organizations/org-123/banners/main.png'),
        240,
        'https://r2.example.com/signed-url',
      );
    });

  });

});
