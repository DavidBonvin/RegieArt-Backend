# StorageModule — Documentación Completa

> **Última actualización:** 16 de junio de 2026  
> **Estado:** Producción activa — 13 endpoints, 30 tests unitarios en verde  
> **Probado en producción con:** SVG (1.28 MB), MP3 (8.41 MB), video pequeño (0.56 MB), video grande multipart (257.77 MB — 26 partes)  
> **Audiencia:** Equipo frontend (React Native / Expo / Web) y jurado técnico

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Infraestructura y Configuración](#2-infraestructura-y-configuración)
3. [Archivos que Componen el Módulo](#3-archivos-que-componen-el-módulo)
4. [Modelo de Datos — Asset](#4-modelo-de-datos--asset)
5. [Tipos de Activo (AssetType)](#5-tipos-de-activo-assettype)
6. [Todos los Endpoints](#6-todos-los-endpoints)
7. [Flujo Completo — Archivo Pequeño (≤ 50 MB)](#7-flujo-completo--archivo-pequeño--50-mb)
8. [Flujo Completo — Archivo Grande (> 50 MB — Multipart)](#8-flujo-completo--archivo-grande--50-mb--multipart)
9. [Flujo de Descarga](#9-flujo-de-descarga)
10. [Seguridad en Capas](#10-seguridad-en-capas)
11. [Caché con Redis](#11-caché-con-redis)
12. [Jobs de Limpieza Automática](#12-jobs-de-limpieza-automática)
13. [Formato de Respuestas](#13-formato-de-respuestas)
14. [Códigos de Error](#14-códigos-de-error)
15. [Guía de Implementación Frontend](#15-guía-de-implementación-frontend)
16. [Preguntas Frecuentes — Jurado](#16-preguntas-frecuentes--jurado)

---

## 1. Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                     App Mobile / Web                         │
│                  (React Native / Expo)                       │
└────────────────────────┬────────────────────────────────────┘
                         │  JWT Bearer Token
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              NestJS API  (Railway)                           │
│                                                             │
│  StorageController → StorageService (fachada)               │
│       ├─ StoragePresignedService   (firma URLs)             │
│       ├─ StorageObjectService      (confirm / delete)       │
│       ├─ StorageMembershipService  (verifica membresía)     │
│       ├─ StorageAssetService       (CRUD en PostgreSQL)     │
│       ├─ StorageMultipartService   (archivos > 50 MB)       │
│       ├─ StorageCleanupService     (cron jobs)              │
│       └─ StorageCdnService         (URLs públicas CDN)      │
└────────────┬────────────────────────┬───────────────────────┘
             │                        │
             ▼                        ▼
    ┌────────────────┐      ┌──────────────────┐
    │  PostgreSQL    │      │  Cloudflare R2   │
    │  (metadata)    │      │  (archivos)      │
    └────────────────┘      └──────────────────┘
             │
             ▼
    ┌────────────────┐
    │  Redis         │
    │  (caché URLs,  │
    │  membresía,    │
    │  locks cron)   │
    └────────────────┘
```

### Principio clave: el archivo NUNCA pasa por el backend

El backend solo genera **URLs firmadas**. El archivo viaja directamente desde el dispositivo del usuario a Cloudflare R2 (y viceversa). Esto significa:

- **Cero carga en la API** por transferencias de archivos
- **Máxima velocidad**: el usuario sube/baja desde los servidores de Cloudflare más cercanos a su ubicación
- **Sin límites de tamaño en la API**: el backend firma la URL pero no procesa el binario

---

## 2. Infraestructura y Configuración

### Servicios en Railway (producción)

| Servicio | URL / Descripción |
|---|---|
| **RegieArt-Backend** | `https://regieart-backend-production.up.railway.app` |
| **PostgreSQL** | DB interna Railway — metadatos de assets |
| **Redis** | `redis://default:***@redis.railway.internal:6379` — caché y locks |
| **Keycloak** | `https://keycloak-production-b2ce.up.railway.app` |

### Variables de entorno del backend (Railway → RegieArt-Backend)

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Conexión PostgreSQL |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` — referencia al servicio Redis del proyecto |
| `KEYCLOAK_URL` | URL base de Keycloak |
| `KEYCLOAK_REALM` | Nombre del realm (`regieart`) |
| `STORAGE_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `STORAGE_ACCESS_KEY_ID` | API Key R2 con permisos de lectura/escritura |
| `STORAGE_SECRET_ACCESS_KEY` | Secret de la API Key R2 |
| `STORAGE_BUCKET_NAME` | `regieart-media-production` |
| `STORAGE_CDN_URL` | *(Opcional)* URL del CDN custom para assets públicos |
| `CORS_ORIGINS` | Origins permitidos (ej. `http://localhost:3001`) |

### Cloudflare R2

- **Protocolo**: S3-compatible — usa `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`
- **Región**: `auto` (Cloudflare gestiona la distribución geográfica)
- **Bucket**: `regieart-media-production`
- **Acceso**: todas las URLs son firmadas con expiración — ningún archivo es accesible públicamente sin firma (excepto si `isPublic: true` con `STORAGE_CDN_URL` configurado)

---

## 3. Archivos que Componen el Módulo

### Archivos críticos de negocio

| Archivo | Rol |
|---|---|
| `apps/api/src/storage/storage.controller.ts` | Capa HTTP — define todos los endpoints y sus rutas |
| `apps/api/src/storage/storage.service.ts` | Fachada — único punto de entrada público del módulo |
| `apps/api/src/storage/constants/upload-policies.ts` | **Contrato central** — define tipos, MIME permitidos, tamaño máximo y rutas R2 |
| `apps/api/src/storage/services/storage-presigned.service.ts` | Genera URLs firmadas de subida (PUT) y descarga (GET) |
| `apps/api/src/storage/services/storage-object.service.ts` | Confirma uploads via HeadObject, borra objetos, actualiza avatarUrl/bannerUrl |
| `apps/api/src/storage/services/storage-asset.service.ts` | CRUD completo sobre la tabla `assets` en PostgreSQL |
| `apps/api/src/storage/services/storage-membership.service.ts` | Verifica que el usuario pertenece a la organización (DB + caché Redis) |
| `apps/api/src/storage/services/storage-multipart.service.ts` | Protocolo S3 Multipart Upload para archivos > 50 MB |
| `apps/api/src/storage/services/storage-cleanup.service.ts` | Cron jobs con locks Redis distribuidos para limpieza de assets |
| `apps/api/src/storage/services/storage-cdn.service.ts` | URLs públicas y redimensionamiento on-the-fly via Cloudflare Image Resizing |
| `apps/api/src/storage/providers/s3-client.provider.ts` | Inyecta S3Client, bucket name y CDN URL como singletons |

### DTOs — contratos de entrada del API

| Archivo | Endpoint |
|---|---|
| `dto/create-presigned-url.dto.ts` | `POST /storage/presigned-upload` |
| `dto/confirm-upload.dto.ts` | `POST /storage/confirm-upload` |
| `dto/search-assets.dto.ts` | `GET /storage/assets` |
| `dto/update-asset.dto.ts` | `PATCH /storage/assets/:id` |
| `dto/multipart.dto.ts` | `POST /storage/multipart/initiate`, `complete`, `abort` |

### Archivos de infraestructura

| Archivo | Rol |
|---|---|
| `apps/api/src/redis/redis.service.ts` | Cliente ioredis — `enableOfflineQueue: false` evita que cuelgue si Redis no responde |
| `apps/api/src/app.module.ts` | ThrottlerModule in-memory (60 req/min global), registra todos los módulos |
| `apps/api/src/main.ts` | ValidationPipe estricto, prefijo global `/api/v1`, CORS, filtro de errores global |
| `apps/api/Dockerfile` | Build multi-stage Alpine; CMD ejecuta `prisma migrate deploy` antes de arrancar |
| `apps/api/src/auth/strategies/keycloak-jwt.strategy.ts` | Valida JWT RS256 de Keycloak, crea usuario en DB si es la primera vez (lazy provisioning) |

### Migraciones de base de datos

| Migración | Qué hace |
|---|---|
| `20260518145827_inicio` | Crea tablas `users`, `organizations`, `organization_members`, `invite_links` |
| `20260609101136_add_asset_model` | Crea tabla `assets` con todos sus campos |
| `20260609133027_add_asset_search_indexes` | Añade índice GIN de full-text search sobre displayName, originalName y description |
| `20260616150743_add_user_banner_asset_type` | `ALTER TYPE "AssetType" ADD VALUE 'USER_BANNER'` |
| `20260616150831_add_user_banner_url` | Añade columna `bannerUrl` al modelo `User` |

---

## 4. Modelo de Datos — Asset

```typescript
interface Asset {
  id:            string;       // CUID — usar para descargas y referencias en el frontend
  key:           string;       // Ruta interna en R2 — NO exponer al usuario final
  assetType:     AssetType;    // Tipo semántico del archivo
  contentType:   string;       // MIME type: "audio/mpeg", "image/jpeg", etc.
  sizeBytes:     number;       // Tamaño en bytes (BigInt en DB, serializado a number en JSON)
  status:        AssetStatus;  // Ver ciclo de vida abajo
  etag:          string | null;// Checksum MD5 de R2 para verificación de integridad

  // Metadatos de visualización
  displayName:   string | null;// "Le Petit Pêcheur — Bandera Roja"
  originalName:  string | null;// "BanderaRoja.mp3" (nombre original en el dispositivo)
  description:   string | null;// Descripción libre
  tags:          string[];     // ["repertorio", "2026"]
  language:      string | null;// ISO 639-1: "fr", "es", "en"

  // Metadatos técnicos (opcionales — proveídos por el cliente en confirm-upload)
  durationSeconds: number | null; // Audio/video en segundos
  width:           number | null; // Ancho en píxeles (imágenes/video)
  height:          number | null; // Alto en píxeles
  bitrate:         number | null; // Bitrate en kbps (audio/video)
  pageCount:       number | null; // Número de páginas (PDFs)

  // Contexto de negocio
  uploadedById:  string;       // userId del que subió el archivo
  orgId:         string | null;// Organización propietaria (si aplica)
  songId:        string | null;// Referencia a canción del repertorio
  eventId:       string | null;// Referencia a evento
  isPublic:      boolean;      // true = servido por CDN sin firma (avatares, banners)
  isMultipart:   boolean;      // true si se subió con el protocolo multipart

  // Auditoría
  createdAt:     string;       // ISO 8601
  confirmedAt:   string | null;// Timestamp del confirm-upload exitoso
  deletedAt:     string | null;// Soft delete — R2 se limpia en el siguiente cron
  updatedAt:     string;       // ISO 8601
}

// Ciclo de vida del asset
type AssetStatus =
  | 'PENDING'    // URL generada, subida no completada o no confirmada aún
  | 'CONFIRMED'  // Archivo verificado en R2 via HeadObject — listo para usar
  | 'PROCESSING' // En análisis post-upload (reservado para uso futuro: virus scan, transcripción)
  | 'READY'      // Procesamiento completo — todos los metadatos disponibles
  | 'ARCHIVED'   // Movido a cold storage (R2 Infrequent Access)
  | 'DELETED';   // Soft delete — el cron lo elimina físicamente de R2 después de 24h
```

### Modelo User (campos relevantes para storage)

```typescript
interface UserProfile {
  id:          string;
  keycloakId:  string;
  email:       string;
  displayName: string;
  firstName:   string | null;
  lastName:    string | null;
  avatarUrl:   string | null;  // Actualizado automáticamente al confirmar user-avatar
  bannerUrl:   string | null;  // Actualizado automáticamente al confirmar user-banner
  phone:       string | null;
  bio:         string | null;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
}
```

---

## 5. Tipos de Activo (AssetType)

| Valor en API | Contexto de uso | MIME permitidos | Máx | Ruta en R2 |
|---|---|---|---|---|
| `user-avatar` | Foto de perfil del usuario | image/jpeg, image/png | 2 MB | `profiles/{userId}/avatar.jpg` |
| `user-banner` | Banner de perfil (estilo LinkedIn/Facebook) | image/jpeg, image/png, image/webp | 5 MB | `profiles/{userId}/banner.jpg` |
| `org-banner` | Banner de la organización/banda | image/jpeg, image/png | 5 MB | `organizations/{orgId}/banners/main.png` |
| `audio-track` | Pista de audio del repertorio | audio/mpeg, audio/wav, audio/ogg | 25 MB | `organizations/{orgId}/repertoire/{songId}/audio.mp3` |
| `music-score` | Partitura (PDF o SVG) | application/pdf, image/svg+xml | 10 MB | `organizations/{orgId}/repertoire/{songId}/score.pdf` |
| `reference-video` | Video de referencia de evento | video/mp4, video/quicktime | 300 MB | `organizations/{orgId}/events/{eventId}/videos/{uuid}.mp4` |
| `financial-receipt` | Recibo/ticket de gastos | image/jpeg, image/png, application/pdf | 5 MB | `organizations/{orgId}/events/{eventId}/receipts/{uuid}.jpg` |
| `technical-file` | Archivo técnico del show (patch consola) | application/xml, text/plain, application/octet-stream | 8 MB | `organizations/{orgId}/events/{eventId}/technical/{uuid}.patch` |
| `legal-document` | Documento legal/contrato RRHH | application/pdf, image/jpeg | 10 MB | `organizations/{orgId}/legal/{uuid}.pdf` |

> **Nota sobre `{uuid}`**: los tipos con UUID en la ruta tienen `serverGeneratesFileId: true` — el backend genera el UUID con `crypto.randomUUID()`, garantizando unicidad y trazabilidad sin importar el nombre original del archivo.

### Parámetros requeridos en el body según el tipo

| AssetType | `orgId` | `songId` | `eventId` |
|---|---|---|---|
| `user-avatar` | — | — | — |
| `user-banner` | — | — | — |
| `org-banner` | ✅ | — | — |
| `audio-track` | ✅ | ✅ | — |
| `music-score` | ✅ | ✅ | — |
| `reference-video` | ✅ | — | ✅ |
| `financial-receipt` | ✅ | — | ✅ |
| `technical-file` | ✅ | — | ✅ |
| `legal-document` | ✅ | — | — |

---

## 6. Todos los Endpoints

**Base URL**: `https://regieart-backend-production.up.railway.app/api/v1`  
**Todos los endpoints** requieren `Authorization: Bearer <token>` (excepto `/health`).  
**Formato de respuesta**: siempre `{ success: true, data: ... }` o `{ success: false, error: { code, message } }`.

---

### `POST /storage/presigned-upload`

Genera una URL firmada para subir un archivo directamente a R2. Crea un registro `Asset` en estado `PENDING` en PostgreSQL.

**Rate limit**: 10 solicitudes por minuto por usuario.

**Body completo:**
```json
{
  "assetType": "audio-track",
  "contentType": "audio/mpeg",
  "fileSizeBytes": 8815942,

  "orgId": "cmqgqntyr0002gx5bsfosjzuo",
  "songId": "song-repertoire-001",

  "displayName": "Le Petit Pêcheur — Bandera Roja",
  "originalName": "BanderaRoja.mp3",
  "description": "Ensayo del 10 de junio 2026",
  "tags": ["repertorio", "2026", "en-revision"],
  "language": "fr",
  "isPublic": false,

  "durationSeconds": 213,
  "bitrate": 320
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://regieart-media-production.<id>.r2.cloudflarestorage.com/...?X-Amz-Signature=...&X-Amz-Expires=900",
    "key": "organizations/cmq.../repertoire/song-001/audio.mp3",
    "assetId": "cmqgqoa9u000egx5baa8dltrx",
    "expiresIn": 900
  }
}
```

**Siguiente paso**: `PUT uploadUrl` con el archivo binario y `Content-Type: audio/mpeg`. La URL expira en 15 minutos.

---

### `POST /storage/confirm-upload`

Confirma que el archivo llegó correctamente a R2. El backend hace un `HeadObject` para verificar la existencia real. Actualiza `Asset` de `PENDING` a `CONFIRMED`.

**Body:**
```json
{
  "key": "organizations/cmq.../repertoire/song-001/audio.mp3",
  "assetType": "audio-track",
  "durationSeconds": 213,
  "bitrate": 320,
  "width": null,
  "height": null,
  "pageCount": null
}
```

**Respuesta:** el objeto `Asset` completo con `status: "CONFIRMED"` y `confirmedAt` timestamp.

> **Efecto secundario importante**: si `assetType` es `user-avatar` o `user-banner`, el backend actualiza automáticamente `user.avatarUrl` o `user.bannerUrl`. Después de confirmar, `GET /users/me` devuelve la URL actualizada.

---

### `GET /storage/assets/:id/download`

Obtiene una URL de descarga firmada válida por **5 minutos**, usando solo el `assetId`. El frontend **nunca necesita conocer la key interna de R2**.

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://regieart-media-production...?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=300&X-Amz-Signature=...",
    "assetId": "cmqgqoa9u000egx5baa8dltrx",
    "expiresIn": 300
  }
}
```

> Si el asset tiene `isPublic: true` y `STORAGE_CDN_URL` está configurado, devuelve directamente la URL del CDN (sin firma, sin expiración, cacheable).

---

### `GET /storage/presigned-download?key=<r2-key>`

Alternativa por `key` de R2. Usar principalmente en herramientas de administración. **Preferir `:id/download` en el frontend**.

---

### `GET /storage/assets`

Búsqueda de assets con filtros combinados (todos los filtros se combinan con AND).

**Query params** (todos opcionales):
```
q=bandera roja          → texto libre en displayName, originalName, description
assetType=audio-track   → puede repetirse: &assetType=music-score
orgId=cmq...
songId=song-001
eventId=event-001
tags=2026               → puede repetirse para filtrar por múltiples tags
language=fr
createdFrom=2026-01-01T00:00:00Z
createdTo=2026-12-31T23:59:59Z
page=1
limit=20                → máximo 100
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "assets": [ /* array de Asset */ ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### `GET /storage/assets/:id`

Metadatos completos de un asset por ID. Verifica acceso (propietario del archivo o miembro de la org).

---

### `PATCH /storage/assets/:id`

Actualiza metadatos. **No permite cambiar**: `key`, `assetType`, `sizeBytes`, `status`, `etag`.

**Body** (todos los campos opcionales):
```json
{
  "displayName": "Nombre actualizado",
  "description": "Nueva descripción",
  "tags": ["2026", "aprobado"],
  "language": "es",
  "isPublic": true
}
```

---

### `DELETE /storage/assets/:id`

Elimina el archivo. Hace **soft-delete** en DB (`status = DELETED`, `deletedAt = ahora`) + **hard-delete inmediato en R2**. La fila de DB se elimina en el siguiente ciclo del cron job (máx. 24h después).

---

### `POST /storage/multipart/initiate`

Para archivos **> 50 MB**. Inicia el protocolo S3 Multipart Upload. Crea el asset en `PENDING` y devuelve URLs firmadas para cada parte.

**Rate limit**: 5 solicitudes por minuto.

**Body:**
```json
{
  "assetType": "reference-video",
  "contentType": "video/mp4",
  "fileSizeBytes": 270294474,
  "partSizeBytes": 10485760,
  "orgId": "cmq...",
  "eventId": "event-ensayo-general-001",
  "displayName": "Caí en la trampa — Ensayo general",
  "originalName": "cai en la trampa.mp4"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "uploadId": "ABUUxwF7JnVGzCTcXg4U...",
    "key": "organizations/cmq.../events/event-001/videos/fbbe76a9-2417-49c1-bd10-54005e852907.mp4",
    "assetId": "cmqgr7ggm000tgx5b76clw083",
    "parts": [
      { "partNumber": 1, "uploadUrl": "https://...?partNumber=1&uploadId=ABUUx...&X-Amz-Signature=..." },
      { "partNumber": 2, "uploadUrl": "https://..." },
      { "partNumber": 26, "uploadUrl": "https://..." }
    ]
  }
}
```

> `partSizeBytes` mínimo: 5 MB (límite del protocolo S3/R2). Por defecto: 10 MB. Se recomienda subir las partes **en paralelo** (máx. 5 simultáneas) para maximizar la velocidad.

---

### `POST /storage/multipart/complete`

Envía los ETags de todas las partes completadas. R2 las ensambla en un único archivo y actualiza el asset a `CONFIRMED`.

**Body:**
```json
{
  "key": "organizations/cmq.../events/event-001/videos/fbbe76a9-....mp4",
  "uploadId": "ABUUxwF7...",
  "parts": [
    { "partNumber": 1, "etag": "\"9f454edfe4bbb11fdfde7543a6dcf1a1\"" },
    { "partNumber": 2, "etag": "\"4be3194df30526da194061166d139492\"" },
    { "partNumber": 26, "etag": "\"f306f4f7c536c17830889a112d80dd97\"" }
  ]
}
```

---

### `DELETE /storage/multipart/abort`

Cancela el upload en curso y libera el almacenamiento de las partes ya subidas en R2.

**Body:**
```json
{
  "key": "organizations/cmq.../videos/fbbe76a9-....mp4",
  "uploadId": "ABUUxwF7..."
}
```

---

### `GET /users/me/profile-urls`

Devuelve avatar y banner del usuario autenticado en una sola llamada. Diseñado para poblar el header de perfil sin cargar todos los datos de membresías.

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "userId": "cmqgqnin60000gx5b5mxsjfow",
    "displayName": "Test User",
    "avatarUrl": "https://cdn.regieart.com/profiles/cmq.../avatar.jpg",
    "bannerUrl": null
  }
}
```

---

### `GET /users/:id/profile-urls`

Mismo formato, para ver el perfil de otro usuario (útil en listas de miembros de una organización).

---

### `GET /health`  /  `GET /health/detailed`

Health check sin autenticación. `/health/detailed` devuelve estado de DB y Redis.

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "services": {
      "database": { "status": "up", "latency": "12ms" },
      "redis":    { "status": "down", "error": "Connection failed" }
    }
  }
}
```

---

## 7. Flujo Completo — Archivo Pequeño (≤ 50 MB)

```
App Mobile                    Backend API                  Cloudflare R2
    │                              │                              │
    │  1. POST /presigned-upload   │                              │
    │  { assetType, contentType,   │                              │
    │    fileSizeBytes, orgId,     │                              │
    │    songId, displayName... }  │                              │
    │ ─────────────────────────→  │                              │
    │                              │  Validar JWT                │
    │                              │  Validar DTO (whitelist)    │
    │                              │  Verificar membresía org    │
    │                              │  (Redis caché → DB)         │
    │                              │  Crear Asset PENDING en DB  │
    │                              │  Firmar URL PUT (15 min)    │
    │ ←─────────────────────────  │                              │
    │  { uploadUrl, key, assetId } │                              │
    │                              │                              │
    │  2. PUT uploadUrl            │                              │
    │  Headers:                    │                              │
    │    Content-Type: audio/mpeg  │                              │
    │  Body: binario del archivo  ──────────────────────────────→│
    │                              │                         Almacenar
    │ ←──────────────────────────────────────────────────────────│
    │  HTTP 200 + ETag             │                              │
    │                              │                              │
    │  3. POST /confirm-upload     │                              │
    │  { key, assetType,           │                              │
    │    durationSeconds: 213 }    │                              │
    │ ─────────────────────────→  │                              │
    │                              │  HeadObject(key) ──────────→│
    │                              │ ←──── { ETag, size }        │
    │                              │  Verificar integridad       │
    │                              │  Asset PENDING → CONFIRMED  │
    │                              │  (si avatar: user.avatarUrl)│
    │ ←─────────────────────────  │                              │
    │  Asset { status: CONFIRMED } │                              │
    │                              │                              │
    │  4. GET /assets/:id/download │                              │
    │ ─────────────────────────→  │                              │
    │                              │  Verificar acceso           │
    │                              │  Comprobar Redis caché      │
    │                              │  Firmar URL GET (5 min) ───→│
    │                              │ ←──── URL firmada           │
    │ ←─────────────────────────  │                              │
    │  { downloadUrl }             │                              │
    │                              │                              │
    │  5. GET downloadUrl          │                              │
    │     (directo a R2)          ──────────────────────────────→│
    │ ←──────────────────────────────────────────────────────────│
    │  Binario del archivo         │                              │
```

---

## 8. Flujo Completo — Archivo Grande (> 50 MB — Multipart)

```
App Mobile                    Backend API                  Cloudflare R2
    │                              │                              │
    │  1. POST /multipart/initiate │                              │
    │  { assetType, fileSizeBytes, │                              │
    │    partSizeBytes: 10MB,      │                              │
    │    eventId, orgId... }       │                              │
    │ ─────────────────────────→  │                              │
    │                              │  Calcular N partes           │
    │                              │  257 MB / 10 MB = 26 partes  │
    │                              │  CreateMultipartUpload ────→│
    │                              │ ←──── uploadId              │
    │                              │  Firmar 26 URLs PUT         │
    │ ←─────────────────────────  │                              │
    │  { uploadId, key, assetId,   │                              │
    │    parts: [{partNumber,      │                              │
    │    uploadUrl}] x26 }         │                              │
    │                              │                              │
    │  2. PUT cada parte (paralelo)│                              │
    │  parts[0..4] simultáneos    ─────────────────────────────→│
    │  ←─ ETag[1..5]              │                              │
    │  parts[5..9] simultáneos    ─────────────────────────────→│
    │  ←─ ETag[6..10]             │                              │
    │  ... (hasta parte 26)        │                              │
    │  ←─ ETag[26]                │                              │
    │                              │                              │
    │  3. POST /multipart/complete │                              │
    │  { key, uploadId,            │                              │
    │    parts: [{partNumber,      │                              │
    │    etag}] x26 }              │                              │
    │ ─────────────────────────→  │                              │
    │                              │  CompleteMultipartUpload ──→│
    │                              │ ←────── Archivo ensamblado  │
    │                              │  Asset → CONFIRMED          │
    │ ←─────────────────────────  │                              │
    │  Asset { status: CONFIRMED } │                              │
    │                              │                              │
    │  (Si falla en cualquier paso:│                              │
    │  DELETE /multipart/abort    │                              │
    │  { key, uploadId })          │                              │
```

---

## 9. Flujo de Descarga

### Método recomendado para el frontend

```
1. GET /api/v1/storage/assets/:assetId/download
   → { downloadUrl: "https://...?X-Amz-Expires=300&X-Amz-Signature=..." }

2. Usar downloadUrl directamente:
   - Audio:  new Audio(downloadUrl).play()   /   expo-av
   - Video:  <Video source={{ uri: downloadUrl }} />
   - PDF:    WebView o expo-print
   - Imagen: <Image source={{ uri: downloadUrl }} />

3. La URL expira en 5 minutos.
   Si el usuario vuelve más tarde → repetir paso 1.
```

### Estrategia de caché local en la app (recomendada)

```typescript
// React Native con expo-file-system
import * as FileSystem from 'expo-file-system';

async function getAudioUri(assetId: string): Promise<string> {
  const localPath = `${FileSystem.cacheDirectory}audio_${assetId}.mp3`;
  
  // 1. ¿Está en caché local del dispositivo?
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) {
    return localPath;  // Reproducir offline sin internet
  }
  
  // 2. Obtener URL firmada del backend
  const { data } = await apiClient.get(`/storage/assets/${assetId}/download`);
  
  // 3. Descargar y guardar en disco del dispositivo
  await FileSystem.downloadAsync(data.downloadUrl, localPath);
  return localPath;  // A partir de ahora funciona sin internet
}
```

> **La URL firmada solo se necesita para la descarga inicial.** Una vez el archivo está en caché local, la app lo reproduce sin conexión a internet ni nuevas peticiones al backend.

---

## 10. Seguridad en Capas

```
Capa 1 — JwtAuthGuard (clase-nivel en StorageController)
  ├── Valida firma RS256 del JWT usando las claves públicas de Keycloak (JWKS)
  ├── Si el token expiró o es inválido → 401 Unauthorized
  └── El userId se extrae del JWT, NUNCA del body (imposible de falsificar)

Capa 2 — ValidationPipe global (configurado en main.ts)
  ├── whitelist: true          → elimina campos no declarados en el DTO silenciosamente
  ├── forbidNonWhitelisted: true → error 400 si llegan campos extra inesperados
  └── transform: true          → convierte strings a numbers/booleans automáticamente

Capa 3 — Política de MIME y tamaño (upload-policies.ts)
  ├── Valida contentType contra allowedMimeTypes del AssetType
  ├── Valida fileSizeBytes contra maxSizeBytes del AssetType
  └── Error 400 con mensaje descriptivo si no cumple

Capa 4 — Verificación de membresía (StorageMembershipService)
  ├── Para activos org-scoped: busca en organizationMember de PostgreSQL
  ├── Resultado cacheado en Redis (TTL 5 min) para no consultar DB en cada request
  └── Si Redis falla → fall-through directo a DB (no bloquea la operación)

Capa 5 — Ownership check en confirmación (StorageObjectService)
  ├── Rutas profiles/: verifica key.startsWith(`profiles/${userId}/`)
  └── Rutas organizations/: verifica membresía

Capa 6 — HeadObject en confirmación
  ├── Verifica que el archivo realmente existe en R2 (no confía en el cliente)
  └── Si no existe → 400 BadRequest

Capa 7 — Cloudflare R2
  ├── La URL firmada incluye el key exacto, Content-Type y Content-Length
  └── R2 rechaza el PUT si alguno no coincide
```

---

## 11. Caché con Redis

| Qué se cachea | Key Redis | TTL |
|---|---|---|
| Verificación de membresía | `storage:membership:{userId}:{orgId}` | 5 min |
| URL de descarga firmada | `storage:download-url:{r2-key}` | 4 min (expira antes que la URL de 5 min) |
| Lock de cron PENDING cleanup | `storage:lock:cleanup-pending` | 2 min |
| Lock de cron PURGE cleanup | `storage:lock:cleanup-purge` | 10 min |

**Redis es opcional**: si no está disponible, el sistema funciona correctamente (va directo a DB y R2). Los locks usan `SET NX` (atómico) para garantizar que solo una instancia del backend corra cada cron en entornos con escalado horizontal.

---

## 12. Jobs de Limpieza Automática

| Job | Frecuencia | Acción |
|---|---|---|
| `cleanupPendingAssets` | Cada hora | Elimina assets en `PENDING` con más de 2 horas de antigüedad (subidas abandonadas o fallidas) |
| `purgeDeletedAssets` | Cada día a las 3:00 AM | Elimina físicamente de la DB los assets en `DELETED` con más de 24h (los objetos R2 ya fueron eliminados al hacer el DELETE) |

---

## 13. Formato de Respuestas

### Éxito
```json
{
  "success": true,
  "data": { ... }
}
```

### Error de validación (400)
```json
{
  "success": false,
  "error": {
    "code": "400",
    "message": "Validation failed",
    "details": [
      "eventId should not be empty",
      "assetType must be one of: user-avatar, audio-track, ..."
    ]
  }
}
```

### Error de negocio (403, 404, 500)
```json
{
  "success": false,
  "error": {
    "code": "403",
    "message": "No tienes acceso a los recursos de esta organización."
  }
}
```

---

## 14. Códigos de Error

| HTTP | Cuándo ocurre |
|---|---|
| `400` | Body inválido, MIME no permitido, tamaño excedido, archivo no encontrado en R2 al confirmar, parámetros requeridos faltantes |
| `401` | Token ausente, expirado o con firma inválida |
| `403` | Usuario no es miembro de la organización, intento de acceder a archivo de otro usuario |
| `404` | Asset ID no existe en la DB |
| `429` | Rate limit superado (10 req/min para presigned-upload, 5 para multipart/initiate) |
| `500` | Error interno (fallo de R2, Prisma, etc.) — capturado por Sentry automáticamente |

---

## 15. Guía de Implementación Frontend

### Paso 0 — Autenticación con Keycloak

```typescript
// Obtener token JWT
const response = await fetch(
  'https://keycloak-production-b2ce.up.railway.app/realms/regieart/protocol/openid-connect/token',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'regieart-mobile',
      username: 'usuario@email.com',
      password: 'contraseña',
    }),
  }
);
const { access_token, expires_in } = await response.json();

// Header para todas las llamadas al backend
const authHeaders = { Authorization: `Bearer ${access_token}` };
```

---

### Subir un audio del repertorio

```typescript
async function uploadAudio(
  file: File,
  orgId: string,
  songId: string,
  metadata: { displayName: string; durationSeconds?: number }
): Promise<string> {
  // 1. Solicitar URL firmada
  const step1 = await fetch('/api/v1/storage/presigned-upload', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetType: 'audio-track',
      contentType: 'audio/mpeg',
      fileSizeBytes: file.size,
      orgId,
      songId,
      displayName: metadata.displayName,
      originalName: file.name,
    }),
  }).then(r => r.json());

  const { uploadUrl, key, assetId } = step1.data;

  // 2. PUT directo a R2 (el archivo NO pasa por el backend)
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mpeg' },
    body: file,
  });

  // 3. Confirmar al backend
  await fetch('/api/v1/storage/confirm-upload', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      assetType: 'audio-track',
      durationSeconds: metadata.durationSeconds,
    }),
  });

  return assetId;  // Guardar en el estado de la app para descargas futuras
}
```

---

### Subir foto de perfil (avatar o banner)

```typescript
async function uploadProfileImage(
  imageFile: File,
  type: 'user-avatar' | 'user-banner'
): Promise<void> {
  // 1. Presigned URL
  const step1 = await fetch('/api/v1/storage/presigned-upload', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetType: type,
      contentType: 'image/jpeg',
      fileSizeBytes: imageFile.size,
      isPublic: true,
    }),
  }).then(r => r.json());

  // 2. PUT a R2
  await fetch(step1.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: imageFile,
  });

  // 3. Confirmar — el backend actualiza user.avatarUrl o user.bannerUrl
  await fetch('/api/v1/storage/confirm-upload', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: step1.data.key, assetType: type }),
  });

  // GET /users/me ahora devuelve avatarUrl/bannerUrl actualizado
}
```

---

### Subir video grande con multipart (React Native)

```typescript
async function uploadLargeVideo(
  fileUri: string,
  fileSize: number,
  orgId: string,
  eventId: string
): Promise<string> {
  // 1. Iniciar multipart
  const init = await fetch('/api/v1/storage/multipart/initiate', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetType: 'reference-video',
      contentType: 'video/mp4',
      fileSizeBytes: fileSize,
      partSizeBytes: 10 * 1024 * 1024,  // 10 MB por parte
      orgId,
      eventId,
    }),
  }).then(r => r.json());

  const { uploadId, key, assetId, parts } = init.data;

  // 2. Subir partes (5 en paralelo para mayor velocidad)
  const completedParts = [];
  for (let i = 0; i < parts.length; i += 5) {
    const batch = parts.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (part) => {
        const start = (part.partNumber - 1) * 10 * 1024 * 1024;
        const chunk = await readFileChunk(fileUri, start, 10 * 1024 * 1024);
        const res = await fetch(part.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4' },
          body: chunk,
        });
        return { partNumber: part.partNumber, etag: res.headers.get('ETag') };
      })
    );
    completedParts.push(...results);
  }

  // 3. Completar
  await fetch('/api/v1/storage/multipart/complete', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId, parts: completedParts }),
  });

  return assetId;
}
```

---

### Reproducir audio del repertorio con caché offline

```typescript
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

async function playAsset(assetId: string): Promise<void> {
  const localPath = `${FileSystem.cacheDirectory}asset_${assetId}`;
  
  // Intentar reproducir desde caché local (funciona offline)
  const cached = await FileSystem.getInfoAsync(localPath);
  let audioUri = cached.exists ? localPath : null;
  
  if (!audioUri) {
    // Obtener URL firmada del backend
    const { data } = await fetch(
      `/api/v1/storage/assets/${assetId}/download`,
      { headers: authHeaders }
    ).then(r => r.json());
    
    // Descargar y cachear para uso offline futuro
    const { uri } = await FileSystem.downloadAsync(data.downloadUrl, localPath);
    audioUri = uri;
  }
  
  const { sound } = await Audio.Sound.createAsync({ uri: audioUri });
  await sound.playAsync();
}
```

---

### Mostrar foto de perfil

```typescript
// En el componente de perfil
const { data } = await fetch('/api/v1/users/me/profile-urls', { headers: authHeaders }).then(r => r.json());

// data.avatarUrl → URL directa (puede ser CDN o null si no tiene foto)
// data.bannerUrl → URL directa del banner o null

// React Native:
<Image source={{ uri: data.avatarUrl ?? defaultAvatar }} style={styles.avatar} />
```

---

### Buscar assets del repertorio

```typescript
const url = new URL('https://regieart-backend-production.up.railway.app/api/v1/storage/assets');
url.searchParams.set('orgId', orgId);
url.searchParams.append('assetType', 'audio-track');
url.searchParams.append('assetType', 'music-score');
url.searchParams.set('page', '1');
url.searchParams.set('limit', '20');

const { data } = await fetch(url.toString(), { headers: authHeaders }).then(r => r.json());
// data.assets → array de Asset
// data.total → total de resultados
// data.totalPages → para paginación
```

---

## 16. Preguntas Frecuentes — Jurado

---

**¿Por qué Cloudflare R2 y no AWS S3?**

R2 tiene **egress gratuito** — las descargas no tienen costo. Para una app de música y videos donde los músicos descargan partituras y pistas constantemente, el ahorro es significativo. La API es 100% compatible con S3 (protocolo idéntico), por lo que una migración futura sería transparente para el código.

---

**¿El archivo pasa por los servidores de Railway?**

No. El backend solo genera una URL firmada criptográficamente. El archivo viaja directamente del dispositivo del usuario a los servidores de Cloudflare (y viceversa). El backend no ve, no toca y no almacena el binario — solo los metadatos en PostgreSQL.

---

**¿Cómo se garantiza que un usuario no acceda a los archivos de otra organización?**

Tres niveles independientes: (1) el backend verifica membresía en DB antes de generar cualquier URL firmada, (2) las rutas en R2 incluyen el UUID de la organización — sin la URL firmada del backend, la key no es accesible directamente, (3) las URLs firmadas tienen expiración (5-15 min) y están ligadas al objeto exacto y al método HTTP (GET/PUT).

---

**¿Qué pasa si el usuario cierra la app a mitad de una subida?**

Los assets quedan en estado `PENDING`. El `StorageCleanupService` los detecta y elimina automáticamente después de 2 horas (cron horario), liberando el espacio en R2. Para multipart, las partes incompletas también se limpian. No hay intervención manual necesaria.

---

**¿Cómo funciona el multipart upload para un video de 257 MB?**

El backend divide el archivo en 26 partes de 10 MB. El cliente sube cada parte con un PUT independiente a su propia URL firmada (pueden ir en paralelo — se recomienda 5 simultáneas). R2 mantiene las partes temporalmente. Una vez todas llegan, se llama a `complete` y R2 las ensambla en un único archivo atómicamente. Este es exactamente el protocolo que usa AWS S3, Google Cloud Storage y todos los grandes proveedores cloud.

---

**¿La app funciona sin internet después de descargar contenido?**

Sí, si el frontend implementa caché local con `expo-file-system` (React Native). El backend provee las URLs — la app decide cuándo guardar en disco local. Una vez descargado, el audio o video se reproduce sin conexión. Para subidas siempre se requiere conexión.

---

**¿En qué calidad se ven las imágenes y videos?**

R2 sirve exactamente el archivo subido, sin transformaciones. El frontend decide la calidad antes de subir (se recomienda comprimir imágenes a 1200px antes del PUT). Cuando `STORAGE_CDN_URL` esté configurado con un dominio Cloudflare, se puede activar **Cloudflare Image Resizing** para servir thumbnails automáticos: `?width=64&height=64&fit=cover` — sin almacenar múltiples versiones.

---

**¿Cómo maneja el sistema la caída de Redis?**

`enableOfflineQueue: false` en ioredis hace que los comandos fallen **inmediatamente** en lugar de colgar durante 30-60 segundos esperando reconexión. Todos los servicios tienen try/catch que hace fall-through graceful: membresía va directo a DB, caché de URLs se salta, locks de cron no se adquieren (el job simplemente no corre ese ciclo). El sistema **degrada gracefully** — funciona sin caché, solo más lento.

---

**¿Por qué el `ThrottlerModule` es in-memory en lugar de Redis?**

Al principio el throttler usaba Redis como store compartido (útil en escalado horizontal). Pero cuando Redis no estaba disponible, **todas** las peticiones fallaban con 500 — incluidas rutas sin relación con storage. Se tomó la decisión de cambiarlo a in-memory, que es suficiente para una sola instancia en producción. Si el sistema escala a múltiples instancias, se puede reconectar a Redis condicionalmente cuando la conexión esté disponible.

---

**¿Qué es la `key` de R2 y debe guardarla el frontend?**

La `key` es la ruta interna del archivo en el bucket (`organizations/cmq.../repertoire/song-001/audio.mp3`). El frontend **no necesita guardarla** — solo necesita el `assetId` (CUID). El endpoint `GET /assets/:id/download` resuelve la URL usando el ID. La `key` solo aparece en el flujo de subida (devuelta por `presigned-upload` y requerida en `confirm-upload`), pero ambos ocurren en secuencia inmediata y no se necesita persistirla en el estado de la app.
