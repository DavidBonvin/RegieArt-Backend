import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GeoService } from './geo.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ────────────────────────────────────────────────────

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
};

const mockRedisService = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

// ─── Helpers ──────────────────────────────────────────────────

function mockFetchBAN(results: object[]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      features: results.map((r: any) => ({
        properties: { label: r.label },
        geometry: { coordinates: [r.lng, r.lat] },
      })),
    }),
  });
}

function mockFetchNominatim(results: object[]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () =>
      results.map((r: any) => ({
        display_name: r.label,
        lat: String(r.lat),
        lon: String(r.lng),
      })),
  });
}

// ─── Test suite ───────────────────────────────────────────────

describe('GeoService', () => {
  let service: GeoService;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<GeoService>(GeoService);
    // Reset Nominatim rate-limit tracker so tests don't wait 1.1s
    (service as any).lastNominatimCallAt = 0;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Uses BAN for FR ────────────────────────────────────────

  describe('geocode — FR uses BAN', () => {
    it('calls BAN API and returns source=BAN', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      mockFetchBAN([{ label: '10 Rue de Rivoli, Paris', lat: 48.857, lng: 2.35 }]);

      const result = await service.geocode({ address: '10 Rue de Rivoli', country: 'FR' });

      expect(result.source).toBe('BAN');
      expect(result.lat).toBeCloseTo(48.857);
      expect(result.lng).toBeCloseTo(2.35);
      expect(result.displayAddress).toBe('10 Rue de Rivoli, Paris');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(fetchCall).toContain('api-adresse.data.gouv.fr');
    });
  });

  // ─── Uses Nominatim for non-FR ──────────────────────────────

  describe('geocode — non-FR uses Nominatim', () => {
    it('calls Nominatim API and returns source=nominatim for BE', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      mockFetchNominatim([{ label: 'Rue de la Loi, Brussels', lat: 50.846, lng: 4.352 }]);

      const result = await service.geocode({ address: 'Rue de la Loi', country: 'BE' });

      expect(result.source).toBe('nominatim');
      expect(result.lat).toBeCloseTo(50.846);
      expect(result.displayAddress).toBe('Rue de la Loi, Brussels');

      const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('nominatim.openstreetmap.org');
      expect(url).toContain('countrycode=be');
      expect((opts as RequestInit).headers).toMatchObject({
        'User-Agent': 'RegieArtApp/1.0 (contact@regieart.com)',
      });
    });
  });

  // ─── Returns cached result without calling external API ─────

  describe('geocode — cache hit', () => {
    it('returns cached result without calling fetch', async () => {
      const cached = {
        lat: 48.857,
        lng: 2.35,
        displayAddress: 'Cached Address',
        source: 'BAN',
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.geocode({ address: 'anything', country: 'FR' });

      expect(result).toEqual(cached);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Throws NotFoundException when API returns empty ────────

  describe('geocode — no results', () => {
    it('throws NotFoundException when BAN returns empty features', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [] }),
      });

      await expect(
        service.geocode({ address: 'nonexistent xyz', country: 'FR' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when Nominatim returns empty array', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await expect(
        service.geocode({ address: 'nonexistent xyz', country: 'DE' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
