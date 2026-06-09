// ============================================================
// StorageCdnService — URLs públicas y transformaciones de imagen.
//
// Solo disponible cuando STORAGE_CDN_URL está configurada en Railway.
// Requiere vincular un dominio custom al bucket R2 en el panel de Cloudflare.
//
// Para objetos privados (docs legales, recibos financieros),
// usar StoragePresignedService.generateDownloadUrl() en su lugar.
// ============================================================

import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3_CDN_URL } from '../providers/s3-client.provider';

// Opciones de transformación soportadas por Cloudflare Image Resizing.
// Requiere plan Pro/Business o un Worker con `cf.image` habilitado.
export interface ImageResizeOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'scale-down';
  // Si se omite, Cloudflare detecta el formato óptimo automáticamente
  format?: 'webp' | 'avif' | 'jpeg';
}

@Injectable()
export class StorageCdnService {
  constructor(
    @Inject(S3_CDN_URL) private readonly cdnBaseUrl: string | undefined,
  ) {}

  // ── URL pública del CDN ─────────────────────────────────────
  // Genera: https://cdn.regieart.com/profiles/abc-123/avatar.jpg
  // Para objetos con acceso público (avatares, banners de bandas).
  getPublicUrl(key: string): string {
    this.assertCdnConfigured();
    return `${this.cdnBaseUrl!.replace(/\/$/, '')}/${key}`;
  }

  // ── URL de imagen con transformación on-the-fly ─────────────
  // Genera: https://cdn.regieart.com/cdn-cgi/image/width=200,height=200,fit=cover/profiles/abc/avatar.jpg
  //
  // Usos recomendados para RégieArt:
  //   Avatares en lista de miembros → { width: 64,   height: 64,   fit: 'cover' }
  //   Avatares en perfil completo   → { width: 200,  height: 200,  fit: 'cover' }
  //   Banners de organización       → { width: 1200, height: 400,  fit: 'cover' }
  getResizedImageUrl(key: string, options: ImageResizeOptions): string {
    this.assertCdnConfigured();

    // Construye el string de parámetros — solo incluye los valores proporcionados
    const params = Object.entries(options)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    // /cdn-cgi/image/ es el endpoint estándar de Cloudflare para transformaciones
    return `${this.cdnBaseUrl!.replace(/\/$/, '')}/cdn-cgi/image/${params}/${key}`;
  }

  // Lanza error descriptivo si el CDN no está configurado
  private assertCdnConfigured(): void {
    if (!this.cdnBaseUrl) {
      throw new InternalServerErrorException(
        'STORAGE_CDN_URL no está configurada. ' +
          'Vincula un dominio custom al bucket R2 en el panel de Cloudflare y ' +
          'añade la variable STORAGE_CDN_URL en Railway.',
      );
    }
  }
}
