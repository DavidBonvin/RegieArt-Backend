# De cero a producción: RégieArt Backend en Railway

> Registro técnico del primer despliegue en producción del monorepo RégieArt —
> NestJS · Keycloak · PostgreSQL · Redis sobre Railway con pnpm workspaces.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Servicios en Railway](#servicios-en-railway)
3. [Cómo se conectan los servicios](#cómo-se-conectan-los-servicios)
4. [Archivos que controlan producción](#archivos-que-controlan-producción)
5. [Flujo de autenticación](#flujo-de-autenticación)
6. [Roles del sistema](#roles-del-sistema)
7. [URLs activas](#urls-activas)
8. [Variables de entorno](#variables-de-entorno)
9. [Endpoints disponibles](#endpoints-disponibles)
10. [Problemas resueltos durante el deploy](#problemas-resueltos-durante-el-deploy)
11. [Sugerencias de mejora](#sugerencias-de-mejora)

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                    Railway — production                       │
│                                                              │
│  ┌───────────────────┐       ┌──────────────────────────┐   │
│  │  RegieArt-Backend │       │        keycloak           │   │
│  │  (NestJS API)     │◄─────►│  keycloak-production-     │   │
│  │  :3000            │  JWT  │  b2ce.up.railway.app      │   │
│  │  /api/v1          │       │  :8080                    │   │
│  └────────┬──────────┘       └────────────┬──────────────┘   │
│           │ DATABASE_URL                  │ KC_DB_URL        │
│           ▼                               ▼                  │
│  ┌─────────────────┐         ┌──────────────────────────┐   │
│  │   Postgres_App  │         │    Postgres_keycloak      │   │
│  │   (PostgreSQL)  │         │    (PostgreSQL)            │   │
│  └─────────────────┘         └──────────────────────────┘   │
│                                                              │
│  ┌─────────────────┐                                        │
│  │      Redis      │  (rate-limiting / cache / sesiones)    │
│  └─────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

**Monorepo (pnpm workspaces):**

```
Antigravity/
├── apps/
│   └── api/               ← NestJS (desplegado en Railway)
├── packages/
│   ├── database/          ← Prisma schema + cliente compartido
│   └── types/             ← Tipos TypeScript compartidos
├── keycloak/              ← Dockerfile + realm-export.json
├── railway.toml           ← Config del servicio API en Railway
└── pnpm-workspace.yaml
```

---

## Servicios en Railway

| Servicio | Tipo | Estado |
|---|---|---|
| `RegieArt-Backend` | GitHub repo (apps/api) | ✅ Online |
| `keycloak` | GitHub repo (keycloak/) | ✅ Online |
| `Postgres_App` | Plugin PostgreSQL | ✅ Online |
| `Postgres_keycloak` | Plugin PostgreSQL | ✅ Online |
| `Redis` | Plugin Redis | ✅ Online |

### Configuración de cada servicio en la UI de Railway

**RegieArt-Backend:**
- Source: repositorio GitHub, root `/`
- Railway usa `railway.toml` en la raíz automáticamente
- Dockerfile: `apps/api/Dockerfile`

**keycloak:**
- Source: mismo repositorio, root `/keycloak`
- Railway usa `keycloak/railway.toml` automáticamente
- Dockerfile: `keycloak/Dockerfile`

**Postgres_App y Postgres_keycloak:**
- Creados como plugins de Railway
- Exponen `DATABASE_URL` internamente (referenciada con `${{Postgres.DATABASE_URL}}`)

---

## Cómo se conectan los servicios

```
RegieArt-Backend
  └─ DATABASE_URL         ──► ${{Postgres.DATABASE_URL}}
  └─ KEYCLOAK_URL         ──► https://keycloak-production-b2ce.up.railway.app
  └─ KEYCLOAK_REALM       ──► regieart

keycloak
  └─ KC_DB_URL            ──► URL interna de Postgres_keycloak
  └─ KEYCLOAK_ADMIN       ──► (secreto en Railway)
  └─ KEYCLOAK_ADMIN_PASSWORD ► (secreto en Railway)
```

**El API no habla directamente con Keycloak en tiempo de request.**
En cambio, descarga la clave pública RSA del endpoint JWKS de Keycloak al arrancar
y la usa localmente para validar cada JWT sin hacer una llamada de red extra.

```
/realms/regieart/protocol/openid-connect/certs  ←  jwks-rsa lo consulta al inicio
```

---

## Archivos que controlan producción

| Archivo | Propósito en producción |
|---|---|
| `apps/api/Dockerfile` | Build multi-stage: compila el monorepo y genera imagen Alpine mínima |
| `railway.toml` | Indica a Railway el Dockerfile, healthcheck path y política de reinicio del API |
| `keycloak/Dockerfile` | Imagen de Keycloak con el realm pre-importado |
| `keycloak/railway.toml` | Healthcheck y política de reinicio de Keycloak |
| `keycloak/realm-export.json` | Definición completa del realm: clients, roles, flujos — se importa al arrancar |
| `packages/database/prisma/schema.prisma` | Schema de la DB; `binaryTargets` debe incluir `linux-musl-openssl-3.0.x` para Alpine |
| `packages/database/package.json` | `main`/`types` apuntan a `dist/` — crítico para que NestJS encuentre Prisma |
| `packages/database/tsconfig.json` | Compilación del paquete database a `dist/` |
| `pnpm-workspace.yaml` | `onlyBuiltDependencies` controla qué binarios nativos se compilan |

---

## Flujo de autenticación

```
                        ┌──────────────┐
                        │  App cliente │
                        │ (mobile/web) │
                        └──────┬───────┘
                               │
              POST /token  (client_id=regieart-mobile
                            grant_type=password
                            username / password)
                               │
                               ▼
                        ┌──────────────┐
                        │   Keycloak   │
                        └──────┬───────┘
                               │  JWT firmado con RS256
                               ▼
                        ┌──────────────────────────────┐
                        │      NestJS API              │
                        │                              │
                        │  JwtAuthGuard                │
                        │  ↳ jwks-rsa valida firma     │
                        │  ↳ KeycloakJwtStrategy       │
                        │     ↳ prisma.user.upsert()   │
                        │       (lazy provisioning)    │
                        │  ↳ req.user = AuthenticatedUser│
                        └──────────────────────────────┘
```

**Lazy provisioning:** el usuario se crea en nuestra base de datos automáticamente
la primera vez que se autentica. No hay endpoint de registro manual.

---

## Roles del sistema

### Capa 1 — Keycloak (acceso global a la plataforma)

| Rol | Descripción | Asignado |
|---|---|---|
| `app-user` | Usuario estándar del ecosistema | Por defecto a todos |
| `app-admin` | Superadministrador de la plataforma | Manual por el admin |

Estos roles viven en `realm_access.roles` dentro del JWT y están disponibles
en `JwtPayload.realm_access.roles`.

### Capa 2 — Base de datos (rol dentro de cada organización)

| Rol | Descripción | Permisos |
|---|---|---|
| `OWNER` | Creó la organización | Control total, cambiar cualquier rol |
| `ADMIN` | Administrador delegado | Gestionar miembros (excepto OWNER) |
| `MEMBER` | Integrante estándar | Acceso de lectura, participación en eventos |
| `EXTERNAL_TECH` | Técnico externo | Acceso limitado a eventos asignados |

Un usuario puede tener roles diferentes en organizaciones distintas.
Tabla `organization_members` con clave única `(userId, organizationId)`.

---

## URLs activas

| Servicio | URL |
|---|---|
| API | `https://regieart-backend-production.up.railway.app` |
| API Health | `https://regieart-backend-production.up.railway.app/api/v1/health` |
| Keycloak Admin | `https://keycloak-production-b2ce.up.railway.app/admin` |
| Keycloak OIDC | `https://keycloak-production-b2ce.up.railway.app/realms/regieart` |
| JWKS endpoint | `https://keycloak-production-b2ce.up.railway.app/realms/regieart/protocol/openid-connect/certs` |

---

## Variables de entorno

### RegieArt-Backend (en Railway)

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
KEYCLOAK_URL=https://keycloak-production-b2ce.up.railway.app
KEYCLOAK_REALM=regieart
CORS_ORIGINS=http://localhost:3001   # ← actualizar con URL del frontend real
```

### keycloak (en Railway)

```env
KC_DB_URL=<URL interna de Postgres_keycloak>
KC_DB_USERNAME=<usuario>
KC_DB_PASSWORD=<contraseña>
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<contraseña segura>
```

---

## Endpoints disponibles

Todos los endpoints protegidos requieren `Authorization: Bearer <token>`.

### Obtener token (para pruebas)

```bash
curl -X POST "https://keycloak-production-b2ce.up.railway.app/realms/regieart/protocol/openid-connect/token" \
  -d "client_id=regieart-mobile" \
  -d "grant_type=password" \
  -d "username=<email>" \
  -d "password=<password>"
```

### Health

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/v1/health` | No | Estado del API |

### Users

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/v1/users/me` | Sí | Ver mi perfil completo |
| PATCH | `/api/v1/users/me` | Sí | Actualizar perfil (displayName, bio, phone, etc.) |

### Organizations

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/v1/organizations` | Sí | Crear organización (caller queda como OWNER) |
| GET | `/api/v1/organizations` | Sí | Listar mis organizaciones |
| GET | `/api/v1/organizations/:id` | Sí | Ver organización con lista de miembros y roles |
| PATCH | `/api/v1/organizations/:orgId/members/:memberId/role` | Sí (OWNER/ADMIN) | Cambiar rol de un miembro |

---

## Problemas resueltos durante el deploy

| Error | Causa | Solución |
|---|---|---|
| Build falla en `pnpm install` | pnpm 10 bloquea postinstall hooks | `--ignore-scripts` + `pnpm rebuild` explícito |
| `@regieart/types` not found | Paquete no compilado antes del build del API | Agregar `pnpm --filter @regieart/types build` en Dockerfile |
| `rootDir mismatch` en TypeScript | `tsconfig.json` del API sin `rootDir` explícito | Crear `tsconfig.build.json` con `rootDir: "./src"` |
| Prisma no encuentra schema en runtime | Dockerfile no copiaba la carpeta `prisma/` | `COPY --from=builder .../packages/database/prisma` en runner stage |
| `@prisma/client` not found en runtime | `node_modules` del paquete database no copiados | `COPY --from=builder .../packages/database/node_modules` |
| Prisma engine binary mismatch | Imagen Alpine usa `linux-musl-openssl-3.0.x`, Prisma generaba para `linux-musl` | `apk add --no-cache openssl` en builder + `binaryTargets` en schema.prisma |
| `package.json` `"pnpm"` field inválido | Campo no soportado en pnpm 10 | Movido a `pnpm-workspace.yaml` como `onlyBuiltDependencies` |
| Keycloak healthcheck timeout | Keycloak tarda ~3 min en arrancar | `healthcheckTimeout = 600` en `keycloak/railway.toml` |

---

## Sugerencias de mejora

### Seguridad

- [ ] Cambiar contraseñas de usuarios de prueba antes de usar con datos reales
- [ ] Rotar el `KEYCLOAK_CLIENT_SECRET` del client `regieart-api` en el realm-export
- [ ] Configurar `CORS_ORIGINS` con la URL real del frontend cuando esté disponible
- [ ] Activar HTTPS-only en Keycloak (deshabilitar `--http-enabled=true`) cuando el TLS esté estable

### Código

- [ ] Devolver error `409 Conflict` cuando se intente crear una organización con nombre duplicado, en lugar de generar un slug con timestamp
- [ ] Agregar `DELETE /organizations/:id` (solo OWNER) antes de ir a producción real con usuarios reales
- [ ] Implementar los endpoints de invitaciones (`invite_links` ya está en el schema)
- [ ] Usar `app-admin` de Keycloak para proteger rutas de administración global del sistema

### Observabilidad

- [ ] Agregar `GET /api/v1/health/detailed` que reporte estado de DB y Redis
- [ ] Integrar Sentry (o similar) para captura de errores en producción
- [ ] Configurar alertas en Railway cuando un servicio cae o el healthcheck falla

### Railway

- [ ] Configurar deploy automático solo desde rama `main`
- [ ] Considerar plan Hobby de Railway para evitar hibernación de servicios en producción real
- [ ] Agregar variables de entorno separadas para un entorno `staging` antes de llegar a producción

---

*Deploy inicial completado el 3 de junio de 2026.*
*Stack: NestJS 10 · Prisma 5 · Keycloak 23 · PostgreSQL · Redis · pnpm 11 · Railway*
