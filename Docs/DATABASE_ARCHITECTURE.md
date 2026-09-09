# Arquitectura de Base de Datos, ORM y Redis — RegieArt Backend

Documento de estudio para entender cómo está diseñada la base de datos, cómo se integra con Prisma ORM desde la API NestJS y cómo Redis participa en caché, locks y disponibilidad.

Estado observado en la base local al 2026-09-08.

---

## 1. Resumen General

RegieArt usa una arquitectura clásica de backend NestJS + Prisma + PostgreSQL + Redis.

```mermaid
flowchart LR
  Client[Frontend Web / Mobile] --> API[NestJS API]
  API --> Prisma[PrismaService]
  Prisma --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> Keycloak[Keycloak]
  API --> R2[Cloudflare R2]
  API --> Weather[WeatherAPI.com]
  API --> Resend[Resend Email]
```

La base de datos principal es **PostgreSQL**. Prisma es el ORM que traduce operaciones TypeScript (`findMany`, `create`, `update`, `upsert`, `$transaction`) a SQL. Redis no reemplaza PostgreSQL: se usa como caché rápido, lock distribuido y health check.

En local, según `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/regieart?schema=public
REDIS_URL=redis://localhost:6379
```

El esquema fuente está en [packages/database/prisma/schema.prisma](../packages/database/prisma/schema.prisma).

---

## 2. Inventario de Tablas

La base tiene **24 tablas de dominio** + **1 tabla técnica** de Prisma.

| Tabla | Filas actuales | Rol principal |
|---|---:|---|
| `users` | 5 | Usuarios locales sincronizados con Keycloak |
| `organizations` | 6 | Bandas, agencias o grupos |
| `organization_members` | 7 | Relación usuario ↔ organización con rol |
| `invite_links` | 0 | Links genéricos para unirse a una organización |
| `invitations` | 7 | Invitaciones nominales por email/token |
| `assets` | 4 | Metadatos de archivos en Cloudflare R2 |
| `songs` | 4 | Repertorio de una organización |
| `venues` | 2 | Lugares reutilizables de eventos |
| `events` | 5 | Conciertos, ensayos, audiciones, sesiones |
| `event_roster` | 6 | Relación evento ↔ usuario con rol/asistencia |
| `event_schedule_items` | 2 | Cronograma operativo del evento |
| `event_vehicles` | 3 | Vehículos del evento |
| `vehicle_passengers` | 0 | Relación vehículo ↔ pasajero |
| `vehicle_pickup_points` | 3 | Paradas de recogida de un vehículo |
| `event_finance` | 0 | Resumen financiero 1:1 del evento |
| `finance_categories` | 0 | Categorías de ingresos/gastos por organización |
| `finance_entries` | 7 | Movimientos financieros granulares |
| `per_diem_payouts` | 0 | Viáticos/dietas por usuario/evento |
| `skill_categories` | 9 | Catálogo global de habilidades/instrumentos |
| `user_skills` | 2 | Relación usuario ↔ habilidad |
| `instruments` | 0 | Inventario/backline de una organización |
| `instrument_assignments` | 0 | Asignaciones de instrumentos a usuarios/eventos |
| `notifications` | 13 | Notificaciones internas de la app |
| `messages` | 6 | Mensajes directos usuario ↔ usuario |
| `_prisma_migrations` | 14 | Tabla técnica de migraciones Prisma |

---

## 3. Convenciones de Datos

### 3.1 IDs y fechas

Casi todas las tablas usan:

| Tipo lógico | Prisma | PostgreSQL | Ejemplo |
|---|---|---|---|
| ID primario | `String @id @default(cuid())` | `TEXT` | `cmtr3n8iy006fz7ej6tmz2bbb` |
| Fecha creación | `DateTime @default(now())` | `TIMESTAMP(3)` | `createdAt` |
| Fecha actualización | `DateTime @updatedAt` | `TIMESTAMP(3)` | `updatedAt` |
| Soft delete | `DateTime?` | `TIMESTAMP(3) NULL` | `deletedAt` |

El patrón habitual para borrar entidades importantes es **soft delete** (`deletedAt`, `isActive`, `status`) en vez de eliminar físicamente.

### 3.2 Nombres reales de tablas

En Prisma los modelos usan PascalCase (`User`, `OrganizationMember`), pero en PostgreSQL se guardan con snake_case por `@@map`:

| Modelo Prisma | Tabla PostgreSQL |
|---|---|
| `User` | `users` |
| `OrganizationMember` | `organization_members` |
| `EventRoster` | `event_roster` |
| `VehiclePickupPoint` | `vehicle_pickup_points` |

### 3.3 Monedas y cantidades

Los importes financieros usan `Decimal @db.Decimal(10, 2)`, no `Float`. Esto evita errores de redondeo en dinero.

### 3.4 BigInt

`Asset.sizeBytes` usa `BigInt` porque puede representar archivos grandes, por ejemplo videos de varios GB.

---

## 4. Integración Prisma ORM

### 4.1 Paquete database

El paquete [packages/database](../packages/database) expone directamente el cliente Prisma:

```ts
// packages/database/index.ts
export * from '@prisma/client';
```

Eso permite que la API importe modelos y enums desde `@regieart/database`.

### 4.2 PrismaService en la API

Archivo: [apps/api/src/prisma/prisma.service.ts](../apps/api/src/prisma/prisma.service.ts)

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Esto significa:

- `PrismaService` hereda todos los métodos de `PrismaClient`.
- NestJS abre la conexión al arrancar el módulo.
- NestJS cierra la conexión al apagar la aplicación.
- Cualquier servicio puede inyectar `PrismaService` y hacer consultas.

### 4.3 PrismaModule global

Archivo: [apps/api/src/prisma/prisma.module.ts](../apps/api/src/prisma/prisma.module.ts)

```ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Como es `@Global()`, los servicios pueden inyectar `PrismaService` sin importar `PrismaModule` en cada módulo funcional.

### 4.4 Tipos de queries Prisma usados

| Operación Prisma | Uso típico | Ejemplo lógico |
|---|---|---|
| `findUnique` | Buscar por campo único o PK | usuario por `id`, organización por `slug` |
| `findFirst` | Buscar con filtros no únicos | evento activo `id + deletedAt: null` |
| `findMany` | Listados | eventos de una organización, mensajes, notificaciones |
| `create` | Crear fila | organización, canción, evento, mensaje |
| `createMany` | Inserción masiva | notificaciones en bulk |
| `update` | Modificar fila existente | marcar mensaje leído, cambiar rol |
| `updateMany` | Modificar muchas filas | expirar invitaciones pendientes |
| `delete` | Eliminación física | categorías, passengers, pickup points |
| `upsert` | Crear o actualizar | `event_finance`, asset pendiente |
| `$transaction` | Operaciones atómicas o paginación | crear miembro + aceptar invitación, `findMany + count` |
| `count` | Contadores | no leídos, total de páginas |

### 4.5 Transacciones importantes

| Servicio | Momento | Operaciones dentro de `$transaction` |
|---|---|---|
| `EventsService.createEvent` | Crear evento | crea evento + añade creator al roster |
| `EventsService.findAll` | Listar eventos paginados | `event.findMany` + `event.count` |
| `FinanceService.findEntries` | Listar finanzas paginadas | `financeEntry.findMany` + `financeEntry.count` |
| `InventoryService.assign` | Asignar instrumento | crea `instrument_assignment` + cambia `instrument.status` a `IN_USE` |
| `InvitationsService.acceptInvitation` | Aceptar invitación nominal | crea `organization_member` + actualiza `invitation.status` |
| `MessagesService.getConversation` | Ver conversación | `message.findMany` + `message.count` |
| `NotificationsService.findAll` | Listar notificaciones | `notification.findMany` + `notification.count` |
| `StorageCleanupService` | Limpieza de assets | updates/deletes controlados con lock Redis |

---

## 5. Integración Redis

### 5.1 RedisService

Archivo: [apps/api/src/redis/redis.service.ts](../apps/api/src/redis/redis.service.ts)

Redis usa `ioredis`.

Configuración relevante:

```ts
this.client = new Redis(redisUrl, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
  connectTimeout: 3000,
  retryStrategy: (times) => {
    if (times > 10) return null;
    return Math.min(times * 500, 5000);
  },
});
```

Diseño:

- Redis es **útil pero no crítico**.
- Si Redis falla, muchas operaciones siguen funcionando sin caché.
- `enableOfflineQueue: false` evita que las peticiones queden colgadas 30-60 segundos.
- `maxRetriesPerRequest: 0` hace que las llamadas fallen rápido.
- Los servicios capturan errores de Redis y continúan cuando es posible.

### 5.2 RedisModule global

Archivo: [apps/api/src/redis/redis.module.ts](../apps/api/src/redis/redis.module.ts)

```ts
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

Como es global, los servicios pueden inyectar `RedisService` directamente.

### 5.3 Usos actuales de Redis

| Zona | Servicio | Keys aproximadas | Uso |
|---|---|---|---|
| Health | `HealthService` | N/A | `PING` para saber si Redis está arriba |
| Geocoding | `GeoService` | `geo:*` | Caché de geocodificación/autocomplete |
| Rutas | `ConvoyService` | rutas OSRM | Caché de cálculo de rutas |
| Storage membership | `StorageMembershipService` | membresía org/usuario | Cachea si un usuario pertenece a una organización |
| Storage downloads | `StoragePresignedService` | URL firmada por key | Cachea URLs de descarga no sensibles por 4 min |
| Storage cleanup | `StorageCleanupService` | locks | Locks distribuidos con `SET NX` |
| Weather | `WeatherService` | `weather:*` | Caché de clima actual, forecast diario y forecast por evento |

### 5.4 Redis no almacena datos fuente

Redis no es fuente de verdad. Si se pierde Redis:

- La app sigue usando PostgreSQL.
- Se pierden cachés temporales.
- Se recalculan rutas/clima/firmas cuando haga falta.
- Los locks de limpieza podrían no adquirirse, pero los datos no se corrompen.

---

## 6. Modelo Relacional Global

```mermaid
erDiagram
  users ||--o{ organization_members : belongs_to
  organizations ||--o{ organization_members : has
  users ||--o{ invite_links : creates
  organizations ||--o{ invite_links : has
  users ||--o{ invitations : sends
  users ||--o{ invitations : receives
  organizations ||--o{ invitations : has

  organizations ||--o{ songs : owns
  users ||--o{ songs : creates
  songs ||--o{ assets : has

  users ||--o{ venues : creates
  venues ||--o{ events : hosts
  organizations ||--o{ events : owns
  users ||--o{ events : creates

  events ||--o{ event_roster : has
  users ||--o{ event_roster : participates
  events ||--o{ event_schedule_items : has
  events ||--o{ event_vehicles : has
  event_vehicles ||--o{ vehicle_passengers : has
  users ||--o{ vehicle_passengers : rides
  event_vehicles ||--o{ vehicle_pickup_points : has

  events ||--o| event_finance : finance
  organizations ||--o{ finance_categories : has
  organizations ||--o{ finance_entries : has
  events ||--o{ finance_entries : has
  finance_categories ||--o{ finance_entries : categorizes
  users ||--o{ finance_entries : creates
  users ||--o{ finance_entries : approves
  organizations ||--o{ per_diem_payouts : has
  events ||--o{ per_diem_payouts : has
  users ||--o{ per_diem_payouts : receives

  skill_categories ||--o{ user_skills : classifies
  users ||--o{ user_skills : has

  organizations ||--o{ instruments : owns
  instruments ||--o{ instrument_assignments : assigned
  users ||--o{ instrument_assignments : receives
  events ||--o{ instrument_assignments : context

  users ||--o{ notifications : receives
  users ||--o{ messages : sends
  users ||--o{ messages : receives
  users ||--o{ assets : uploads
  organizations ||--o{ assets : owns
  events ||--o{ assets : has
```

---

## 7. Tablas Puente / Relación

Hay **5 tablas claramente relacionales** entre entidades principales.

| Tabla | Relación | Cardinalidad | Tiene datos extra | Campos extra importantes |
|---|---|---|---|---|
| `organization_members` | `users` ↔ `organizations` | N:N | Sí | `role`, `joinedAt`, `updatedAt` |
| `event_roster` | `users` ↔ `events` | N:N | Sí | `role`, `status`, `notes`, `invitedAt`, `respondedAt` |
| `vehicle_passengers` | `users` ↔ `event_vehicles` | N:N | No mucho | solo IDs, uniqueness |
| `user_skills` | `users` ↔ `skill_categories` | N:N | Sí | `expertiseLevel`, `yearsExp`, `createdAt` |
| `instrument_assignments` | `instruments` ↔ `users/events` | N:N temporal | Sí | `assignedAt`, `returnedAt`, `notes` |

Notas:

- `finance_entries` no es una tabla puente aunque conecta org/event/category/user; es una entidad de negocio propia.
- `assets` tampoco es solo puente: es el registro central de metadatos de archivos.
- `invitations` e `invite_links` son entidades de workflow, no solo relaciones.

---

## 8. Detalle de Cada Tabla

### 8.1 `users`

Modelo Prisma: `User`

Guarda el perfil local del usuario. La identidad real de autenticación viene de Keycloak (`keycloakId`).

| Campo | Tipo Prisma | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno CUID |
| `keycloakId` | `String @unique` | Sí | ID del usuario en Keycloak |
| `email` | `String @unique` | Sí | Email único |
| `displayName` | `String` | Sí | Nombre visible |
| `firstName`, `lastName` | `String?` | No | Nombre/apellido |
| `avatarUrl`, `bannerUrl` | `String?` | No | URLs públicas o CDN |
| `phone`, `bio` | `String?` | No | Perfil |
| `city`, `country` | `String?` | No | Ciudad base y país ISO; usados por clima si no llega GPS |
| `isActive` | `Boolean` | Sí | Soft activation |
| `createdAt`, `updatedAt` | `DateTime` | Sí | Auditoría |

Relaciones principales:

- 1:N con `venues`, `events`, `songs`, `notifications`, `assets`.
- N:N con `organizations` vía `organization_members`.
- N:N con `events` vía `event_roster`.
- N:N con `skill_categories` vía `user_skills`.
- Mensajes: dos relaciones separadas, `sentMessages` y `receivedMessages`.

Consultas típicas:

- En `KeycloakJwtStrategy`: busca/crea usuario local al validar token.
- En `UsersService`: perfil propio, perfil público y URLs de avatar/banner.
- En `MessagesService`: validar destinatario/remitente.
- En `WeatherDashboardService`: obtener `displayName`, `city`, `country`.

---

### 8.2 `organizations`

Modelo Prisma: `Organization`

Representa una banda, agencia o grupo.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `name` | `String` | Sí | Nombre |
| `slug` | `String @unique` | Sí | URL amigable |
| `description`, `logoUrl`, `website`, `phone` | `String?` | No | Perfil público/administrativo |
| `isActive` | `Boolean` | Sí | Activa/inactiva |
| `deletedAt` | `DateTime?` | No | Soft delete |
| `createdAt`, `updatedAt` | `DateTime` | Sí | Auditoría |

Relaciones:

- 1:N con miembros, invitaciones, assets, canciones, eventos, finanzas e instrumentos.

Consultas típicas:

- Crear organización: valida `slug` único y crea también membresía owner.
- Listar organizaciones del usuario: filtra por `members.some.userId`.
- Cambiar rol/remover miembro: lee `organization_members` y valida permisos.
- Soft delete: `deletedAt` + `isActive`.

---

### 8.3 `organization_members`

Modelo Prisma: `OrganizationMember`

Tabla puente N:N entre usuarios y organizaciones, con rol.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `userId` | `String` | Sí | FK a `users.id` |
| `organizationId` | `String` | Sí | FK a `organizations.id` |
| `role` | `MemberRole` | Sí | `OWNER`, `ADMIN`, `MEMBER`, `EXTERNAL_TECH` |
| `joinedAt`, `updatedAt` | `DateTime` | Sí | Auditoría |

Restricciones:

- `@@unique([userId, organizationId])`: un usuario solo puede tener un rol por organización.
- `onDelete: Cascade` en usuario y organización.

Uso:

- Control de permisos en casi todos los módulos.
- Determina qué organizaciones ve el usuario.
- Determina si puede crear eventos, editar finanzas, descargar assets org-scoped, etc.

---

### 8.4 `invite_links`

Modelo Prisma: `InviteLink`

Links genéricos de invitación a una organización.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `token` | `String @unique` | Sí | Token público del link |
| `organizationId` | `String` | Sí | Organización destino |
| `createdById` | `String` | Sí | Usuario que creó el link |
| `role` | `MemberRole` | Sí | Rol asignado al aceptar |
| `expiresAt` | `DateTime` | Sí | Expiración |
| `usedAt` | `DateTime?` | No | Marca de uso |
| `createdAt` | `DateTime` | Sí | Auditoría |

Uso:

- Admin/Owner genera link.
- Usuario consume token.
- Backend valida expiración, uso previo y membresía existente.
- Al aceptar, crea fila en `organization_members` y marca `usedAt`.

---

### 8.5 `invitations`

Modelo Prisma: `Invitation`

Invitación nominal a un email o usuario concreto.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `token` | `String @unique` | Sí | Token de aceptación/rechazo |
| `organizationId` | `String` | Sí | Organización destino |
| `createdById` | `String` | Sí | Invitador |
| `targetEmail` | `String` | Sí | Email invitado |
| `targetUserId` | `String?` | No | Usuario si ya existe |
| `role` | `MemberRole` | Sí | Rol asignado |
| `instrument` | `String?` | No | Instrumento sugerido |
| `personalMessage` | `String?` | No | Mensaje personal |
| `status` | `InvitationStatus` | Sí | `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `REVOKED` |
| `expiresAt`, `respondedAt`, `createdAt` | `DateTime` | Parcial | Ciclo de vida |

Flujo:

1. Admin/Owner envía invitación.
2. Backend valida organización, duplicados y membresía existente.
3. Crea `invitations`.
4. Envía email por Resend.
5. Si el usuario existe, crea notificación interna.
6. Al aceptar: transacción crea `organization_members` y actualiza status.
7. Al rechazar/revocar: actualiza status y notifica.

---

### 8.6 `assets`

Modelo Prisma: `Asset`

Metadatos de archivos almacenados en Cloudflare R2. La key de R2 (`key`) es la ruta real del objeto.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `key` | `String @unique` | Sí | Ruta en R2 |
| `assetType` | `AssetType` | Sí | Tipo semántico del archivo |
| `contentType` | `String` | Sí | MIME type |
| `sizeBytes` | `BigInt` | Sí | Tamaño real |
| `status` | `AssetStatus` | Sí | `PENDING`, `CONFIRMED`, `READY`, etc. |
| `etag` | `String?` | No | Checksum/ETag de R2 |
| `displayName`, `originalName`, `description` | `String?` | No | UX/búsqueda |
| `tags` | `String[]` | Sí | Etiquetas |
| `language` | `String?` | No | Idioma del asset |
| `durationSeconds`, `width`, `height`, `pageCount`, `bitrate` | media metadata | No | Audio/video/pdf |
| `isMultipart`, `uploadId`, `partCount` | multipart | Parcial | Uploads grandes |
| `uploadedById`, `orgId`, `songId`, `eventId`, `memberId` | FKs/contexto | Parcial | Propiedad/contexto |
| `version`, `replacesId` | versionado | Sí/parcial | Historial |
| `isPublic`, `expiresAt` | acceso | Sí/parcial | CDN o temporal |
| `createdAt`, `confirmedAt`, `deletedAt`, `updatedAt` | auditoría | Parcial | Ciclo de vida |

Flujo de subida simple:

1. Frontend pide `POST /storage/presigned-url`.
2. Backend valida tipo/MIME/tamaño/membresía.
3. Crea o actualiza asset `PENDING`.
4. Genera URL PUT firmada hacia R2.
5. Frontend sube archivo directo a R2.
6. Frontend llama `POST /storage/confirm-upload`.
7. Backend hace `HeadObject` en R2 y actualiza asset a `CONFIRMED`.

Flujo de descarga:

1. Frontend pide URL de descarga.
2. Backend valida acceso por owner/org.
3. Si es público y hay CDN, devuelve URL pública.
4. Si no, firma URL GET y la guarda en Redis 4 min.
5. Documentos sensibles no se cachean y expiran en 1 min.

---

### 8.7 `songs`

Modelo Prisma: `Song`

Canciones del repertorio de una organización.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `title` | `String` | Sí | Título |
| `composer`, `arranger`, `genre`, `musicalKey`, `notes` | `String?` | No | Metadata musical |
| `tempo` | `Int?` | No | BPM |
| `durationSeconds` | `Float?` | No | Duración |
| `isActive` | `Boolean` | Sí | Activa |
| `createdById` | `String` | Sí | Creador |
| `deletedAt` | `DateTime?` | No | Soft delete |

Relaciones:

- N:1 con `organizations`.
- N:1 con `users` como creador.
- 1:N con `assets` para partituras y audio tracks.

Queries:

- Crear canción para org.
- Buscar por texto (`title`, `composer`, `arranger`) y género.
- Listar paginado con `findMany + count`.
- Soft delete con `deletedAt`.

---

### 8.8 `venues`

Modelo Prisma: `Venue`

Lugares reutilizables donde ocurren eventos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `name` | `String` | Sí | Nombre |
| `address` | `String?` | No | Dirección |
| `city` | `String` | Sí | Ciudad |
| `country` | `String` | Sí | País, default `CA` |
| `capacity` | `Int?` | No | Capacidad |
| `latitude`, `longitude` | `Float?` | No | Coordenadas GPS |
| `parkingNotes`, `loadInNotes`, `notes` | `String?` | No | Logística |
| `technicalContact*` | `String?` | No | Contacto técnico |
| `timezone` | `String?` | No | Zona IANA |
| `createdById` | `String` | Sí | Creador |

Uso importante:

- Weather y rutas requieren `latitude`/`longitude`.
- Si el venue no tiene coordenadas, no hay alertas de clima ni rutas precisas.

---

### 8.9 `events`

Modelo Prisma: `Event`

Entidad central del sistema.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `title` | `String` | Sí | Título |
| `type` | `EventType` | Sí | `CONCERT`, `REHEARSAL`, etc. |
| `status` | `EventStatus` | Sí | `DRAFT`, `CONFIRMED`, `CANCELLED`, `COMPLETED` |
| `venueId` | `String?` | No | Lugar |
| `startTime`, `endTime` | `DateTime` | Sí/parcial | Horario |
| `description` | `String?` | No | Descripción |
| `isPublic` | `Boolean` | Sí | Público/privado |
| `daysheetNotes`, `itineraryNotes`, `setlistNotes` | `String?` | No | Producción |
| `riderAssetId` | `String?` | No | Asset del rider |
| `createdById` | `String` | Sí | Creador |
| `deletedAt` | `DateTime?` | No | Soft delete |

Relaciones:

- N:1 con `organizations`.
- N:1 opcional con `venues`.
- N:1 con `users` como creador.
- 1:N con roster, schedule, vehicles, assets, finance entries, per diem, assignments.
- 1:1 opcional con `event_finance`.

Queries por acción:

- Crear evento: inserta evento y roster del creador.
- Listar eventos: filtra por organizaciones del usuario, status, fechas, paginación.
- Ver detalle: incluye venue, organization, creator, roster.
- Confirmar/cancelar: actualiza `status` o `deletedAt`.
- Daysheet: carga evento + venue + roster + schedule + vehicles + finance + weather.

---

### 8.10 `event_roster`

Modelo Prisma: `EventRoster`

Tabla puente N:N entre eventos y usuarios.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `eventId` | `String` | Sí | Evento |
| `userId` | `String` | Sí | Participante |
| `role` | `String?` | No | Rol musical/técnico |
| `status` | `AttendanceStatus` | Sí | `INVITED`, `CONFIRMED`, `DECLINED`, `NO_SHOW` |
| `notes` | `String?` | No | Nota del admin |
| `invitedAt`, `respondedAt` | `DateTime` | Parcial | Ciclo de invitación |

Restricción:

- `@@unique([eventId, userId])`: un usuario solo aparece una vez por evento.

Uso:

- Invitar usuario al evento.
- Confirmar/declinar asistencia.
- Mostrar participantes en daysheet.
- Weather alerts usa esta tabla para saber qué eventos próximos importan al usuario.

---

### 8.11 `event_schedule_items`

Modelo Prisma: `EventScheduleItem`

Bloques horarios del evento.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `eventId` | `String` | Sí | Evento |
| `type` | `ScheduleType` | Sí | `DEPARTURE`, `LOAD_IN`, `SOUNDCHECK`, etc. |
| `title` | `String` | Sí | Título del bloque |
| `startTime`, `endTime` | `DateTime` | Sí/parcial | Horario |
| `location`, `withWho`, `notes` | `String?` | No | Detalle operativo |
| `isCompleted`, `completedAt` | `Boolean/DateTime?` | Sí/parcial | Tracking en vivo |

Uso:

- Admin crea/edita cronograma.
- Miembro puede marcar item como completado.
- Daysheet lista todo ordenado por `startTime`.

---

### 8.12 `event_vehicles`

Modelo Prisma: `EventVehicle`

Vehículos asignados a un evento.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `eventId` | `String` | Sí | Evento |
| `name` | `String` | Sí | Nombre del vehículo |
| `driverName`, `driverPhone`, `plateNumber`, `notes` | `String?` | No | Logística |
| `capacity` | `Int?` | No | Plazas |
| `originAddress`, `originLat`, `originLng` | `String?/Float?` | No | Salida |
| `routeDistanceKm`, `routeDurationMin`, `suggestedDepartureAt` | `Float?/Int?/DateTime?` | No | Resultado de ruta |

Relaciones:

- N:1 con `events`.
- 1:N con `vehicle_passengers`.
- 1:N con `vehicle_pickup_points`.

Uso:

- CRUD de vehículos.
- Calcular ruta vía OSRM.
- Guardar distancia/duración/salida sugerida.
- Redis cachea cálculos de ruta.

---

### 8.13 `vehicle_passengers`

Modelo Prisma: `VehiclePassenger`

Tabla puente entre vehículo y usuario.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `vehicleId` | `String` | Sí | Vehículo |
| `userId` | `String` | Sí | Pasajero |

Restricción:

- `@@unique([vehicleId, userId])`: no se puede añadir dos veces al mismo pasajero.

Uso:

- Antes de insertar, valida que el usuario sea miembro de la organización del evento.
- Se elimina físicamente al retirar pasajero.

---

### 8.14 `vehicle_pickup_points`

Modelo Prisma: `VehiclePickupPoint`

Paradas de recogida de un vehículo.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `vehicleId` | `String` | Sí | Vehículo |
| `time` | `DateTime` | Sí | Hora de recogida |
| `address` | `String` | Sí | Dirección |
| `lat`, `lng` | `Float?` | No | Coordenadas |
| `order` | `Int` | Sí | Orden de parada |
| `notes` | `String?` | No | Nota logística |

Uso:

- Crear, editar, borrar pickup.
- ConvoyService las usa como waypoints al calcular ruta.

---

### 8.15 `event_finance`

Modelo Prisma: `EventFinance`

Resumen financiero 1:1 del evento.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `eventId` | `String @unique` | Sí | Evento único |
| `cacheTotal` | `Decimal?` | No | Caché total |
| `perDiemAmount` | `Decimal?` | No | Viático estándar |
| `currency` | `String` | Sí | Default `EUR` |
| `isPaid`, `paidAt` | `Boolean/DateTime?` | Sí/parcial | Estado de pago |
| `paymentNotes`, `invoiceAssetId` | `String?` | No | Detalles |

Uso:

- `GET /events/:id/finance` busca por `eventId`.
- `PUT /events/:id/finance` hace `upsert`.
- Solo Admin/Owner puede editar.

---

### 8.16 `finance_categories`

Modelo Prisma: `FinanceCategory`

Categorías por organización para ingresos/gastos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `name` | `String` | Sí | Nombre |
| `type` | `EntryType` | Sí | `INCOME` o `EXPENSE` |
| `icon` | `String?` | No | Icono/emoji |

Restricción:

- `@@unique([orgId, name, type])`.

Uso:

- Crear/listar/borrar categorías.
- `finance_entries.categoryId` puede apuntar a una categoría.

---

### 8.17 `finance_entries`

Modelo Prisma: `FinanceEntry`

Movimientos financieros: ingresos o gastos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `eventId` | `String?` | No | Evento relacionado |
| `categoryId` | `String?` | No | Categoría |
| `type` | `EntryType` | Sí | `INCOME` o `EXPENSE` |
| `amount` | `Decimal` | Sí | Importe |
| `currency` | `String` | Sí | Default `EUR` |
| `description` | `String?` | No | Descripción |
| `proofAssetId` | `String?` | No | Recibo/factura en R2 |
| `status` | `ApprovalStatus` | Sí | `PENDING`, `APPROVED`, `REJECTED` |
| `date`, `paidAt` | `DateTime` | Sí/parcial | Fecha contable/pago |
| `createdById`, `approvedById` | `String/String?` | Sí/parcial | Usuario creador/aprobador |

Uso:

- Crear gasto/ingreso.
- Listar por org, evento, status, tipo.
- Aprobar/rechazar: actualiza status y genera notificación.
- Borrar físicamente entrada.

---

### 8.18 `per_diem_payouts`

Modelo Prisma: `PerDiemPayout`

Dietas/viáticos individuales.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `eventId` | `String?` | No | Evento |
| `userId` | `String` | Sí | Receptor |
| `amount` | `Decimal` | Sí | Importe |
| `currency` | `String` | Sí | Default `EUR` |
| `description` | `String?` | No | Descripción |
| `isPaid`, `paidAt` | `Boolean/DateTime?` | Sí/parcial | Pago |
| `createdById` | `String` | Sí | Creador |

Uso:

- Crear/listar viáticos.
- Marcar como pagado.
- Relaciona organización, evento opcional, usuario receptor y usuario creador.

---

### 8.19 `skill_categories`

Modelo Prisma: `SkillCategory`

Catálogo global de habilidades e instrumentos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `name` | `String @unique` | Sí | Nombre global |
| `type` | `SkillCategoryType` | Sí | `INSTRUMENT`, `TECHNICAL`, `MANAGEMENT` |
| `icon` | `String?` | No | Emoji |

Datos actuales normalizados a francés:

`Chant`, `Guitare`, `Basse`, `Piano`, `Batterie`, `Son`, `Éclairage`, `Production`, `Vidéo`.

Uso:

- Catálogo leído por todos los usuarios.
- Admin/Owner funcional puede crear/borrar según servicio.
- Relación N:N con usuarios vía `user_skills`.

---

### 8.20 `user_skills`

Modelo Prisma: `UserSkill`

Tabla puente entre usuario y categoría de habilidad.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `userId` | `String` | Sí | Usuario |
| `skillCategoryId` | `String` | Sí | Skill |
| `expertiseLevel` | `ExpertiseLevel` | Sí | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `PROFESSIONAL` |
| `yearsExp` | `Int?` | No | Años de experiencia |
| `createdAt` | `DateTime` | Sí | Auditoría |

Restricción:

- `@@unique([userId, skillCategoryId])`.

Uso:

- Perfil del músico.
- Búsqueda de usuarios por habilidad.

---

### 8.21 `instruments`

Modelo Prisma: `Instrument`

Inventario/backline de una organización.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `orgId` | `String` | Sí | Organización |
| `name`, `brand`, `model`, `serialNumber` | `String`/`String?` | Parcial | Identificación |
| `type` | `InstrumentType` | Sí | `BRASS`, `STRING`, `AUDIO_GEAR`, etc. |
| `status` | `InstrumentStatus` | Sí | `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED` |
| `notes`, `specAssetId` | `String?` | No | Nota/ficha técnica |
| `isActive` | `Boolean` | Sí | Activo |
| `createdById` | `String` | Sí | Creador |

Uso:

- CRUD de inventario.
- Retirar instrumento cambia `isActive=false` y `status=RETIRED`.
- Asignar instrumento crea `instrument_assignments` y cambia status.

---

### 8.22 `instrument_assignments`

Modelo Prisma: `InstrumentAssignment`

Historial de asignaciones de instrumentos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `instrumentId` | `String` | Sí | Instrumento |
| `userId` | `String?` | No | Usuario asignado |
| `eventId` | `String?` | No | Evento asociado |
| `assignedAt`, `returnedAt` | `DateTime` | Parcial | Ciclo de préstamo |
| `notes` | `String?` | No | Nota |

Uso:

- Asignar a usuario/evento.
- Devolver: marca `returnedAt` y cambia instrumento a `AVAILABLE`.
- Permite historial temporal.

---

### 8.23 `notifications`

Modelo Prisma: `Notification`

Notificaciones internas de la app.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `recipientId` | `String` | Sí | Usuario receptor |
| `type` | `NotificationType` | Sí | Tipo funcional |
| `title` | `String` | Sí | Texto en francés generado por backend |
| `body` | `String?` | No | Detalle |
| `sourceId` | `String?` | No | ID del objeto relacionado |
| `sourceType` | `String?` | No | `event`, `finance_entry`, `message`, etc. |
| `isRead`, `readAt` | `Boolean/DateTime?` | Sí/parcial | Lectura |
| `createdAt` | `DateTime` | Sí | Auditoría |

Tipos actuales:

`INVITE_ACCEPTED`, `INVITE_REJECTED`, `ORGANIZATION_INVITE`, `EVENT_ASSIGNED`, `EVENT_CONFIRMED`, `EVENT_CANCELLED`, `ROSTER_UPDATED`, `EXPENSE_APPROVED`, `EXPENSE_REJECTED`, `ROLE_CHANGED`, `DAYSHEET_UPDATED`, `INSTRUMENT_ASSIGNED`, `MESSAGE_RECEIVED`.

Uso:

- `NotificationsService.fire`: crea una notificación.
- `fireBulk`: crea varias.
- Listar: paginado + contador de no leídas.
- Marcar como leída: `isRead=true`, `readAt=now`.
- Borrar: delete físico si pertenece al usuario.

---

### 8.24 `messages`

Modelo Prisma: `Message`

Mensajería directa.

| Campo | Tipo | Requerido | Descripción |
|---|---|---:|---|
| `id` | `String @id` | Sí | ID interno |
| `senderId` | `String` | Sí | Remitente |
| `recipientId` | `String` | Sí | Destinatario |
| `orgId` | `String?` | No | Contexto opcional |
| `body` | `String` | Sí | Texto del mensaje |
| `isRead`, `readAt` | `Boolean/DateTime?` | Sí/parcial | Lectura |
| `createdAt` | `DateTime` | Sí | Envío |

Uso:

- Enviar mensaje: valida destinatario, crea `messages`, crea notificación `MESSAGE_RECEIVED`.
- Inbox: obtiene interlocutores únicos y último mensaje por interlocutor.
- Conversación: filtra mensajes donde `(sender=A AND recipient=B) OR (sender=B AND recipient=A)`.
- Marcar leído: solo destinatario puede marcar.

---

## 9. Enums

### 9.1 Roles y membresía

```ts
MemberRole = OWNER | ADMIN | MEMBER | EXTERNAL_TECH
```

Permisos generales:

| Rol | Uso |
|---|---|
| `OWNER` | Acceso total, puede transferir/remover miembros críticos |
| `ADMIN` | Gestión de miembros, eventos, finanzas |
| `MEMBER` | Músico estándar |
| `EXTERNAL_TECH` | Técnico externo con acceso limitado |

### 9.2 Eventos

```ts
EventType = CONCERT | REHEARSAL | AUDITION | TOUR_DATE | RECORDING_SESSION
EventStatus = DRAFT | CONFIRMED | CANCELLED | COMPLETED
AttendanceStatus = INVITED | CONFIRMED | DECLINED | NO_SHOW
```

### 9.3 Storage

```ts
AssetType = USER_AVATAR | USER_BANNER | ORG_BANNER | AUDIO_TRACK | MUSIC_SCORE |
            FINANCIAL_RECEIPT | TECHNICAL_FILE | REFERENCE_VIDEO | LEGAL_DOCUMENT

AssetStatus = PENDING | CONFIRMED | PROCESSING | READY | ARCHIVED | DELETED
```

### 9.4 Daysheet/logística

```ts
ScheduleType = DEPARTURE | ARRIVAL | LOAD_IN | SOUNDCHECK | DOORS_OPEN |
               CATERING_DINNER | SHOWTIME | LOAD_OUT | OTHER
```

### 9.5 Finanzas

```ts
EntryType = INCOME | EXPENSE
ApprovalStatus = PENDING | APPROVED | REJECTED
```

### 9.6 Skills e inventario

```ts
SkillCategoryType = INSTRUMENT | TECHNICAL | MANAGEMENT
ExpertiseLevel = BEGINNER | INTERMEDIATE | ADVANCED | PROFESSIONAL
InstrumentType = BRASS | WOODWIND | STRING | KEYBOARD | PERCUSSION | AUDIO_GEAR | LIGHTING | OTHER
InstrumentStatus = AVAILABLE | IN_USE | MAINTENANCE | RETIRED
```

---

## 10. Flujos por Acción de Usuario

### 10.1 Registro/Login

**Registro**

1. Frontend envía datos de registro.
2. `AuthService` obtiene token admin de Keycloak.
3. Crea usuario en Keycloak.
4. La fila local `users` se crea por lazy provisioning cuando el token se valida.

**Login**

1. Frontend envía email/password.
2. `AuthService` llama al endpoint token de Keycloak.
3. Devuelve access/refresh token.
4. En requests posteriores, `KeycloakJwtStrategy` valida JWT y busca/crea usuario local.

Tablas tocadas: `users` indirectamente al validar token.

---

### 10.2 Crear organización

1. Usuario autenticado pide crear org.
2. Backend genera slug y valida que no exista.
3. Crea `organizations`.
4. Crea `organization_members` con rol `OWNER`.

Tablas: `organizations`, `organization_members`.

Relación creada: usuario N:N organización vía `organization_members`.

---

### 10.3 Invitar a una organización

**Invitación nominal**

1. Admin/Owner envía email, rol, instrumento y mensaje.
2. Valida organización y permisos.
3. Evita duplicado pendiente por email.
4. Si el email ya existe, evita invitar a alguien que ya es miembro.
5. Crea `invitations`.
6. Envía email por Resend.
7. Si el usuario existe, crea `notifications`.

**Aceptar invitación**

1. Valida token/status/expiración.
2. Valida que el email del usuario coincida.
3. Transacción: crea `organization_members` + marca invitación `ACCEPTED`.
4. Notifica al invitador.

Tablas: `invitations`, `organization_members`, `notifications`, `users`, `organizations`.

---

### 10.4 Crear evento

1. Admin/Owner crea evento con org, horario y venue opcional.
2. Backend valida membresía.
3. Crea fila en `events`.
4. Añade al creador al `event_roster`.

Tablas: `events`, `event_roster`, `organization_members`, `venues` opcional.

---

### 10.5 Ver dashboard/daysheet de evento

1. Usuario pide `GET /events/:id/daysheet`.
2. Backend busca evento activo con venue/org/creador.
3. Verifica que el usuario sea miembro de la organización.
4. En paralelo carga:
   - `event_schedule_items`
   - `event_roster` + usuarios
   - `event_vehicles` + pasajeros + pickups
   - `event_finance` si Admin/Owner
   - clima del venue si tiene coordenadas
5. Devuelve todo en una sola respuesta.

Tablas: `events`, `venues`, `organization_members`, `event_schedule_items`, `event_roster`, `event_vehicles`, `vehicle_passengers`, `vehicle_pickup_points`, `event_finance`, `users`.

Redis: caché weather.

---

### 10.6 Cronograma del evento

1. Admin/Owner crea/edita/borra bloques.
2. Cualquier miembro puede marcar `isCompleted` para tracking operativo.
3. Daysheet consume la lista ordenada por `startTime`.

Tabla: `event_schedule_items`.

---

### 10.7 Logística y convoy

1. Admin/Owner crea vehículo.
2. Añade pasajeros validando membresía.
3. Añade puntos de recogida.
4. Pide cálculo de ruta.
5. Backend usa OSRM y guarda distancia/duración/salida sugerida en `event_vehicles`.
6. Redis cachea rutas para no recalcular.

Tablas: `event_vehicles`, `vehicle_passengers`, `vehicle_pickup_points`, `events`, `organization_members`.

Redis: caché de rutas.

---

### 10.8 Finanzas

**Categorías**

- Se crean por organización (`finance_categories`).
- Unicidad por `(orgId, name, type)`.

**Entradas**

1. Usuario crea ingreso/gasto.
2. Se guarda en `finance_entries` con status `PENDING`.
3. Admin/Owner aprueba o rechaza.
4. Backend actualiza status y crea notificación.

**Resumen de evento**

- `event_finance` es 1:1 con `events`.
- Se usa `upsert`: si no existe, se crea; si existe, se actualiza.

Tablas: `finance_categories`, `finance_entries`, `event_finance`, `per_diem_payouts`, `notifications`.

---

### 10.9 Repertorio y archivos musicales

1. Usuario crea canción en una organización.
2. Puede subir partituras o audio a R2.
3. `assets.songId` vincula el archivo con la canción.
4. Búsqueda por título/compositor/arreglista/género.

Tablas: `songs`, `assets`, `organizations`, `users`.

---

### 10.10 Storage / Cloudflare R2

El archivo físico no vive en PostgreSQL; vive en R2. PostgreSQL guarda metadata y seguridad.

**Subida**

1. Frontend solicita URL presignada.
2. Backend valida política de upload.
3. Crea asset `PENDING`.
4. Frontend sube a R2.
5. Frontend confirma.
6. Backend verifica con `HeadObject` y marca `CONFIRMED`.

**Descarga**

1. Backend valida acceso.
2. Si público, usa CDN.
3. Si privado, firma URL temporal.
4. Redis cachea URL no sensible 4 min.

Tablas: `assets`, más `users`, `organizations`, `songs`, `events` según contexto.

Redis: membresía y URLs firmadas.

---

### 10.11 Habilidades y búsqueda de músicos

1. Catálogo global vive en `skill_categories`.
2. Usuario añade habilidad creando `user_skills`.
3. Búsqueda puede filtrar por skill/city/org/q.
4. Perfil público incluye skills y organizaciones.

Tablas: `skill_categories`, `user_skills`, `users`, `organization_members`.

---

### 10.12 Inventario/backline

1. Admin/Owner crea instrumento.
2. Instrumento puede estar disponible, en uso, mantenimiento o retirado.
3. Asignar instrumento crea `instrument_assignments` y cambia status a `IN_USE`.
4. Devolver marca `returnedAt` y status `AVAILABLE`.
5. Retirar cambia `isActive=false` y status `RETIRED`.

Tablas: `instruments`, `instrument_assignments`, `users`, `events`, `organizations`.

---

### 10.13 Mensajes directos

1. Usuario envía mensaje a otro usuario.
2. Backend valida que no se envíe a sí mismo y que el destinatario exista.
3. Crea `messages`.
4. Crea notificación `MESSAGE_RECEIVED`.
5. Inbox agrupa interlocutores y calcula no leídos.
6. Conversación lista mensajes entre dos usuarios.

Tablas: `messages`, `notifications`, `users`.

---

### 10.14 Notificaciones

Las notificaciones se generan como efecto secundario de otras acciones:

| Acción | Tipo de notificación |
|---|---|
| Invitación aceptada | `INVITE_ACCEPTED` |
| Invitación rechazada | `INVITE_REJECTED` |
| Invitación recibida | `ORGANIZATION_INVITE` |
| Añadido a evento | `EVENT_ASSIGNED` |
| Gasto aprobado | `EXPENSE_APPROVED` |
| Gasto rechazado | `EXPENSE_REJECTED` |
| Cambio de rol | `ROLE_CHANGED` |
| Instrumento asignado | `INSTRUMENT_ASSIGNED` |
| Mensaje recibido | `MESSAGE_RECEIVED` |

Tabla: `notifications`.

---

### 10.15 Clima del dashboard y eventos

No hay tablas propias de clima. Todo se calcula al vuelo y se cachea en Redis.

**Dashboard**

1. Frontend pide `/weather/dashboard`.
2. Backend resuelve ubicación: GPS, `q`, o ciudad del perfil.
3. WeatherAPI devuelve clima actual + forecast del día.
4. Redis cachea.
5. Backend genera saludo/consejo en francés.

**Alertas de eventos**

1. Frontend pide `/weather/alerts`.
2. Backend busca en `event_roster` eventos próximos del usuario.
3. Incluye venue con coordenadas.
4. Consulta forecast del día del evento.
5. Devuelve solo alertas relevantes.

Tablas: `users`, `event_roster`, `events`, `venues`.

Redis: caché weather.

---

## 11. Índices y Restricciones Importantes

| Tabla | Restricción/índice | Motivo |
|---|---|---|
| `users` | `email @unique`, `keycloakId @unique` | Identidad única |
| `organizations` | `slug @unique` | URL única |
| `organization_members` | `unique(userId, organizationId)` | Evita doble membresía |
| `invite_links` | `token @unique` | Token público único |
| `invitations` | `token @unique`, índices por email/user | Resolución rápida de invitaciones |
| `assets` | `key @unique` | Una key R2 = un asset |
| `events` | índices `orgId`, `startTime`, `status`, `type` | Listados/filtrado |
| `event_roster` | `unique(eventId, userId)` | Evita duplicar participante |
| `event_schedule_items` | índice `(eventId, startTime)` | Ordenar daysheet |
| `vehicle_passengers` | `unique(vehicleId, userId)` | Evita duplicar pasajero |
| `event_finance` | `eventId @unique` | Relación 1:1 con evento |
| `finance_categories` | `unique(orgId, name, type)` | Evita duplicados por org |
| `user_skills` | `unique(userId, skillCategoryId)` | Evita skill duplicada |
| `notifications` | índices `(recipientId, isRead)` y `(recipientId, createdAt desc)` | Inbox rápido |
| `messages` | índices `(senderId, recipientId)` y `(recipientId, isRead)` | Conversaciones/no leídos |

---

## 12. Borrado: Cascade, Soft Delete y Delete Real

### 12.1 Cascade

Algunas relaciones usan `onDelete: Cascade`, por ejemplo:

- Borrar organización borra miembros, links, invitaciones, eventos dependientes según relaciones configuradas.
- Borrar evento borra roster, schedule, vehicles, finance.
- Borrar vehículo borra pasajeros y pickups.
- Borrar instrumento borra assignments.

### 12.2 Soft delete

Se usa cuando conviene conservar historial:

| Tabla | Campo |
|---|---|
| `organizations` | `deletedAt`, `isActive` |
| `events` | `deletedAt`, `status=CANCELLED` |
| `songs` | `deletedAt`, `isActive` |
| `assets` | `deletedAt`, `status=DELETED` |
| `instruments` | `isActive=false`, `status=RETIRED` |

### 12.3 Delete real

Se usa en entidades pequeñas o relaciónales:

- `vehicle_passengers`
- `vehicle_pickup_points`
- `event_schedule_items`
- `finance_categories`
- `finance_entries`
- `user_skills`
- `notifications`

---

## 13. Datos Externos y Fuentes de Verdad

| Dominio | Fuente de verdad | Tabla local |
|---|---|---|
| Autenticación | Keycloak | `users` guarda perfil local y `keycloakId` |
| Archivos físicos | Cloudflare R2 | `assets` guarda metadata y permisos |
| Emails | Resend | `invitations` guarda workflow local |
| Geocoding | BAN / Nominatim | `venues`, `event_vehicles`, pickups guardan coords |
| Rutas | OSRM | `event_vehicles` guarda resultado útil |
| Clima | WeatherAPI.com | No hay tabla; Redis cachea temporalmente |

---

## 14. Consultas SQL Equivalentes para Estudio

Prisma:

```ts
this.prisma.organizationMember.findUnique({
  where: { userId_organizationId: { userId, organizationId } },
});
```

SQL conceptual:

```sql
SELECT *
FROM organization_members
WHERE "userId" = $1 AND "organizationId" = $2
LIMIT 1;
```

Prisma:

```ts
this.prisma.event.findMany({
  where: { orgId: { in: orgIds }, deletedAt: null },
  include: { venue: true },
  orderBy: { startTime: 'asc' },
});
```

SQL conceptual:

```sql
SELECT e.*, v.*
FROM events e
LEFT JOIN venues v ON v.id = e."venueId"
WHERE e."orgId" = ANY($1)
  AND e."deletedAt" IS NULL
ORDER BY e."startTime" ASC;
```

Prisma:

```ts
this.prisma.$transaction([
  this.prisma.financeEntry.findMany({ where, skip, take }),
  this.prisma.financeEntry.count({ where }),
]);
```

SQL conceptual:

```sql
BEGIN;
SELECT * FROM finance_entries WHERE ... LIMIT $take OFFSET $skip;
SELECT COUNT(*) FROM finance_entries WHERE ...;
COMMIT;
```

Prisma:

```ts
this.prisma.eventFinance.upsert({
  where: { eventId },
  create: { eventId, ...dto },
  update: dto,
});
```

SQL conceptual:

```sql
INSERT INTO event_finance ("eventId", ...)
VALUES ($1, ...)
ON CONFLICT ("eventId")
DO UPDATE SET ...;
```

---

## 15. Cómo Pensar el Modelo por Módulo

| Módulo API | Tablas principales | Redis | Integraciones externas |
|---|---|---|---|
| Auth | `users` | No | Keycloak |
| Organizations | `organizations`, `organization_members`, `invite_links`, `invitations` | No | Resend para emails |
| Events | `events`, `venues`, `event_roster` | No | No directa |
| Daysheet | `events`, `schedule`, `vehicles`, `finance`, `roster` | Weather cache indirecto | WeatherAPI vía WeatherModule |
| Geo | `event_vehicles`, venues/pickups por coords | Sí | BAN, Nominatim, OSRM |
| Storage | `assets` | Sí | Cloudflare R2/CDN |
| Songs | `songs`, `assets` | No | R2 por assets |
| Finance | `finance_*`, `per_diem_payouts`, `notifications` | No | R2 si hay recibos |
| Skills | `skill_categories`, `user_skills`, `users` | No | No |
| Inventory | `instruments`, `instrument_assignments`, `notifications` | No | R2 si hay ficha técnica |
| Notifications | `notifications` | No | No push externo aún |
| Messages | `messages`, `notifications` | No | No |
| Weather | `users`, `event_roster`, `events`, `venues` | Sí | WeatherAPI.com |
| Health | N/A | Ping | PostgreSQL ping |

---

## 16. Migraciones

Prisma guarda el historial en `_prisma_migrations`.

Comandos:

```bash
# Desarrollo: crea/aplica migración
pnpm --filter @regieart/database prisma:migrate

# Producción/Railway/local deploy: aplica migraciones existentes
pnpm --filter @regieart/database prisma:migrate:prod

# Regenerar cliente Prisma
pnpm --filter @regieart/database prisma:generate

# Seed del catálogo global
pnpm --filter @regieart/database prisma:seed
```

Nota importante del repo: los scripts de Prisma cargan `.env` con `dotenv-cli`, porque Prisma CLI no carga automáticamente el `.env` raíz del monorepo.

---

## 17. Qué Debe Saber el Frontend

1. Todas las respuestas vienen envueltas como `{ success: true, data }`.
2. Errores vienen como `{ success: false, error: { code, message, details? } }`.
3. El backend controla permisos por `organization_members` y `event_roster`; no confiar solo en UI.
4. Para crear eventos con clima/rutas, el venue debe tener `latitude` y `longitude`.
5. Para archivos, el frontend sube directo a R2 usando URL firmada, luego confirma al backend.
6. Para notificaciones/mensajes, el estado leído está en `isRead`/`readAt`.
7. Para listados paginados, varios endpoints devuelven `items + total/page/limit` o estructuras equivalentes.
8. Muchos textos libres son datos de usuario; no deben traducirse automáticamente salvo vocabulario controlado.

---

## 18. Glosario Rápido

| Concepto | Significado en este backend |
|---|---|
| ORM | Prisma, capa TypeScript para consultar PostgreSQL |
| FK | Foreign Key, campo que apunta a otra tabla |
| N:N | Muchos a muchos, normalmente con tabla puente |
| 1:N | Uno a muchos, por ejemplo una organización tiene muchos eventos |
| 1:1 | Uno a uno, por ejemplo `events` ↔ `event_finance` |
| Soft delete | No se borra la fila; se marca como eliminada |
| Cascade | Si se borra el padre, se borran hijos relacionados |
| CUID | ID string generado automáticamente |
| Redis cache | Copia temporal para evitar cálculos/API calls repetidos |
| Redis lock | Llave temporal para que solo una instancia ejecute un job |
| R2 | Object Storage de Cloudflare donde viven los archivos reales |

---

## 19. Checklist Para Estudiar el Modelo

- [ ] Entender que `users` depende de Keycloak, pero el perfil local vive en PostgreSQL.
- [ ] Memorizar las 5 tablas puente: `organization_members`, `event_roster`, `vehicle_passengers`, `user_skills`, `instrument_assignments`.
- [ ] Ubicar `events` como centro operacional del sistema.
- [ ] Ubicar `assets` como puente semántico entre R2 y los módulos de negocio.
- [ ] Entender que Redis no guarda datos permanentes.
- [ ] Revisar dónde se usa `$transaction` para operaciones atómicas.
- [ ] Diferenciar soft delete vs delete real.
- [ ] Recordar que el clima no tiene tabla; se cachea en Redis.
