export interface RouteLeg {
  from: string;
  distanceKm: number;
  durationMin: number;
}

export class RouteResultDto {
  vehicleId: string;
  originAddress: string;
  venueAddress: string;
  waypointsCount: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  suggestedDepartureAt: string;
  legs: RouteLeg[];
  cached: boolean;
}
