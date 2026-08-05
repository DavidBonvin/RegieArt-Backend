// ============================================================
// StorageController — HTTP transport layer for the StorageModule.
//
// All endpoints require JWT authentication (JwtAuthGuard at class level).
//
// Implemented endpoints:
//   POST   /storage/presigned-upload          → Direct upload URL to R2
//   POST   /storage/confirm-upload            → Verify and confirm upload
//   GET    /storage/objects                   → List R2 objects by prefix
//   GET    /storage/presigned-download        → Temporary download URL
//   GET    /storage/assets                    → Search assets (DB) with filters
//   GET    /storage/assets/:id                → Get an asset by ID
//   PATCH  /storage/assets/:id                → Update asset metadata
//   DELETE /storage/assets/:id                → Soft-delete + future R2 purge
//   POST   /storage/multipart/initiate        → Initiate multipart upload (> 50 MB)
//   POST   /storage/multipart/complete        → Finalize multipart upload
//   DELETE /storage/multipart/abort           → Cancel multipart upload
//
// Layered security:
//   Layer 1 — JwtAuthGuard: rejects requests without a valid Keycloak token.
//   Layer 2 — @CurrentUser: extracts userId from the JWT (not from the body).
//   Layer 3 — ValidationPipe (global): validates and sanitizes all DTOs.
//   Layer 4 — StorageService: validates MIME policy, size, and membership.
//   Layer 5 — Cloudflare R2: rejects the PUT if Content-Length does not match.
// ============================================================

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '@regieart/types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreatePresignedUrlDto } from './dto/create-presigned-url.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetsDto } from './dto/search-assets.dto';
import { InitiateMultipartDto, CompleteMultipartDto, AbortMultipartDto } from './dto/multipart.dto';
import { PresignedUploadResponse, StorageService } from './storage.service';

const ASSET_ROUTE = 'assets/:id';

@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  // ═══════════════════════════════════════════════════════════
  // FILE UPLOAD
  // ═══════════════════════════════════════════════════════════

  // ── POST /storage/presigned-upload ────────────────────────────
  // Generates a pre-signed upload URL and creates a PENDING Asset record in DB.
  // Strict throttle: URL generation involves cryptography + DB + Redis.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('presigned-upload')
  @HttpCode(HttpStatus.OK)
  async requestUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePresignedUrlDto,
  ): Promise<PresignedUploadResponse> {
    return this.storageService.generateUploadPresignedUrl(user.id, dto);
  }

  // ── POST /storage/confirm-upload ────────────────────────────
  // Verifies existence in R2 via HeadObject and updates the Asset to CONFIRMED.
  // Also accepts optional technical metadata (duration, dimensions, etc.).
  @Post('confirm-upload')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.storageService.confirmUpload(user.id, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // DOWNLOAD AND LISTING
  // ═══════════════════════════════════════════════════════════

  // ── GET /storage/presigned-download?key=... ─────────────────────
  // Generates a pre-signed read URL (5 min). The URL is cached in Redis for 4 min.
  // Ownership check is performed in StoragePresignedService.generateDownloadUrl().
  @Get('presigned-download')
  async requestDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query('key') key: string,
  ) {
    if (!key) {
      throw new UnauthorizedException('The key parameter is required.');
    }

    const downloadUrl = await this.storageService.generateDownloadPresignedUrl(user.id, key);
    return { downloadUrl, key, expiresIn: 300 };
  }

  // ── GET /storage/objects?prefix=... ─────────────────────────
  // Lists R2 objects by prefix (direct R2 query, no DB).
  // For full search with metadata, use GET /storage/assets.
  @Get('objects')
  listObjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query('prefix') prefix: string,
  ) {
    return this.storageService.listObjects(user.id, prefix);
  }

  // ═══════════════════════════════════════════════════════════
  // ASSET MANAGEMENT (DB METADATA)
  // ═══════════════════════════════════════════════════════════

  // ── GET /storage/assets?q=...&assetType=...&orgId=... ──────────────
  // Search assets with filters. Includes pagination and sorting.
  // Only returns assets belonging to the user or their organizations (security).
  @Get('assets')
  async searchAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: SearchAssetsDto,
  ) {
    return this.storageService.searchAssets(user.id, dto);
  }

  // ── GET /storage/assets/:id ──────────────────────────────────
  // Gets an asset by its internal ID. Verifies that the user has access.
  @Get(ASSET_ROUTE)
  async getAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const asset = await this.storageService.getAsset(id);
    if (!asset) throw new NotFoundException(`Asset "${id}" not found.`);

    // Check access: the uploader can always access their own assets;
    // for org assets, verify membership
    if (asset.uploadedById !== user.id) {
      if (asset.orgId) {
        await this.storageService.assertOrgMembership(user.id, asset.orgId);
      } else {
        throw new UnauthorizedException('You do not have access to this file.');
      }
    }

    return asset;
  }

  // ── GET /storage/assets/:id/download ────────────────────────
  // Returns a signed download URL using only the asset ID.
  // The client never needs to know the internal R2 key.
  // Includes ownership check + CDN fast path if the asset is public.
  @Get('assets/:id/download')
  async getAssetDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const downloadUrl = await this.storageService.getAssetDownloadUrl(user.id, id);
    return { downloadUrl, assetId: id, expiresIn: 300 };
  }

  // ── PATCH /storage/assets/:id ────────────────────────────────
  // Updates asset metadata: displayName, tags, description, language, isPublic.
  // Changing key, assetType, sizeBytes or status is not allowed.
  @Patch(ASSET_ROUTE)
  async updateAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.storageService.updateAssetMetadata(user.id, id, dto);
  }

  // ── DELETE /storage/assets/:id ───────────────────────────────
  // Soft-delete in DB (status=DELETED) + immediate hard-delete in R2.
  // The DB row is later cleaned up by StorageCleanupService.
  @Delete(ASSET_ROUTE)
  @HttpCode(HttpStatus.OK)
  async deleteAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.storageService.deleteAsset(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════
  // MULTIPART UPLOAD (ARCHIVOS > 50 MB)
  // ═══════════════════════════════════════════════════════════

  // ── POST /storage/multipart/initiate ────────────────────────
  // Initiates a multipart upload and returns the pre-signed URLs for each part.
  // The client uploads parts in parallel and then calls /complete.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('multipart/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InitiateMultipartDto,
  ) {
    return this.storageService.initiateMultipart(user.id, dto);
  }

  // ── POST /storage/multipart/complete ────────────────────────
  // Sends the completed parts list for R2 to assemble the final object.
  // Call only after ALL parts have been uploaded.
  @Post('multipart/complete')
  @HttpCode(HttpStatus.OK)
  async completeMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteMultipartDto,
  ) {
    return this.storageService.completeMultipart(user.id, dto);
  }

  // ── DELETE /storage/multipart/abort ─────────────────────────
  // Cancels an in-progress multipart upload and releases the already-uploaded parts in R2.
  // Call if the user cancels the upload or an unrecoverable error occurs.
  @Delete('multipart/abort')
  @HttpCode(HttpStatus.OK)
  async abortMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AbortMultipartDto,
  ) {
    return this.storageService.abortMultipart(user.id, dto);
  }
}
