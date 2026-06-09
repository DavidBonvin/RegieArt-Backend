// ============================================================
// StorageMultipartService — Tests unitarios (TDD)
//
// Cobertura:
//   1. abort — debe eliminar el asset PENDING de la DB tras abortar en R2
//   2. abort — ownership check
//   3. complete — ownership check
// ============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { StorageMultipartService } from './storage-multipart.service';
import { StorageMembershipService } from './storage-membership.service';
import { StorageAssetService } from './storage-asset.service';
import { S3_BUCKET, S3_CLIENT } from '../providers/s3-client.provider';

// ─── Mocks ───────────────────────────────────────────────────
const mockS3Send = jest.fn();
const mockS3Client = { send: mockS3Send };

const mockMembership = {
  assertMembership: jest.fn(),
};

const mockAssetService = {
  findByKey:     jest.fn(),
  hardDelete:    jest.fn(),
  createPending: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────
describe('StorageMultipartService', () => {
  let service: StorageMultipartService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockS3Send.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageMultipartService,
        { provide: S3_CLIENT,                useValue: mockS3Client },
        { provide: S3_BUCKET,                useValue: 'test-bucket' },
        { provide: StorageMembershipService, useValue: mockMembership },
        { provide: StorageAssetService,      useValue: mockAssetService },
      ],
    }).compile();

    service = module.get<StorageMultipartService>(StorageMultipartService);
  });

  // ──────────────────────────────────────────────────────────────
  // abort — limpia el asset PENDING en DB
  // ──────────────────────────────────────────────────────────────
  describe('abort', () => {

    const dto = {
      key:      'organizations/org-123/events/ev-1/videos/uuid.mp4',
      uploadId: 'upload-id-abc',
    };

    it('elimina el asset PENDING de la DB después de abortar en R2', async () => {
      mockMembership.assertMembership.mockResolvedValue(undefined);
      mockAssetService.findByKey.mockResolvedValue({ id: 'asset-id-xyz', key: dto.key });

      await service.abort('user-abc', dto);

      // Debe haber enviado AbortMultipartUpload a R2
      expect(mockS3Send).toHaveBeenCalledTimes(1);

      // Debe haber buscado el asset por key
      expect(mockAssetService.findByKey).toHaveBeenCalledWith(dto.key);

      // Debe haber borrado el asset de la DB
      expect(mockAssetService.hardDelete).toHaveBeenCalledWith(['asset-id-xyz']);
    });

    it('no falla si el asset no existe en la DB (graceful)', async () => {
      mockMembership.assertMembership.mockResolvedValue(undefined);
      mockAssetService.findByKey.mockResolvedValue(null); // no existe

      await expect(service.abort('user-abc', dto)).resolves.not.toThrow();
      expect(mockAssetService.hardDelete).not.toHaveBeenCalled();
    });

    it('bloquea si el usuario no es miembro de la org', async () => {
      mockMembership.assertMembership.mockRejectedValue(
        new ForbiddenException('No eres miembro'),
      );

      await expect(service.abort('user-abc', dto)).rejects.toThrow(ForbiddenException);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('completa incluso si el abort en R2 falla (el asset si se limpia)', async () => {
      mockMembership.assertMembership.mockResolvedValue(undefined);
      mockS3Send.mockRejectedValue(new Error('R2 timeout'));
      mockAssetService.findByKey.mockResolvedValue({ id: 'asset-id-xyz', key: dto.key });

      // No debe lanzar excepción — el abort en R2 falla silenciosamente
      await expect(service.abort('user-abc', dto)).resolves.not.toThrow();

      // Pero sí debe limpiar la DB
      expect(mockAssetService.hardDelete).toHaveBeenCalledWith(['asset-id-xyz']);
    });

  });

  // ──────────────────────────────────────────────────────────────
  // complete — ownership check
  // ──────────────────────────────────────────────────────────────
  describe('complete', () => {

    const dto = {
      key:      'organizations/org-123/events/ev-1/videos/uuid.mp4',
      uploadId: 'upload-id-abc',
      parts: [
        { partNumber: 1, etag: '"etag1"' },
        { partNumber: 2, etag: '"etag2"' },
      ],
    };

    it('bloquea complete si el usuario no es miembro de la org', async () => {
      mockMembership.assertMembership.mockRejectedValue(
        new ForbiddenException('No eres miembro'),
      );

      await expect(service.complete('user-abc', dto)).rejects.toThrow(ForbiddenException);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('completa el multipart si el usuario es miembro', async () => {
      mockMembership.assertMembership.mockResolvedValue(undefined);
      mockS3Send.mockResolvedValue({ ETag: '"final-etag"' });

      const result = await service.complete('user-abc', dto);

      expect(result).toEqual({ key: dto.key, etag: 'final-etag' });
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

  });

});
