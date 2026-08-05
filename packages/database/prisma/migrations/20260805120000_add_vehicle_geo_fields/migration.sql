-- AlterTable: add geo/route fields to event_vehicles for GeoModule
ALTER TABLE "event_vehicles" ADD COLUMN     "originAddress" TEXT,
ADD COLUMN     "originLat" DOUBLE PRECISION,
ADD COLUMN     "originLng" DOUBLE PRECISION,
ADD COLUMN     "routeDistanceKm" DOUBLE PRECISION,
ADD COLUMN     "routeDurationMin" INTEGER,
ADD COLUMN     "suggestedDepartureAt" TIMESTAMP(3);
