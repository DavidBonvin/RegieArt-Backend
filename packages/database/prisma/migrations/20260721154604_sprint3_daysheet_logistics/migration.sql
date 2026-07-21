-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('DEPARTURE', 'ARRIVAL', 'LOAD_IN', 'SOUNDCHECK', 'DOORS_OPEN', 'CATERING_DINNER', 'SHOWTIME', 'LOAD_OUT', 'OTHER');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "loadInNotes" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "parkingNotes" TEXT,
ADD COLUMN     "technicalContactPhone" TEXT;

-- CreateTable
CREATE TABLE "event_schedule_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "ScheduleType" NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "withWho" TEXT,
    "notes" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_vehicles" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "plateNumber" TEXT,
    "capacity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_passengers" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "vehicle_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_pickup_points" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "vehicle_pickup_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_finance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "cacheTotal" DECIMAL(10,2),
    "perDiemAmount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentNotes" TEXT,
    "invoiceAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_finance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_schedule_items_eventId_startTime_idx" ON "event_schedule_items"("eventId", "startTime");

-- CreateIndex
CREATE INDEX "event_vehicles_eventId_idx" ON "event_vehicles"("eventId");

-- CreateIndex
CREATE INDEX "vehicle_passengers_vehicleId_idx" ON "vehicle_passengers"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_passengers_vehicleId_userId_key" ON "vehicle_passengers"("vehicleId", "userId");

-- CreateIndex
CREATE INDEX "vehicle_pickup_points_vehicleId_idx" ON "vehicle_pickup_points"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "event_finance_eventId_key" ON "event_finance"("eventId");

-- AddForeignKey
ALTER TABLE "event_schedule_items" ADD CONSTRAINT "event_schedule_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_vehicles" ADD CONSTRAINT "event_vehicles_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passengers" ADD CONSTRAINT "vehicle_passengers_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "event_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_passengers" ADD CONSTRAINT "vehicle_passengers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_pickup_points" ADD CONSTRAINT "vehicle_pickup_points_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "event_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_finance" ADD CONSTRAINT "event_finance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
