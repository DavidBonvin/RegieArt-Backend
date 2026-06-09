// ============================================================
// StorageAssetService — Tests unitarios (TDD)
//
// Cobertura:
//   1. getDownloadUrl — obtiene URL de descarga por assetId (sin exponer la key interna)
//   2. getDownloadUrl — lanza NotFoundException si el asset no existe
//   3. getDownloadUrl — lanza ForbiddenException si el asset no pertenece al usuario
// ============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorageAssetService } from './storage-asset.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Mock mínimo de Prisma ────────────────────────────────────
const mockPrisma = {
  asset: {
    create:     jest.fn(),
    upsert:     jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
    findMany:   jest.fn(),
    count:      jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAsset = {
  id:            'asset-id-1',
  key:           'organizations/org-123/banners/main.png',
  assetType:     'ORG_BANNER',
  contentType:   'image/png',
  sizeBytes:     BigInt(204800),
  status:        'CONFIRMED',
  etag:          'abc123',
  displayName:   'Banner',
  originalName:  'banner.png',
  description:   null,
  tags:          [],
  language:      'es',
  durationSeconds: null,
  width:         1200,
  height:        400,
  pageCount:     null,
  bitrate:       null,
  isMultipart:   false,
  uploadId:      null,
  partCount:     null,
  uploadedById:  'user-owner',
  orgId:         'org-123',
  songId:        null,
  eventId:       null,
  memberId:      null,
  version:       1,
  replacesId:    null,
  isPublic:      false,
  expiresAt:     null,
  createdAt:     new Date('2026-06-01'),
  confirmedAt:   new Date('2026-06-01'),
  deletedAt:     null,
  updatedAt:     new Date('2026-06-01'),
};

describe('StorageAssetService', () => {
  let service: StorageAssetService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageAssetService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StorageAssetService>(StorageAssetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────
  // findById — comportamiento base
  // ──────────────────────────────────────────────────────────────
  describe('findById', () => {

    it('retorna el asset serializado si existe', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(mockAsset);

      const result = await service.findById('asset-id-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('asset-id-1');
      // BigInt debe ser serializado como number
      expect(typeof result!.sizeBytes).toBe('number');
      expect(result!.sizeBytes).toBe(204800);
    });

    it('retorna null si el asset no existe', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      const result = await service.findById('nonexistent');
      expect(result).toBeNull();
    });

  });

  // ──────────────────────────────────────────────────────────────
  // assertCanDownload — control de acceso para descargas por ID
  // ──────────────────────────────────────────────────────────────
  describe('assertCanDownload', () => {

    it('no lanza excepción si el usuario es el dueño (uploadedById)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(mockAsset);

      await expect(
        service.assertCanDownload('asset-id-1', 'user-owner', []),
      ).resolves.not.toThrow();
    });

    it('no lanza excepción si el usuario es miembro de la org del asset', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(mockAsset);

      await expect(
        service.assertCanDownload('asset-id-1', 'user-other', ['org-123']),
      ).resolves.not.toThrow();
    });

    it('lanza NotFoundException si el asset no existe', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      await expect(
        service.assertCanDownload('nonexistent', 'user-abc', []),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no tiene acceso', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(mockAsset);

      await expect(
        service.assertCanDownload('asset-id-1', 'user-stranger', ['org-other']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('no lanza excepción si el asset es público (cualquier usuario autenticado puede)', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue({ ...mockAsset, isPublic: true });

      await expect(
        service.assertCanDownload('asset-id-1', 'user-stranger', []),
      ).resolves.not.toThrow();
    });

  });

});
