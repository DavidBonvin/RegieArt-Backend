import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConvoyService } from './convoy.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GeoService } from './geo.service';

// ─── Mocks ────────────────────────────────────────────────────

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
};

const mockRedisService = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockGeoService = {
  geocode: jest.fn(),
};

// Base vehicle fixture
function makeVehicle(overrides: Partial<any> = {}): any {
  return {
    id: 'vehicle-1',
    eventId: 'event-1',
    name: 'Van',
    driverName: 'Alice',
    originAddress: '1 Rue de la Paix, Paris',
    originLat: 48.87,
    originLng: 2.33,
    pickups: [],
    passengers: [],
    event: {
      startTime: new Date('2026-08-10T20:00:00.000Z'),
      venue: {
        latitude: 48.9,
        longitude: 2.4,
        address: 'Salle Pleyel, Paris',
        name: 'Salle Pleyel',
      },
    },
    ...overrides,
  };
}

// Mock OSRM response
function mockOsrmResponse(distanceM: number, durationS: number, legCount: number) {
  const legs = Array.from({ length: legCount }, () => ({
    distance: distanceM / legCount,
    duration: durationS / legCount,
  }));
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      code: 'Ok',
      routes: [{ distance: distanceM, duration: durationS, legs }],
    }),
  });
}

// ─── Test suite ───────────────────────────────────────────────

describe('ConvoyService', () => {
  let service: ConvoyService;
  let prisma: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConvoyService,
        {
          provide: PrismaService,
          useValue: {
            eventVehicle: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: GeoService, useValue: mockGeoService },
      ],
    }).compile();

    service = module.get<ConvoyService>(ConvoyService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Departure time calculation ────────────────────────────

  describe('calcDepartureTime', () => {
    it('calculates departure with 2 pickups: 20:00 - 45min - 6min - 15min = 18:59', () => {
      // startTime = 20:00 UTC, routeDuration = 45 min, 2 pickups
      // expected = 20:00 - 45 - (2*3) - 15 = 20:00 - 66min = 18:54
      const startTime = new Date('2026-08-10T20:00:00.000Z');
      const result = service.calcDepartureTime(startTime, 45, 2);

      // 45 + 6 + 15 = 66 minutes before 20:00 = 18:54
      const expected = new Date('2026-08-10T18:54:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  // ─── Throws BadRequestException when venue has no coordinates

  describe('calculateRoute — no venue coordinates', () => {
    it('throws BadRequestException when venue has no lat/lng', async () => {
      const vehicle = makeVehicle({
        event: {
          startTime: new Date(),
          venue: { latitude: null, longitude: null, address: 'Somewhere', name: 'Venue' },
        },
      });
      jest.spyOn(prisma.eventVehicle, 'findUnique').mockResolvedValueOnce(vehicle);

      await expect(service.calculateRoute('event-1', 'vehicle-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── Returns cached route without calling OSRM ─────────────

  describe('calculateRoute — cache hit', () => {
    it('returns cached result without calling OSRM', async () => {
      const vehicle = makeVehicle();
      jest.spyOn(prisma.eventVehicle, 'findUnique').mockResolvedValueOnce(vehicle);

      const cachedResult = {
        vehicleId: 'vehicle-1',
        originAddress: '1 Rue de la Paix, Paris',
        venueAddress: 'Salle Pleyel, Paris',
        waypointsCount: 2,
        totalDistanceKm: 10.5,
        totalDurationMin: 25,
        suggestedDepartureAt: '2026-08-10T19:20:00.000Z',
        legs: [],
        cached: false,
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedResult));

      const result = await service.calculateRoute('event-1', 'vehicle-1');

      expect(result.cached).toBe(true);
      expect(result.totalDistanceKm).toBe(10.5);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Throws ForbiddenException when vehicle not in event ────

  describe('calculateRoute — vehicle not in event', () => {
    it('throws ForbiddenException when vehicle.eventId does not match', async () => {
      jest.spyOn(prisma.eventVehicle, 'findUnique').mockResolvedValueOnce(null);

      await expect(service.calculateRoute('event-1', 'vehicle-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── Throws ServiceUnavailableException when OSRM unreachable

  describe('calculateRoute — OSRM unavailable', () => {
    it('throws ServiceUnavailableException when fetch throws', async () => {
      const vehicle = makeVehicle();
      jest.spyOn(prisma.eventVehicle, 'findUnique').mockResolvedValueOnce(vehicle);
      mockRedisClient.get.mockResolvedValueOnce(null);
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.calculateRoute('event-1', 'vehicle-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // ─── Stores result in EventVehicle after successful OSRM call

  describe('calculateRoute — successful OSRM call', () => {
    it('saves routeDistanceKm, routeDurationMin, suggestedDepartureAt to DB', async () => {
      const vehicle = makeVehicle({
        pickups: [
          { id: 'p1', address: 'Stop 1', lat: 48.88, lng: 2.34, order: 0, time: new Date() },
        ],
      });
      jest.spyOn(prisma.eventVehicle, 'findUnique').mockResolvedValueOnce(vehicle);
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      // 2 waypoints (origin, 1 pickup, venue) → 2 legs
      mockOsrmResponse(15000, 1800, 2); // 15 km, 30 min
      jest.spyOn(prisma.eventVehicle, 'update').mockResolvedValue({} as any);

      const result = await service.calculateRoute('event-1', 'vehicle-1');

      expect(result.totalDistanceKm).toBe(15);
      expect(result.totalDurationMin).toBe(30);
      expect(result.cached).toBe(false);

      expect(prisma.eventVehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'vehicle-1' },
          data: expect.objectContaining({
            routeDistanceKm: 15,
            routeDurationMin: 30,
          }),
        }),
      );
    });
  });
});
