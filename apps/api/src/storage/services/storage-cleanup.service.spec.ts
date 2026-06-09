// ============================================================
// StorageCleanupService — Tests unitarios (TDD)
//
// Cobertura:
//   1. cleanExpiredPendingAssets — no ejecuta si otro proceso tiene el lock
//   2. cleanExpiredPendingAssets — adquiere lock, ejecuta, libera lock
//   3. purgeDeletedAssets — no ejecuta si otro proceso tiene el lock
//   4. purgeDeletedAssets — libera lock aunque falle la purga
// ============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageObjectService } from './storage-object.service';
import { StorageAssetService } from './storage-asset.service';
import { RedisService } from '../../redis/redis.service';

// ─── Mocks ───────────────────────────────────────────────────
const mockRedisClient = {
  set:  jest.fn(),
  del:  jest.fn(),
};

const mockRedisService = {
  getClient: () => mockRedisClient,
};

const mockObjectService = {
  deleteObject: jest.fn(),
};

const mockAssetService = {
  findExpiredPending:  jest.fn(),
  findDeletedForPurge: jest.fn(),
  hardDelete:          jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────
describe('StorageCleanupService', () => {
  let service: StorageCleanupService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageCleanupService,
        { provide: StorageObjectService, useValue: mockObjectService },
        { provide: StorageAssetService,  useValue: mockAssetService },
        { provide: RedisService,         useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<StorageCleanupService>(StorageCleanupService);
  });

  // ──────────────────────────────────────────────────────────────
  // cleanExpiredPendingAssets — distributed lock
  // ──────────────────────────────────────────────────────────────
  describe('cleanExpiredPendingAssets', () => {

    it('no ejecuta si otro proceso tiene el lock (SET NX devuelve null)', async () => {
      // SET ... NX devuelve null cuando el lock ya existe
      mockRedisClient.set.mockResolvedValue(null);

      await service.cleanExpiredPendingAssets();

      expect(mockAssetService.findExpiredPending).not.toHaveBeenCalled();
    });

    it('ejecuta la limpieza si adquiere el lock correctamente', async () => {
      mockRedisClient.set.mockResolvedValue('OK');           // Lock adquirido
      mockAssetService.findExpiredPending.mockResolvedValue([
        { id: 'a1', key: 'profiles/u1/avatar.jpg' },
        { id: 'a2', key: 'profiles/u2/avatar.jpg' },
      ]);

      await service.cleanExpiredPendingAssets();

      expect(mockAssetService.findExpiredPending).toHaveBeenCalledTimes(1);
      expect(mockAssetService.hardDelete).toHaveBeenCalledWith(['a1', 'a2']);
    });

    it('libera el lock siempre, incluso si la limpieza falla', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockAssetService.findExpiredPending.mockRejectedValue(new Error('DB error'));

      // No debe propagar el error
      await expect(service.cleanExpiredPendingAssets()).resolves.not.toThrow();

      // El lock siempre se libera
      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });

    it('libera el lock después de una ejecución exitosa', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockAssetService.findExpiredPending.mockResolvedValue([]);

      await service.cleanExpiredPendingAssets();

      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });

  });

  // ──────────────────────────────────────────────────────────────
  // purgeDeletedAssets — distributed lock
  // ──────────────────────────────────────────────────────────────
  describe('purgeDeletedAssets', () => {

    it('no ejecuta si otro proceso tiene el lock', async () => {
      mockRedisClient.set.mockResolvedValue(null);

      await service.purgeDeletedAssets();

      expect(mockAssetService.findDeletedForPurge).not.toHaveBeenCalled();
    });

    it('purga assets: borra en R2 y luego en DB', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockAssetService.findDeletedForPurge.mockResolvedValue([
        { id: 'b1', key: 'organizations/org-1/banners/main.png' },
      ]);
      mockObjectService.deleteObject.mockResolvedValue(undefined);

      await service.purgeDeletedAssets();

      expect(mockObjectService.deleteObject).toHaveBeenCalledWith(
        'organizations/org-1/banners/main.png',
      );
      expect(mockAssetService.hardDelete).toHaveBeenCalledWith(['b1']);
    });

    it('libera el lock aunque la purga falle', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockAssetService.findDeletedForPurge.mockRejectedValue(new Error('DB error'));

      await expect(service.purgeDeletedAssets()).resolves.not.toThrow();
      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });

  });

});
