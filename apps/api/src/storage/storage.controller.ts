// ============================================================
// StorageController — Capa de transporte HTTP del StorageModule.
//
// Todos los endpoints requieren autenticación JWT (JwtAuthGuard a nivel clase).
//
// Endpoints implementados:
//   POST   /storage/presigned-upload          → URL de subida directa a R2
//   POST   /storage/confirm-upload            → Verificar y confirmar subida
//   GET    /storage/objects                   → Listar objetos R2 por prefijo
//   GET    /storage/presigned-download        → URL de descarga temporal
//   GET    /storage/assets                    → Buscar assets (DB) con filtros
//   GET    /storage/assets/:id                → Obtener un asset por ID
//   PATCH  /storage/assets/:id                → Actualizar metadatos de un asset
//   DELETE /storage/assets/:id                → Soft-delete + purga futura de R2
//   POST   /storage/multipart/initiate        → Iniciar subida multiparte (> 50 MB)
//   POST   /storage/multipart/complete        → Finalizar subida multiparte
//   DELETE /storage/multipart/abort           → Cancelar subida multiparte
//
// Seguridad en capas:
//   Capa 1 — JwtAuthGuard: rechaza peticiones sin token Keycloak válido.
//   Capa 2 — @CurrentUser: extrae userId del JWT (no del body).
//   Capa 3 — ValidationPipe (global): valida y sanitiza todos los DTOs.
//   Capa 4 — StorageService: valida política de MIME, tamaño y membresía.
//   Capa 5 — Cloudflare R2: rechaza el PUT si el Content-Length no coincide.
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

@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  // ═══════════════════════════════════════════════════════════
  // SUBIDA DE ARCHIVOS
  // ═══════════════════════════════════════════════════════════

  // ── POST /storage/presigned-upload ──────────────────────────
  // Genera URL pre-firmada de subida y crea el registro Asset PENDING en DB.
  // Throttle estricto: la generación de URLs involucra criptografía + DB + Redis.
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
  // Verifica existencia en R2 vía HeadObject y actualiza el Asset a CONFIRMED.
  // También acepta metadatos técnicos opcionales (duración, dimensiones, etc.).
  @Post('confirm-upload')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.storageService.confirmUpload(user.id, dto);
  }

  // ═══════════════════════════════════════════════════════════
  // DESCARGA Y LISTADO
  // ═══════════════════════════════════════════════════════════

  // ── GET /storage/presigned-download?key=... ─────────────────
  // Genera URL pre-firmada de lectura (5 min). La URL se cachea en Redis 4 min.
  // El ownership check se hace en StoragePresignedService.generateDownloadUrl().
  @Get('presigned-download')
  async requestDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query('key') key: string,
  ) {
    if (!key) {
      throw new UnauthorizedException('Se requiere el parámetro key.');
    }

    const downloadUrl = await this.storageService.generateDownloadPresignedUrl(user.id, key);
    return { downloadUrl, key, expiresIn: 300 };
  }

  // ── GET /storage/objects?prefix=... ─────────────────────────
  // Lista objetos en R2 por prefijo (consulta directa a R2, sin DB).
  // Para búsqueda completa con metadatos, usar GET /storage/assets.
  @Get('objects')
  listObjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query('prefix') prefix: string,
  ) {
    return this.storageService.listObjects(user.id, prefix);
  }

  // ═══════════════════════════════════════════════════════════
  // GESTIÓN DE ASSETS (METADATA EN DB)
  // ═══════════════════════════════════════════════════════════

  // ── GET /storage/assets?q=...&assetType=...&orgId=... ───────
  // Búsqueda de assets con filtros. Incluye paginación y ordenamiento.
  // Solo devuelve assets del usuario o de sus organizaciones (seguridad).
  @Get('assets')
  async searchAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: SearchAssetsDto,
  ) {
    return this.storageService.searchAssets(user.id, dto);
  }

  // ── GET /storage/assets/:id ──────────────────────────────────
  // Obtiene un asset por su ID interno. Verifica que el usuario tenga acceso.
  @Get('assets/:id')
  async getAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const asset = await this.storageService.getAsset(id);
    if (!asset) throw new NotFoundException(`Asset "${id}" no encontrado.`);

    // Verificar acceso: el uploader siempre puede acceder;
    // para activos de org, verificar membresía
    if (asset.uploadedById !== user.id) {
      if (asset.orgId) {
        await this.storageService.assertOrgMembership(user.id, asset.orgId);
      } else {
        throw new UnauthorizedException('No tienes acceso a este archivo.');
      }
    }

    return asset;
  }

  // ── GET /storage/assets/:id/download ────────────────────────
  // Obtiene URL de descarga firmada usando solo el ID del asset.
  // El cliente nunca necesita conocer la key interna de R2.
  // Incluye ownership check + fast path CDN si el asset es público.
  @Get('assets/:id/download')
  async getAssetDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const downloadUrl = await this.storageService.getAssetDownloadUrl(user.id, id);
    return { downloadUrl, assetId: id, expiresIn: 300 };
  }

  // ── PATCH /storage/assets/:id ────────────────────────────────
  // Actualiza metadatos de un asset: displayName, tags, description, language, isPublic.
  // No permite cambiar key, assetType, sizeBytes ni status.
  @Patch('assets/:id')
  async updateAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.storageService.updateAssetMetadata(user.id, id, dto);
  }

  // ── DELETE /storage/assets/:id ───────────────────────────────
  // Soft-delete en DB (status=DELETED) + hard-delete inmediato en R2.
  // La fila de DB se limpia después por el StorageCleanupService.
  @Delete('assets/:id')
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
  // Inicia una subida multiparte y devuelve las URLs pre-firmadas de cada parte.
  // El cliente sube las partes en paralelo y luego llama a /complete.
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
  // Envía la lista de partes completadas para que R2 ensamble el objeto final.
  // Llamar solo después de que TODAS las partes hayan sido subidas.
  @Post('multipart/complete')
  @HttpCode(HttpStatus.OK)
  async completeMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteMultipartDto,
  ) {
    return this.storageService.completeMultipart(user.id, dto);
  }

  // ── DELETE /storage/multipart/abort ─────────────────────────
  // Cancela una subida multiparte en curso y libera las partes ya subidas en R2.
  // Llamar si el usuario cancela la subida o si ocurre un error irrecuperable.
  @Delete('multipart/abort')
  @HttpCode(HttpStatus.OK)
  async abortMultipart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AbortMultipartDto,
  ) {
    return this.storageService.abortMultipart(user.id, dto);
  }
}
