-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'READY', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('USER_AVATAR', 'ORG_BANNER', 'AUDIO_TRACK', 'MUSIC_SCORE', 'FINANCIAL_RECEIPT', 'TECHNICAL_FILE', 'REFERENCE_VIDEO', 'LEGAL_DOCUMENT');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "etag" TEXT,
    "displayName" TEXT,
    "originalName" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "pageCount" INTEGER,
    "bitrate" INTEGER,
    "isMultipart" BOOLEAN NOT NULL DEFAULT false,
    "uploadId" TEXT,
    "partCount" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "orgId" TEXT,
    "songId" TEXT,
    "eventId" TEXT,
    "memberId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacesId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_key_key" ON "assets"("key");

-- CreateIndex
CREATE INDEX "assets_orgId_idx" ON "assets"("orgId");

-- CreateIndex
CREATE INDEX "assets_uploadedById_idx" ON "assets"("uploadedById");

-- CreateIndex
CREATE INDEX "assets_assetType_idx" ON "assets"("assetType");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_songId_idx" ON "assets"("songId");

-- CreateIndex
CREATE INDEX "assets_eventId_idx" ON "assets"("eventId");

-- CreateIndex
CREATE INDEX "assets_createdAt_idx" ON "assets"("createdAt");

-- CreateIndex
CREATE INDEX "assets_tags_idx" ON "assets"("tags");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
