// ============================================================
// Políticas de subida de archivos para el StorageModule.
// Define los tipos de activo permitidos, sus MIME Types válidos,
// el tamaño máximo en bytes y la función que construye la ruta
// dentro del bucket de Cloudflare R2.
//
// Principio Multi-tenant: cada ruta está aislada por UUID
// (userId u orgId), lo que impide que un tenant acceda a
// los archivos de otro incluso si conoce la clave S3.
// ============================================================

// ─── Constante de conveniencia para legibilidad ──────────────
export const MB = 1024 * 1024;

// ─── Enum de tipos de activo soportados por la plataforma ────
export enum AssetType {
  USER_AVATAR = 'user-avatar',
  USER_BANNER = 'user-banner',
  ORG_BANNER = 'org-banner',
  AUDIO_TRACK = 'audio-track',
  MUSIC_SCORE = 'music-score',
  FINANCIAL_RECEIPT = 'financial-receipt',
  TECHNICAL_FILE = 'technical-file',
  REFERENCE_VIDEO = 'reference-video',
  LEGAL_DOCUMENT = 'legal-document',
}

// ─── Parámetros de contexto para construir la ruta S3 ────────
// El userId siempre viene del JWT; el resto viene del DTO del cliente
export interface PathParams {
  userId: string;
  orgId?: string;
  songId?: string;
  eventId?: string;
  fileId?: string;
}

// ─── Estructura de una política de subida ────────────────────
export interface UploadPolicy {
  // MIME Types que se aceptan para este tipo de activo
  allowedMimeTypes: string[];
  // Tamaño máximo del archivo en bytes
  maxSizeBytes: number;
  // Campos del PathParams que son obligatorios para este tipo
  requiredParams: Array<keyof PathParams>;
  // Si es true, el backend genera el fileId con crypto.randomUUID()
  // y lo ignora aunque el cliente lo envíe.
  // Usar en activos donde la trazabilidad o el versionado es crítico:
  // recibos financieros, documentos legales, archivos técnicos y videos.
  serverGeneratesFileId?: boolean;
  // Función pura que construye la clave S3 a partir del contexto
  buildKey: (params: PathParams) => string;
}

// ─── Mapa central de políticas, indexado por AssetType ───────
// Este es el "contrato" de seguridad del sistema de almacenamiento.
// Modificar aquí afecta a todo el módulo de forma centralizada.
export const UPLOAD_POLICIES: Record<AssetType, UploadPolicy> = {

  // Foto de perfil del usuario autenticado
  [AssetType.USER_AVATAR]: {
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: 2 * MB,
    requiredParams: ['userId'],
    buildKey: ({ userId }) => `profiles/${userId}/avatar.jpg`,
  },

  // Banner de perfil personal del usuario (similar a LinkedIn/Facebook)
  [AssetType.USER_BANNER]: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId'],
    buildKey: ({ userId }) => `profiles/${userId}/banner.jpg`,
  },

  // Banner principal de una organización/banda
  [AssetType.ORG_BANNER]: {
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId', 'orgId'],
    buildKey: ({ orgId }) => `organizations/${orgId}/banners/main.png`,
  },

  // Pista de audio de un ensayo o canción del repertorio
  [AssetType.AUDIO_TRACK]: {
    allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    maxSizeBytes: 25 * MB,
    requiredParams: ['userId', 'orgId', 'songId'],
    buildKey: ({ orgId, songId }) =>
      `organizations/${orgId}/repertoire/${songId}/audio.mp3`,
  },

  // Partitura en PDF o SVG de una canción del repertorio
  [AssetType.MUSIC_SCORE]: {
    allowedMimeTypes: ['application/pdf', 'image/svg+xml'],
    maxSizeBytes: 10 * MB,
    requiredParams: ['userId', 'orgId', 'songId'],
    buildKey: ({ orgId, songId }) =>
      `organizations/${orgId}/repertoire/${songId}/score.pdf`,
  },

  // Ticket o recibo para OCR financiero de un evento
  [AssetType.FINANCIAL_RECEIPT]: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/receipts/${fileId}.jpg`,
  },

  // Archivo de configuración técnica del show (patch de consola)
  [AssetType.TECHNICAL_FILE]: {
    allowedMimeTypes: ['application/xml', 'text/plain', 'application/octet-stream'],
    maxSizeBytes: 8 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/technical/${fileId}.patch`,
  },

  // Video corto de referencia coreográfica o lumínica del escenario
  [AssetType.REFERENCE_VIDEO]: {
    allowedMimeTypes: ['video/mp4', 'video/quicktime'],
    maxSizeBytes: 300 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/videos/${fileId}.mp4`,
  },

  // Documento legal (DNI, pasaporte, contrato) para RRHH
  [AssetType.LEGAL_DOCUMENT]: {
    allowedMimeTypes: ['application/pdf', 'image/jpeg'],
    maxSizeBytes: 10 * MB,
    requiredParams: ['userId', 'orgId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, fileId }) =>
      `organizations/${orgId}/legal/${fileId}.pdf`,
  },
};
