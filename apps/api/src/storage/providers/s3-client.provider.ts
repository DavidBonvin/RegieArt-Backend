// ============================================================
// Proveedores de inyección para la infraestructura de Cloudflare R2.
//
// Usando tokens simbólicos (Symbol), el contenedor de NestJS crea
// estas instancias UNA SOLA VEZ al arrancar (patrón Singleton real).
// Todos los servicios del módulo comparten la misma instancia del
// cliente S3 sin recrearla — ahorra conexiones y memoria.
//
// Por qué Symbols en lugar de strings:
//   - Evitan colisiones de nombres entre módulos ('S3_CLIENT' podría
//     existir en otro módulo; un Symbol es globalmente único).
// ============================================================

import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

// Tokens de inyección — exportados para usarlos con @Inject() en los servicios
export const S3_CLIENT = Symbol('S3_CLIENT');
export const S3_BUCKET = Symbol('S3_BUCKET');
export const S3_CDN_URL = Symbol('S3_CDN_URL');

// ─── Cliente S3 apuntando a Cloudflare R2 ────────────────────
// useFactory recibe ConfigService (global) y construye el cliente.
// 'auto' como región es el valor correcto para R2 — no es una región AWS real.
export const s3ClientProvider = {
  provide: S3_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): S3Client => {
    return new S3Client({
      region: 'auto',
      endpoint: config.getOrThrow<string>('STORAGE_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
  },
};

// ─── Nombre del bucket ────────────────────────────────────────
// Se lee una vez al arrancar y se inyecta como string en los servicios.
export const s3BucketProvider = {
  provide: S3_BUCKET,
  inject: [ConfigService],
  useFactory: (config: ConfigService): string =>
    config.getOrThrow<string>('STORAGE_BUCKET_NAME'),
};

// ─── URL base del CDN de Cloudflare (opcional) ───────────────
// Si STORAGE_CDN_URL no está configurada, se inyecta como undefined.
// StorageCdnService lanza InternalServerErrorException si se usa sin configurar.
export const s3CdnUrlProvider = {
  provide: S3_CDN_URL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): string | undefined =>
    config.get<string>('STORAGE_CDN_URL'),
};
