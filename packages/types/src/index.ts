// ============================================================
// @regieart/types — Tipos compartidos del ecosistema
// Importar en apps/api, apps/mobile, apps/web
// ============================================================

// ─── Roles ───────────────────────────────────────────────────
export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  EXTERNAL_TECH = 'EXTERNAL_TECH',
}

// ─── Usuario autenticado (payload del JWT de Keycloak) ───────
export interface JwtPayload {
  sub: string;         // keycloakId
  email: string;
  name: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
}

// ─── Usuario en la DB (después del lazy provisioning) ────────
export interface AuthenticatedUser {
  id: string;          // cuid de nuestra DB
  keycloakId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

// ─── Respuesta estándar de la API ────────────────────────────
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
