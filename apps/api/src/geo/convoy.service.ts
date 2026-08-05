import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GeoService } from './geo.service';
import { RouteResultDto, RouteLeg } from './dto/route-result.dto';

const ROUTE_CACHE_TTL = 86400; // 24 hours
const PICKUP_BUFFER_MIN = 3;   // buffer per pickup stop
const ARRIVAL_BUFFER_MIN = 15; // fixed arrival buffer at venue

// OSRM response shapes
interface OsrmLeg {
  distance: number; // meters
  duration: number; // seconds
}
interface OsrmRoute {
  legs: OsrmLeg[];
  distance: number;
  duration: number;
}
interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
}

// Vehicle with pickups and event.venue loaded
interface VehicleWithRelations {
  id: string;
  eventId: string;
  name: string;
  driverName: string | null;
  originAddress: string | null;
  originLat: number | null;
  originLng: number | null;
  pickups: Array<{
    id: string;
    address: string;
    lat: number | null;
    lng: number | null;
    order: number;
    time: Date;
  }>;
  event: {
    startTime: Date;
    venue: {
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      name: string;
    } | null;
  };
  passengers: Array<{ id: string }>;
}

@Injectable()
export class ConvoyService {
  private readonly logger = new Logger(ConvoyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geo: GeoService,
  ) {}

  // ─── Route calculation ────────────────────────────────────────

  async calculateRoute(eventId: string, vehicleId: string): Promise<RouteResultDto> {
    const vehicle = await this.loadVehicle(vehicleId, eventId);

    const venue = vehicle.event.venue;
    if (!venue?.latitude || !venue?.longitude) {
      throw new BadRequestException('Venue has no GPS coordinates. Add them first.');
    }

    // Geocode origin if coordinates are missing
    if (!vehicle.originLat || !vehicle.originLng) {
      if (!vehicle.originAddress) {
        throw new BadRequestException('Vehicle has no origin address or coordinates.');
      }
      const geo = await this.geo.geocode({ address: vehicle.originAddress, country: 'FR' });
      await this.prisma.eventVehicle.update({
        where: { id: vehicleId },
        data: { originLat: geo.lat, originLng: geo.lng },
      });
      vehicle.originLat = geo.lat;
      vehicle.originLng = geo.lng;
    }

    // Build ordered waypoints: [origin, ...pickups_asc, venue]
    const orderedPickups = [...vehicle.pickups].sort((a, b) => a.order - b.order);

    const waypoints: Array<{ lat: number; lng: number; label: string }> = [
      { lat: vehicle.originLat!, lng: vehicle.originLng!, label: 'Origin' },
      ...orderedPickups.map((p) => ({
        lat: p.lat ?? 0,
        lng: p.lng ?? 0,
        label: p.address,
      })),
      {
        lat: venue.latitude!,
        lng: venue.longitude!,
        label: venue.address ?? venue.name,
      },
    ];

    const waypointsHash = this.hashWaypoints(waypoints);
    const cacheKey = `geo:route:${waypointsHash}`;

    // Check Redis cache
    const cached = await this.getCachedRoute(cacheKey);
    if (cached) {
      return { ...cached, vehicleId, cached: true };
    }

    // Call OSRM
    const osrmResult = await this.callOsrm(waypoints);

    const totalDistanceKm = Math.round((osrmResult.distance / 1000) * 10) / 10;
    const totalDurationMin = Math.ceil(osrmResult.duration / 60);

    const suggestedDepartureAt = this.calcDepartureTime(
      vehicle.event.startTime,
      totalDurationMin,
      orderedPickups.length,
    );

    const legs: RouteLeg[] = osrmResult.legs.map((leg, i) => ({
      from: waypoints[i].label,
      distanceKm: Math.round((leg.distance / 1000) * 10) / 10,
      durationMin: Math.ceil(leg.duration / 60),
    }));

    const venueAddress = venue.address ?? venue.name;

    // Persist to DB
    await this.prisma.eventVehicle.update({
      where: { id: vehicleId },
      data: {
        routeDistanceKm: totalDistanceKm,
        routeDurationMin: totalDurationMin,
        suggestedDepartureAt,
      },
    });

    const result: RouteResultDto = {
      vehicleId,
      originAddress: vehicle.originAddress ?? '',
      venueAddress,
      waypointsCount: waypoints.length,
      totalDistanceKm,
      totalDurationMin,
      suggestedDepartureAt: suggestedDepartureAt.toISOString(),
      legs,
      cached: false,
    };

    await this.setCachedRoute(cacheKey, result);
    return result;
  }

  // ─── Convoy summary ───────────────────────────────────────────

  async getConvoySummary(eventId: string) {
    const vehicles = await this.prisma.eventVehicle.findMany({
      where: { eventId },
      include: {
        pickups: { orderBy: { order: 'asc' } },
        passengers: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return vehicles.map((v) => ({
      vehicleId: v.id,
      name: v.name,
      driverName: v.driverName,
      passengersCount: v.passengers.length,
      originAddress: v.originAddress,
      routeDistanceKm: v.routeDistanceKm,
      routeDurationMin: v.routeDurationMin,
      suggestedDepartureAt: v.suggestedDepartureAt?.toISOString() ?? null,
      routeCalculated: v.routeDistanceKm !== null,
      pickups: v.pickups.map((p) => ({
        address: p.address,
        time: p.time.toISOString(),
        order: p.order,
      })),
    }));
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async loadVehicle(vehicleId: string, eventId: string): Promise<VehicleWithRelations> {
    const vehicle = await this.prisma.eventVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        pickups: { orderBy: { order: 'asc' } },
        passengers: true,
        event: {
          select: {
            startTime: true,
            venue: {
              select: {
                latitude: true,
                longitude: true,
                address: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!vehicle || vehicle.eventId !== eventId) {
      throw new ForbiddenException();
    }

    return vehicle as unknown as VehicleWithRelations;
  }

  private async callOsrm(
    waypoints: Array<{ lat: number; lng: number }>,
  ): Promise<OsrmRoute> {
    const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      this.logger.error(`OSRM unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Route calculation service unavailable');
    }

    if (!res.ok) {
      this.logger.error(`OSRM ${res.status}`);
      throw new ServiceUnavailableException('Route calculation service unavailable');
    }

    const data = (await res.json()) as OsrmResponse;
    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new ServiceUnavailableException('Route calculation service unavailable');
    }

    return data.routes[0];
  }

  calcDepartureTime(startTime: Date, durationMin: number, numPickups: number): Date {
    const bufferMin = durationMin + numPickups * PICKUP_BUFFER_MIN + ARRIVAL_BUFFER_MIN;
    return new Date(startTime.getTime() - bufferMin * 60 * 1000);
  }

  private hashWaypoints(waypoints: Array<{ lat: number; lng: number }>): string {
    const str = waypoints.map((w) => `${w.lat},${w.lng}`).join('|');
    return createHash('sha256').update(str).digest('hex');
  }

  private async getCachedRoute(key: string): Promise<RouteResultDto | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (raw) return JSON.parse(raw) as RouteResultDto;
    } catch {
      this.logger.debug('Redis unavailable, bypassing route cache read');
    }
    return null;
  }

  private async setCachedRoute(key: string, value: RouteResultDto): Promise<void> {
    try {
      await this.redis.getClient().setex(key, ROUTE_CACHE_TTL, JSON.stringify(value));
    } catch {
      this.logger.debug('Redis unavailable, route result not cached');
    }
  }
}
