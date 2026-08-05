// ============================================================
// File upload policies for the StorageModule.
// Defines the allowed asset types, valid MIME types,
// the maximum size in bytes, and the function that builds the path
// within the Cloudflare R2 bucket.
//
// Multi-tenant principle: each path is isolated by UUID
// (userId or orgId), preventing one tenant from accessing
// another tenant's files even if they know the S3 key.
// ============================================================

// ─── Convenience constant for readability ──────────────────
export const MB = 1024 * 1024;

// ─── MIME type constants (prevents duplicate string literals) ───
const MIME_IMAGE_JPEG = 'image/jpeg';
const MIME_IMAGE_PNG  = 'image/png';
const MIME_PDF        = 'application/pdf';

// ─── Enum of asset types supported by the platform ──────────────
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

// ─── Context parameters for building the S3 path ────────────
// userId always comes from the JWT; the rest comes from the client DTO
export interface PathParams {
  userId: string;
  orgId?: string;
  songId?: string;
  eventId?: string;
  fileId?: string;
}

// ─── Structure of an upload policy ────────────────────────
export interface UploadPolicy {
  // MIME types accepted for this asset type
  allowedMimeTypes: string[];
  // Maximum file size in bytes
  maxSizeBytes: number;
  // PathParams fields that are required for this type
  requiredParams: Array<keyof PathParams>;
  // If true, the backend generates the fileId using crypto.randomUUID()
  // and ignores any fileId the client sends.
  // Use for assets where traceability or versioning is critical:
  // financial receipts, legal documents, technical files, and videos.
  serverGeneratesFileId?: boolean;
  // Pure function that builds the S3 key from the context
  buildKey: (params: PathParams) => string;
}

// ─── Central policy map, indexed by AssetType ───────────────
// This is the storage system's security "contract".
// Changes here affect the entire module in a centralized way.
export const UPLOAD_POLICIES: Record<AssetType, UploadPolicy> = {

  // Profile photo of the authenticated user
  [AssetType.USER_AVATAR]: {
    allowedMimeTypes: [MIME_IMAGE_JPEG, MIME_IMAGE_PNG],
    maxSizeBytes: 2 * MB,
    requiredParams: ['userId'],
    buildKey: ({ userId }) => `profiles/${userId}/avatar.jpg`,
  },

  // Personal profile banner of the user (similar to LinkedIn/Facebook)
  [AssetType.USER_BANNER]: {
    allowedMimeTypes: [MIME_IMAGE_JPEG, MIME_IMAGE_PNG, 'image/webp'],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId'],
    buildKey: ({ userId }) => `profiles/${userId}/banner.jpg`,
  },

  // Main banner for an organization/band
  [AssetType.ORG_BANNER]: {
    allowedMimeTypes: [MIME_IMAGE_JPEG, MIME_IMAGE_PNG],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId', 'orgId'],
    buildKey: ({ orgId }) => `organizations/${orgId}/banners/main.png`,
  },

  // Audio track from a rehearsal or repertoire song
  [AssetType.AUDIO_TRACK]: {
    allowedMimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
    maxSizeBytes: 25 * MB,
    requiredParams: ['userId', 'orgId', 'songId'],
    buildKey: ({ orgId, songId }) =>
      `organizations/${orgId}/repertoire/${songId}/audio.mp3`,
  },

  // Sheet music in PDF or SVG format for a repertoire song
  [AssetType.MUSIC_SCORE]: {
    allowedMimeTypes: [MIME_PDF, 'image/svg+xml'],
    maxSizeBytes: 10 * MB,
    requiredParams: ['userId', 'orgId', 'songId'],
    buildKey: ({ orgId, songId }) =>
      `organizations/${orgId}/repertoire/${songId}/score.pdf`,
  },

  // Ticket or receipt for financial OCR of an event
  [AssetType.FINANCIAL_RECEIPT]: {
    allowedMimeTypes: [MIME_IMAGE_JPEG, MIME_IMAGE_PNG, MIME_PDF],
    maxSizeBytes: 5 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/receipts/${fileId}.jpg`,
  },

  // Technical show configuration file (console patch)
  [AssetType.TECHNICAL_FILE]: {
    allowedMimeTypes: ['application/xml', 'text/plain', 'application/octet-stream'],
    maxSizeBytes: 8 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/technical/${fileId}.patch`,
  },

  // Short reference video for stage choreography or lighting
  [AssetType.REFERENCE_VIDEO]: {
    allowedMimeTypes: ['video/mp4', 'video/quicktime'],
    maxSizeBytes: 300 * MB,
    requiredParams: ['userId', 'orgId', 'eventId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, eventId, fileId }) =>
      `organizations/${orgId}/events/${eventId}/videos/${fileId}.mp4`,
  },

  // Legal document (ID, passport, contract) for HR
  [AssetType.LEGAL_DOCUMENT]: {
    allowedMimeTypes: [MIME_PDF, MIME_IMAGE_JPEG],
    maxSizeBytes: 10 * MB,
    requiredParams: ['userId', 'orgId', 'fileId'],
    serverGeneratesFileId: true,
    buildKey: ({ orgId, fileId }) =>
      `organizations/${orgId}/legal/${fileId}.pdf`,
  },
};
