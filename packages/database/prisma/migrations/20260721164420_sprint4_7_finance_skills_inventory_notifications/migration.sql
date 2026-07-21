/*
  Warnings:

  - Added the required column `updatedAt` to the `organization_members` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SkillCategoryType" AS ENUM ('INSTRUMENT', 'TECHNICAL', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "ExpertiseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('BRASS', 'WOODWIND', 'STRING', 'KEYBOARD', 'PERCUSSION', 'AUDIO_GEAR', 'LIGHTING', 'OTHER');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITE_ACCEPTED', 'EVENT_ASSIGNED', 'EVENT_CONFIRMED', 'EVENT_CANCELLED', 'ROSTER_UPDATED', 'EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'ROLE_CHANGED', 'DAYSHEET_UPDATED', 'INSTRUMENT_ASSIGNED', 'MESSAGE_RECEIVED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "setlistNotes" TEXT;

-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "icon" TEXT,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT,
    "categoryId" TEXT,
    "type" "EntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "proofAssetId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "date" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "per_diem_payouts" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "per_diem_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SkillCategoryType" NOT NULL,
    "icon" TEXT,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillCategoryId" TEXT NOT NULL,
    "expertiseLevel" "ExpertiseLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "yearsExp" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "type" "InstrumentType" NOT NULL,
    "status" "InstrumentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "specAssetId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument_assignments" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "userId" TEXT,
    "eventId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "instrument_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sourceId" TEXT,
    "sourceType" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "orgId" TEXT,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_categories_orgId_idx" ON "finance_categories"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_orgId_name_type_key" ON "finance_categories"("orgId", "name", "type");

-- CreateIndex
CREATE INDEX "finance_entries_orgId_idx" ON "finance_entries"("orgId");

-- CreateIndex
CREATE INDEX "finance_entries_eventId_idx" ON "finance_entries"("eventId");

-- CreateIndex
CREATE INDEX "finance_entries_status_idx" ON "finance_entries"("status");

-- CreateIndex
CREATE INDEX "per_diem_payouts_orgId_idx" ON "per_diem_payouts"("orgId");

-- CreateIndex
CREATE INDEX "per_diem_payouts_userId_idx" ON "per_diem_payouts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_name_key" ON "skill_categories"("name");

-- CreateIndex
CREATE INDEX "user_skills_skillCategoryId_idx" ON "user_skills"("skillCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_userId_skillCategoryId_key" ON "user_skills"("userId", "skillCategoryId");

-- CreateIndex
CREATE INDEX "instruments_orgId_idx" ON "instruments"("orgId");

-- CreateIndex
CREATE INDEX "instruments_type_idx" ON "instruments"("type");

-- CreateIndex
CREATE INDEX "instrument_assignments_instrumentId_idx" ON "instrument_assignments"("instrumentId");

-- CreateIndex
CREATE INDEX "instrument_assignments_userId_idx" ON "instrument_assignments"("userId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_isRead_idx" ON "notifications"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_senderId_recipientId_idx" ON "messages"("senderId", "recipientId");

-- CreateIndex
CREATE INDEX "messages_recipientId_isRead_idx" ON "messages"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "users_city_idx" ON "users"("city");

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "per_diem_payouts" ADD CONSTRAINT "per_diem_payouts_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "per_diem_payouts" ADD CONSTRAINT "per_diem_payouts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "per_diem_payouts" ADD CONSTRAINT "per_diem_payouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "per_diem_payouts" ADD CONSTRAINT "per_diem_payouts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skillCategoryId_fkey" FOREIGN KEY ("skillCategoryId") REFERENCES "skill_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_assignments" ADD CONSTRAINT "instrument_assignments_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_assignments" ADD CONSTRAINT "instrument_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_assignments" ADD CONSTRAINT "instrument_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
