# RégieArt — API Backend

Plataforma de gestión integral para bandas y agencias artísticas: organizaciones, repertorio, eventos, logística del día del show, finanzas, inventario, notificaciones y mensajería directa.

---

## Índice

1. [Stack técnico](#1-stack-técnico)
2. [Levantar el entorno local](#2-levantar-el-entorno-local)
3. [Autenticación — Obtener el JWT](#3-autenticación--obtener-el-jwt)
4. [Casos de uso — todo lo que puede hacer un usuario](#4-casos-de-uso--todo-lo-que-puede-hacer-un-usuario)
5. [Convención de respuestas](#5-convención-de-respuestas)
6. [Límites globales](#6-límites-globales)
7. [Módulo: Users](#7-módulo-users)
8. [Módulo: Organizations](#8-módulo-organizations)
9. [Módulo: Songs — Repertorio](#9-módulo-songs--repertorio)
10. [Módulo: Venues](#10-módulo-venues)
11. [Módulo: Events + Roster](#11-módulo-events--roster)
12. [Módulo: DaySheet — Logística Operativa](#12-módulo-daysheet--logística-operativa)
13. [Módulo: Finance — Finanzas Granulares](#13-módulo-finance--finanzas-granulares)
14. [Módulo: Skills — Habilidades](#14-módulo-skills--habilidades)
15. [Módulo: Inventory — Backline](#15-módulo-inventory--backline)
16. [Módulo: Notifications](#16-módulo-notifications)
17. [Módulo: Messages — Mensajería Directa](#17-módulo-messages--mensajería-directa)
18. [Módulo: Storage — Archivos en R2](#18-módulo-storage--archivos-en-r2)
19. [Base de datos — Modelos y relaciones](#19-base-de-datos--modelos-y-relaciones)
20. [Correr los tests](#20-correr-los-tests)
21. [Variables de entorno](#21-variables-de-entorno)
22. [Migraciones aplicadas](#22-migraciones-aplicadas)
fddf
---

## 1. Stack técnico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | NestJS 10 |
| ORM | Prisma 5 |
| Base de datos | PostgreSQL 15 |
| Caché / Locks | Redis 7 |
| Auth | Keycloak 23 (JWT RS256) |
| Storage | Cloudflare R2 (protocolo S3) |
| Monorepo | pnpm workspaces |

---

## 2. Levantar el entorno local

### Requisitos

- Node.js ≥ 20, pnpm ≥ 8, Docker Desktop

### Pasos

```bash
# 1. Clonar e instalar dependencias
pnpm install

# 2. Levantar PostgreSQL, Redis y Keycloak
docker-compose up -d

# 3. Copiar y editar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Cloudflare R2

# 4. Aplicar migraciones
pnpm db:migrate

# 5. Arrancar el servidor (puerto 3005)
pnpm dev:api
```

La API queda disponible en: `http://localhost:3005/api/v1`

### Contenedores Docker

| Contenedor | Puerto | Descripción |
|---|---|---|
| `regieart-postgres` | `5433` | PostgreSQL 15 |
| `regieart-redis` | `6379` | Redis 7 |
| `regieart-keycloak` | `8090` | Keycloak 23 |

---

## 3. Autenticación — Obtener el JWT

Todos los endpoints (excepto `/health`) requieren un `Bearer` token de Keycloak.

### Credenciales de desarrollo local

| Campo | Valor |
|---|---|
| **Usuario** | `teststorage@gmail.com` |
| **Contraseña** | `teststorage@gmail.com` |
| **Client ID** | `regieart-mobile` |
| **Realm** | `regieart` |
| **Keycloak URL local** | `http://localhost:8090` |
| **Keycloak URL producción** | `https://keycloak-production-b2ce.up.railway.app` |

### Obtener token — JavaScript

```javascript
async function getToken() {
  const res = await fetch(
    'http://localhost:8090/realms/regieart/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id:  'regieart-mobile',
        username:   'usuario@ejemplo.com',
        password:   'contraseña',
      }),
    }
  );
  const { access_token } = await res.json();
  return access_token; // JWT válido ~5 minutos
}

// Usar en cada petición
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
```

---

## 4. Casos de uso — todo lo que puede hacer un usuario

### Perfil personal
- Crear cuenta (primer login → el backend la crea automáticamente desde Keycloak)
- Ver y editar su perfil: nombre artístico, nombre real, teléfono, bio, ciudad, país
- Subir y cambiar foto de perfil (avatar) o banner personal
- Agregar sus habilidades musicales: "Trompeta — Profesional, 15 años"
- Eliminar habilidades
- Ver el perfil público de cualquier otro músico (sin email ni teléfono)
- Buscar músicos por habilidad, ciudad u organización

### Organizaciones (Bandas / Agencias)
- Crear una banda u organización (el creador queda como OWNER)
- Ver la lista de todas sus organizaciones
- Ver el detalle de una organización: nombre, descripción, miembros con avatares y roles
- Editar la información de la organización (ADMIN+)
- Subir el logo o banner de la organización (Storage)
- Generar un link de invitación para un nuevo músico (ADMIN+)
- Configurar el rol que tendrá quien acepte el link: MEMBER, ADMIN, EXTERNAL_TECH
- Establecer una fecha de expiración para el link (default 7 días)
- Listar todos los links de invitación activos (ADMIN+)
- Revocar un link antes de que sea usado (ADMIN+)
- Aceptar una invitación usando el token del link
- Ver la lista de miembros con sus roles y avatares
- Cambiar el rol de un miembro (ADMIN+ no puede cambiar OWNER)
- Expulsar a un miembro de la organización (ADMIN+)
- Abandonar voluntariamente una organización
- Eliminar (soft-delete) la organización (OWNER)

### Repertorio (Songs)
- Crear una canción en el repertorio de la banda: título, compositor, arreglista, género, tonalidad, BPM
- Listar el repertorio completo de la banda con filtros por género o búsqueda de texto
- Ver el detalle de una canción con todas sus partituras y pistas de audio vinculadas
- Actualizar los metadatos de una canción (ADMIN+)
- Subir la partitura PDF de una canción y vincularla automáticamente
- Subir la pista de referencia en MP3/WAV y vincularla automáticamente
- Archivar (soft-delete) una canción que ya no se toca

### Salas / Venues
- Crear un venue con nombre, dirección, ciudad, aforo, contacto técnico
- Agregar coordenadas GPS (lat/lng) para el mapa y el pronóstico del clima
- Agregar notas de parking ("3 plazas reservadas — código barrera 1234")
- Agregar notas de acceso para carga ("Muelle trasero, ascensor hasta las 18:00")
- Agregar teléfono directo del técnico de sala
- Indicar la zona horaria del venue (para eventos internacionales)
- Buscar venues por ciudad
- Editar la información de un venue (solo el creador)

### Eventos
- Crear un evento: Concierto, Ensayo, Audición, Fecha de gira, Sesión de grabación
- Vincular el evento a una sala (hereda sus datos técnicos, coords y notas)
- Cambiar el estado del evento: DRAFT → CONFIRMED → COMPLETED / CANCELLED
- Listar los eventos de la banda con filtros por tipo, estado y rango de fechas
- Ver el detalle completo de un evento con venue, roster y assets
- Editar el título, tipo, fechas, venue y descripción
- Actualizar las notas del Day Sheet y el itinerario de viaje (texto libre)
- Agregar notas del setlist planeado
- Invitar músicos al roster con su rol ("Trompeta", "Director Musical", "Técnico FOH")
- Ver la lista de participantes con su estado de confirmación
- Confirmar o declinar la asistencia a un evento (el propio músico)
- Cambiar el rol de un músico en el roster (ADMIN+)
- Remover a un músico del roster (ADMIN+)
- Subir el rider técnico PDF y vincularlo al evento
- Subir videos de referencia del escenario
- Subir recibos de gastos del evento
- Cancelar (soft-delete) un evento

### DaySheet — Logística del día del show
- Ver toda la información del día en una sola pantalla: evento, venue, cronograma, roster, vehículos, finanzas y clima (endpoint maestro)
- Crear el cronograma del día: Salida 14:00 → Llegada → Carga → Balance → Cena → Show → Recogida
- Asignar una hora de inicio/fin, lugar y responsable a cada ítem del cronograma
- Ver el pronóstico meteorológico para el día y lugar del evento
- El día del show: marcar ítems del cronograma como completados desde el móvil en tiempo real
- Crear vehículos del convoy: furgoneta de backline, coche del director
- Asignar músicos a cada vehículo
- Definir los puntos y horarios de recogida con dirección y coordenadas GPS
- Reordenar las paradas de la ruta
- Registrar el caché total del evento y la dieta estándar por músico
- Marcar el evento como pagado (registra el timestamp automáticamente)
- Vincular la factura o contrato PDF al registro financiero del evento

### Finanzas granulares
- Crear categorías de gastos/ingresos para la banda ("Transporte", "Alojamiento", "Caché")
- Registrar gastos e ingresos individuales con comprobante fotográfico en R2
- Vincular un gasto a un evento específico
- Filtrar gastos por tipo, estado, evento y rango de fechas
- Aprobar un gasto (ADMIN+) → notifica automáticamente al autor
- Rechazar un gasto con motivo (ADMIN+) → notifica automáticamente al autor
- Ver el reporte financiero de la banda: total ingresos, total gastos, balance, desglose por categoría
- Crear pagos de viáticos (per diem) por músico y evento
- Marcar viáticos como pagados con timestamp

### Habilidades y búsqueda de músicos
- Crear categorías de habilidades globales: "Trompeta", "Técnico de Audio FOH", "Director Musical"
- Agregar habilidades a su perfil con nivel de experiencia (BEGINNER → PROFESSIONAL) y años
- Buscar músicos por habilidad, ciudad o banda
- Ver el perfil público de cualquier músico (habilidades, bio, ciudad, bandas)

### Inventario y Backline
- Crear el inventario de instrumentos y equipos de la banda
- Registrar marca, modelo, número de serie y tipo de cada pieza
- Asignar un instrumento a un músico para un evento específico → notifica al músico
- Ver el estado de cada instrumento: AVAILABLE / IN_USE / MAINTENANCE / RETIRED
- Registrar la devolución de un instrumento
- Ver la lista de equipaje para un evento (todos los instrumentos asignados a ese show)
- Marcar un instrumento como retirado (RETIRED) cuando ya no se usa
- Vincular la ficha técnica PDF de un instrumento (ej: patch de consola)

### Notificaciones
- Recibir notificaciones automáticas cuando:
  - Alguien acepta tu invitación a la banda
  - Te añaden al roster de un evento
  - Un evento es confirmado o cancelado
  - Tu gasto es aprobado o rechazado
  - Tu rol en la banda cambia
  - Te asignan un instrumento
  - Recibes un mensaje directo
- Ver todas las notificaciones con filtro de leídas/no leídas
- Marcar una notificación como leída
- Marcar todas las notificaciones como leídas de un golpe
- Eliminar una notificación

### Mensajería directa
- Enviar un mensaje directo a cualquier usuario registrado
- Ver la lista de conversaciones con el último mensaje y el contador de no leídos
- Abrir una conversación y ver el historial de mensajes (paginado)
- Al abrir una conversación, los mensajes se marcan como leídos automáticamente
- Marcar un mensaje específico como leído

### Storage — Archivos en R2
- Subir cualquier tipo de archivo al sistema (partitura, pista, foto, video, rider, recibo)
- El archivo nunca pasa por el servidor: el frontend sube directamente a Cloudflare R2
- Confirmar la subida para que el asset quede activo en el sistema
- Descargar un archivo por su ID (URL firmada válida 5 minutos, cacheada en Redis)
- Buscar archivos con filtros: tipo, organización, canción, evento, etiquetas, texto
- Editar los metadatos de un archivo: nombre visible, descripción, etiquetas
- Eliminar un archivo (soft-delete en DB + borrado real en R2)
- Subir archivos grandes (>50 MB) con protocolo multipart (videos, audios HD)

---

## 5. Convención de respuestas

### Éxito

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Song not found"
  }
}
```

### Códigos HTTP

| Código | Significado |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Bad Request — validación de DTO fallida |
| `401` | Unauthorized — sin token o expirado |
| `403` | Forbidden — sin permisos suficientes |
| `404` | Not Found |
| `409` | Conflict — recurso duplicado |
| `429` | Too Many Requests |

---

## 6. Límites globales

| Límite | Valor |
|---|---|
| Rate limit global | 60 req/min por IP |
| Rate limit presigned-upload | 10 req/min por usuario |
| Rate limit multipart/initiate | 5 req/min por usuario |
| URL firmada de descarga | válida 5 minutos |
| Caché Redis para URLs de descarga | 4 minutos |
| Caché Redis clima (día del evento) | 30 minutos |
| Caché Redis clima (>7 días) | 12 horas |

---

## 7. Módulo: Users

**Base:** `/api/v1/users`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/users/me` | JWT | Perfil completo + membresías |
| `PATCH` | `/users/me` | JWT | Editar perfil |
| `GET` | `/users/me/profile-urls` | JWT | Avatar y banner propios |
| `GET` | `/users/me/skills` | JWT | Mis habilidades |
| `POST` | `/users/me/skills` | JWT | Agregar habilidad |
| `DELETE` | `/users/me/skills/:skillId` | JWT | Eliminar habilidad |
| `GET` | `/users/search` | JWT | Buscar músicos |
| `GET` | `/users/:id` | JWT | Perfil público de cualquier usuario |
| `GET` | `/users/:id/skills` | JWT | Habilidades de un usuario |
| `GET` | `/users/:id/profile-urls` | JWT | Avatar y banner de cualquier usuario |

### `PATCH /users/me` — Body

```json
{
  "displayName": "Nombre Artístico",
  "firstName": "Nombre",
  "lastName": "Apellido",
  "phone": "+1-514-000-0000",
  "bio": "Trompetista y director musical.",
  "city": "Montréal",
  "country": "CA"
}
```

### `GET /users/search` — Query params

| Param | Tipo | Descripción |
|---|---|---|
| `skill` | string | Nombre de habilidad (búsqueda parcial) |
| `city` | string | Ciudad (búsqueda parcial) |
| `orgId` | string | Solo miembros de esa organización |
| `q` | string | Búsqueda libre en displayName |
| `page` | number | Default: 1 |
| `limit` | number | Default: 20 |

> El perfil público (`GET /users/:id`) **no expone** email ni teléfono.

---

## 8. Módulo: Organizations

**Base:** `/api/v1/organizations`

### Roles

| Rol | Permisos |
|---|---|
| `OWNER` | Todo — incluyendo eliminar la org |
| `ADMIN` | Editar org, gestionar miembros e invite links |
| `MEMBER` | Leer contenido, confirmar/declinar eventos |
| `EXTERNAL_TECH` | Acceso técnico limitado |

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/organizations` | JWT | Crear organización |
| `GET` | `/organizations` | JWT | Mis organizaciones |
| `GET` | `/organizations/:id` | MEMBER | Detalle + miembros |
| `PATCH` | `/organizations/:id` | ADMIN | Editar info |
| `DELETE` | `/organizations/:id` | OWNER | Soft-delete |
| `GET` | `/organizations/:id/members` | MEMBER | Lista de miembros con roles y avatares |
| `PATCH` | `/organizations/:orgId/members/:memberId/role` | ADMIN | Cambiar rol |
| `DELETE` | `/organizations/:orgId/members/:userId` | ADMIN o el propio usuario | Expulsar o salir |
| `POST` | `/organizations/:id/invite-links` | ADMIN | Crear link de invitación |
| `GET` | `/organizations/:id/invite-links` | ADMIN | Links activos |
| `DELETE` | `/organizations/:id/invite-links/:linkId` | ADMIN | Revocar link |
| `POST` | `/organizations/join/:token` | JWT | Unirse con token |

### `POST /organizations/:id/invite-links` — Body

```json
{
  "role": "MEMBER",
  "expiresAt": "2026-07-28T23:59:59.000Z"
}
```

> Si `expiresAt` no se envía, expira en **7 días** por defecto.

---

## 9. Módulo: Songs — Repertorio

**Base:** `/api/v1/songs`

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/songs` | ADMIN | Crear canción |
| `GET` | `/songs` | MEMBER | Listar con filtros |
| `GET` | `/songs/:id` | MEMBER | Detalle + assets vinculados |
| `PATCH` | `/songs/:id` | ADMIN | Editar metadatos |
| `DELETE` | `/songs/:id` | ADMIN | Soft-delete |

### `POST /songs` — Body

```json
{
  "orgId": "cmr...",
  "title": "Le Petit Pêcheur",
  "composer": "Félix Leclerc",
  "arranger": "Jean Dupont",
  "genre": "Chanson québécoise",
  "musicalKey": "Do mayor",
  "tempo": 120,
  "durationSeconds": 210,
  "notes": "Arranque suave, crescendo en el puente."
}
```

### `GET /songs` — Query params

| Param | Descripción |
|---|---|
| `orgId` | **Recomendado.** Filtra por banda |
| `search` | Busca en title, composer, arranger |
| `genre` | Filtro exacto de género |
| `page` / `limit` | Paginación (default: 1 / 20) |

---

## 10. Módulo: Venues

**Base:** `/api/v1/venues`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/venues` | JWT | Crear venue |
| `GET` | `/venues` | JWT | Listar (filtrar por `?city=`) |
| `GET` | `/venues/:id` | JWT | Detalle |
| `PATCH` | `/venues/:id` | JWT (creador) | Editar |

### `POST /venues` — Body

```json
{
  "name": "Salle Wilfrid-Pelletier",
  "address": "175 Rue Sainte-Catherine O",
  "city": "Montréal",
  "country": "CA",
  "capacity": 2982,
  "latitude": 45.508888,
  "longitude": -73.561668,
  "parkingNotes": "3 plazas reservadas detrás — código barrera 1234",
  "loadInNotes": "Muelle trasero, ascensor disponible hasta las 18:00",
  "technicalContactName": "Jean-Michel Legrand",
  "technicalContactPhone": "+1-514-842-2112",
  "technicalContactEmail": "jm.legrand@placedesarts.com",
  "timezone": "America/Toronto"
}
```

> `latitude` y `longitude` son necesarios para el pronóstico meteorológico.

---

## 11. Módulo: Events + Roster

**Base:** `/api/v1/events`

### Enums

| `EventType` | Descripción |
|---|---|
| `CONCERT` | Concierto público |
| `REHEARSAL` | Ensayo |
| `AUDITION` | Audición |
| `TOUR_DATE` | Fecha de gira |
| `RECORDING_SESSION` | Sesión de grabación |

| `EventStatus` | Descripción |
|---|---|
| `DRAFT` | Borrador (default) |
| `CONFIRMED` | Confirmado |
| `CANCELLED` | Cancelado |
| `COMPLETED` | Realizado |

| `AttendanceStatus` | Descripción |
|---|---|
| `INVITED` | Invitado (default) |
| `CONFIRMED` | Confirmó asistencia |
| `DECLINED` | Declinó |
| `NO_SHOW` | No se presentó |

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/events` | ADMIN | Crear evento |
| `GET` | `/events` | MEMBER | Listar con filtros |
| `GET` | `/events/:id` | MEMBER | Detalle + venue + roster + assets |
| `PATCH` | `/events/:id` | ADMIN | Editar |
| `PATCH` | `/events/:id/daysheet` | ADMIN | Actualizar notas de producción e itinerario |
| `DELETE` | `/events/:id` | ADMIN | Soft-delete + CANCELLED |
| `GET` | `/events/:id/roster` | MEMBER | Lista de participantes |
| `POST` | `/events/:id/roster` | ADMIN | Invitar músico |
| `PATCH` | `/events/:id/roster/:userId` | ADMIN o el propio usuario | Actualizar estado o rol |
| `DELETE` | `/events/:id/roster/:userId` | ADMIN | Remover del roster |

### `POST /events` — Body

```json
{
  "orgId": "cmr...",
  "title": "Concierto de Verano 2026",
  "type": "CONCERT",
  "startTime": "2026-08-15T20:00:00.000Z",
  "endTime": "2026-08-15T23:30:00.000Z",
  "venueId": "cmr...",
  "description": "Gran concierto de temporada",
  "isPublic": true,
  "setlistNotes": "1. La Bamba 2. Le Petit Pêcheur 3. ...",
  "daysheetNotes": "Soundcheck 17:00. PA: L-Acoustics K2.",
  "itineraryNotes": "Bus sale del local a las 14:00."
}
```

### `GET /events` — Query params

| Param | Descripción |
|---|---|
| `orgId` | Filtrar por banda |
| `type` | `CONCERT`, `REHEARSAL`, etc. |
| `status` | `DRAFT`, `CONFIRMED`, etc. |
| `from` / `to` | Rango de fechas ISO 8601 |
| `page` / `limit` | Default: 1 / 20 |

---

## 12. Módulo: DaySheet — Logística Operativa

**Base:** `/api/v1/events`

### Endpoint maestro — carga completa de la pantalla de evento

```
GET /events/:id/daysheet
```

Devuelve en **una sola llamada**:

```json
{
  "event":    { "id", "title", "type", "status", "startTime", "daysheetNotes", "itineraryNotes", "setlistNotes", ... },
  "venue":    { "name", "address", "latitude", "longitude", "parkingNotes", "loadInNotes", "technicalContactPhone", ... },
  "schedule": [ { "type", "title", "startTime", "endTime", "location", "withWho", "isCompleted" } ],
  "roster":   [ { "user": { "displayName", "avatarUrl", "phone" }, "role", "status" } ],
  "vehicles": [ { "name", "driverName", "plateNumber", "passengers": [...], "pickups": [...] } ],
  "finance":  { "cacheTotal", "perDiemAmount", "currency", "isPaid", "paidAt" },
  "weather":  { "conditionText", "maxTempC", "minTempC", "chanceOfRain", "sunrise", "sunset" },
  "meta":     { "totalScheduleItems", "completedItems", "confirmedAttendees", "totalVehicles", "isAdminView" }
}
```

> `finance` solo visible para ADMIN/OWNER. `weather` es `null` si no hay API key o el venue no tiene coordenadas.

### Clima

```
GET /events/:id/weather
```

### Cronograma — `ScheduleType`

| Valor | Descripción |
|---|---|
| `DEPARTURE` | Salida / Viaje |
| `ARRIVAL` | Llegada al recinto |
| `LOAD_IN` | Carga y descarga de equipos |
| `SOUNDCHECK` | Prueba de sonido / Balance |
| `DOORS_OPEN` | Apertura de puertas al público |
| `CATERING_DINNER` | Comida / Cena |
| `SHOWTIME` | Actuación |
| `LOAD_OUT` | Recogida de material |
| `OTHER` | Ítem personalizado |

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/events/:id/schedule` | ADMIN | Crear ítem |
| `GET` | `/events/:id/schedule` | MEMBER | Listar (ordenado por startTime) |
| `PATCH` | `/events/:id/schedule/:itemId` | ADMIN | Editar |
| `PATCH` | `/events/:id/schedule/:itemId/complete` | MEMBER | Toggle completado (tracking en vivo) |
| `DELETE` | `/events/:id/schedule/:itemId` | ADMIN | Eliminar |

### `POST /events/:id/schedule` — Body

```json
{
  "type": "SOUNDCHECK",
  "title": "Balance audio y monitores de vientos",
  "startTime": "2026-08-15T17:00:00.000Z",
  "endTime": "2026-08-15T18:30:00.000Z",
  "location": "Escenario Principal",
  "withWho": "Con FOH Jean Dupont",
  "notes": "Probar primero la sección de vientos"
}
```

### Logística de transporte

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/events/:id/vehicles` | ADMIN | Crear vehículo |
| `GET` | `/events/:id/vehicles` | MEMBER | Listar (con pasajeros y pickups) |
| `PATCH` | `/events/:id/vehicles/:vehicleId` | ADMIN | Editar |
| `DELETE` | `/events/:id/vehicles/:vehicleId` | ADMIN | Eliminar |
| `POST` | `/events/:id/vehicles/:vehicleId/passengers` | ADMIN | Agregar pasajero |
| `DELETE` | `/events/:id/vehicles/:vehicleId/passengers/:userId` | ADMIN | Remover pasajero |
| `POST` | `/events/:id/vehicles/:vehicleId/pickups` | ADMIN | Agregar punto de recogida |
| `PATCH` | `/events/:id/vehicles/:vehicleId/pickups/:pickupId` | ADMIN | Editar pickup |
| `DELETE` | `/events/:id/vehicles/:vehicleId/pickups/:pickupId` | ADMIN | Eliminar pickup |

### `POST /events/:id/vehicles` — Body

```json
{
  "name": "Furgoneta Backline",
  "driverName": "Carlos Martínez",
  "driverPhone": "+1-514-555-0200",
  "plateNumber": "QC-123-ABC",
  "capacity": 6,
  "notes": "Lleva batería, amplificadores y monitor"
}
```

### `POST .../pickups` — Body

```json
{
  "time": "2026-08-15T13:00:00.000Z",
  "address": "Casa de Carlos — Rue Saint-Denis 45",
  "lat": 45.520,
  "lng": -73.570,
  "order": 0,
  "notes": "Estar en la puerta con el instrumento listo"
}
```

### Finanzas del evento (resumen 1:1)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `GET` | `/events/:id/finance` | MEMBER | Ver resumen financiero |
| `PUT` | `/events/:id/finance` | ADMIN | Crear o actualizar (upsert) |

### `PUT /events/:id/finance` — Body

```json
{
  "cacheTotal": "5000.00",
  "perDiemAmount": "50.00",
  "currency": "CAD",
  "isPaid": false,
  "paymentNotes": "50% transferencia previa, 50% en mano al terminar",
  "invoiceAssetId": "cmr..."
}
```

---

## 13. Módulo: Finance — Finanzas Granulares

**Base:** `/api/v1/finance`

### Categorías

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/finance/categories` | ADMIN | Crear categoría |
| `GET` | `/finance/categories?orgId=` | MEMBER | Listar categorías de la banda |
| `DELETE` | `/finance/categories/:id` | ADMIN | Eliminar categoría |

### `POST /finance/categories` — Body

```json
{
  "orgId": "cmr...",
  "name": "Transporte",
  "type": "EXPENSE",
  "icon": "🚌"
}
```

> `type`: `INCOME` o `EXPENSE`

### Entradas (Gastos / Ingresos)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/finance/entries` | MEMBER | Registrar gasto/ingreso |
| `GET` | `/finance/entries` | MEMBER | Listar con filtros |
| `GET` | `/finance/entries/:id` | MEMBER | Detalle |
| `PATCH` | `/finance/entries/:id` | El autor o ADMIN | Editar |
| `DELETE` | `/finance/entries/:id` | El autor o ADMIN | Eliminar |
| `PATCH` | `/finance/entries/:id/approve` | ADMIN | Aprobar → notifica al autor |
| `PATCH` | `/finance/entries/:id/reject` | ADMIN | Rechazar → notifica al autor |

### `POST /finance/entries` — Body

```json
{
  "orgId": "cmr...",
  "eventId": "cmr...",
  "categoryId": "cmr...",
  "type": "EXPENSE",
  "amount": "150.00",
  "currency": "CAD",
  "description": "Alquiler de furgoneta para el show",
  "proofAssetId": "cmr...",
  "date": "2026-08-15"
}
```

### `GET /finance/entries` — Query params

| Param | Descripción |
|---|---|
| `orgId` | Filtrar por banda |
| `eventId` | Filtrar por evento |
| `type` | `INCOME` o `EXPENSE` |
| `status` | `PENDING`, `APPROVED`, `REJECTED` |
| `from` / `to` | Rango de fechas ISO 8601 |
| `page` / `limit` | Default: 1 / 20 |

### Per Diem (Viáticos)

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/finance/per-diem` | ADMIN | Crear pago de viático |
| `GET` | `/finance/per-diem?orgId=&eventId=` | MEMBER | Listar |
| `PATCH` | `/finance/per-diem/:id/mark-paid` | ADMIN | Marcar como pagado |

### Reporte

```
GET /finance/reports?orgId=cmr...&from=2026-01-01&to=2026-12-31
```

Respuesta:
```json
{
  "period": { "from": "2026-01-01", "to": "2026-12-31" },
  "summary": {
    "totalIncome": 5000.00,
    "totalExpense": 180.00,
    "balance": 4820.00
  },
  "byCategory": [
    { "name": "Transporte", "type": "EXPENSE", "total": 180.00, "count": 2 }
  ]
}
```

> Solo incluye entradas con `status: APPROVED`.

---

## 14. Módulo: Skills — Habilidades

**Base:** `/api/v1/skill-categories` y `/api/v1/users`

### Categorías de habilidades (catálogo global)

| `SkillCategoryType` | Descripción |
|---|---|
| `INSTRUMENT` | Instrumento musical |
| `TECHNICAL` | Rol técnico (FOH, monitor, luz) |
| `MANAGEMENT` | Gestión (director, tour manager) |

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/skill-categories` | JWT | Listar todas las categorías |
| `POST` | `/skill-categories` | JWT | Crear categoría |
| `DELETE` | `/skill-categories/:id` | JWT | Eliminar categoría |

### Habilidades por usuario

| `ExpertiseLevel` | Descripción |
|---|---|
| `BEGINNER` | Principiante |
| `INTERMEDIATE` | Intermedio |
| `ADVANCED` | Avanzado |
| `PROFESSIONAL` | Profesional |

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/users/me/skills` | JWT | Mis habilidades |
| `POST` | `/users/me/skills` | JWT | Agregar habilidad |
| `DELETE` | `/users/me/skills/:skillId` | JWT | Eliminar habilidad |
| `GET` | `/users/:id/skills` | JWT | Habilidades de cualquier usuario |

### `POST /users/me/skills` — Body

```json
{
  "skillCategoryId": "cmr...",
  "expertiseLevel": "PROFESSIONAL",
  "yearsExp": 15
}
```

### Búsqueda de músicos

```
GET /users/search?skill=Trompeta&city=Montréal&page=1&limit=20
```

La respuesta incluye `id, displayName, avatarUrl, city, country, bio, skills` — **sin email ni teléfono**.

---

## 15. Módulo: Inventory — Backline

**Base:** `/api/v1/instruments`

### Enums

| `InstrumentType` | | `InstrumentStatus` | |
|---|---|---|---|
| `BRASS` | Metales | `AVAILABLE` | Disponible |
| `WOODWIND` | Maderas | `IN_USE` | Asignado |
| `STRING` | Cuerdas | `MAINTENANCE` | En reparación |
| `KEYBOARD` | Teclados | `RETIRED` | Retirado |
| `PERCUSSION` | Percusión | | |
| `AUDIO_GEAR` | Equipos de audio | | |
| `LIGHTING` | Iluminación | | |
| `OTHER` | Otro | | |

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/instruments` | ADMIN | Crear instrumento |
| `GET` | `/instruments?orgId=` | MEMBER | Listar inventario |
| `GET` | `/instruments/assignments` | MEMBER | Lista de equipaje para un evento |
| `GET` | `/instruments/:id` | MEMBER | Detalle + historial de asignaciones |
| `PATCH` | `/instruments/:id` | ADMIN | Editar |
| `PATCH` | `/instruments/:id/retire` | ADMIN | Retirar (RETIRED) |
| `POST` | `/instruments/:id/assign` | ADMIN | Asignar → notifica al músico |
| `PATCH` | `/instruments/:id/return` | ADMIN | Registrar devolución |

### `POST /instruments` — Body

```json
{
  "orgId": "cmr...",
  "name": "Trompeta Bach Stradivarius",
  "type": "BRASS",
  "brand": "Bach",
  "model": "Stradivarius 37",
  "serialNumber": "BS-2026-001",
  "notes": "Instrumento principal del director"
}
```

### `POST /instruments/:id/assign` — Body

```json
{
  "userId": "cmr...",
  "eventId": "cmr...",
  "notes": "Para el concierto de septiembre"
}
```

### `GET /instruments/assignments` — Query params

| Param | Descripción |
|---|---|
| `orgId` | Filtrar por banda |
| `eventId` | Lista de equipaje para un show específico |

---

## 16. Módulo: Notifications

**Base:** `/api/v1/notifications`

Las notificaciones se crean **automáticamente** en el backend cuando ocurren estos eventos:

| Tipo | Disparado por |
|---|---|
| `INVITE_ACCEPTED` | Alguien usa tu link de invitación |
| `EVENT_ASSIGNED` | Te añaden al roster de un evento |
| `ROLE_CHANGED` | Tu rol en la banda cambia |
| `EXPENSE_APPROVED` | Un admin aprueba tu gasto |
| `EXPENSE_REJECTED` | Un admin rechaza tu gasto |
| `INSTRUMENT_ASSIGNED` | Te asignan un instrumento |
| `MESSAGE_RECEIVED` | Recibes un mensaje directo |

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/notifications` | JWT | Mis notificaciones |
| `PATCH` | `/notifications/read-all` | JWT | Marcar todas como leídas |
| `PATCH` | `/notifications/:id/read` | JWT | Marcar una como leída |
| `DELETE` | `/notifications/:id` | JWT | Eliminar |

### `GET /notifications` — Query params

| Param | Descripción |
|---|---|
| `isRead` | `true` o `false` |
| `page` / `limit` | Default: 1 / 20 |

Respuesta incluye `unreadCount` para mostrar el badge en la app.

---

## 17. Módulo: Messages — Mensajería Directa

**Base:** `/api/v1/messages`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/messages` | JWT | Enviar mensaje |
| `GET` | `/messages/conversations` | JWT | Lista de conversaciones |
| `GET` | `/messages/conversations/:userId` | JWT | Historial con un usuario |
| `PATCH` | `/messages/:id/read` | JWT | Marcar como leído |

### `POST /messages` — Body

```json
{
  "recipientId": "cmr...",
  "body": "Hola, ¿puedes llegar 30 minutos antes del soundcheck?",
  "orgId": "cmr..."
}
```

> Al abrir una conversación (`GET /messages/conversations/:userId`), los mensajes recibidos se marcan como leídos automáticamente.

---

## 18. Módulo: Storage — Archivos en R2

**Base:** `/api/v1/storage`

El archivo **nunca pasa por el backend**. Flujo:
```
App → API (URL firmada) → Cloudflare R2 (PUT directo) → API (confirmar)
```

### Tipos de archivo (`assetType`)

| Valor | MIME aceptados | Tamaño máx | Campos requeridos |
|---|---|---|---|
| `user-avatar` | `image/jpeg`, `image/png` | 2 MB | — |
| `user-banner` | `image/jpeg`, `image/png`, `image/webp` | 5 MB | — |
| `org-banner` | `image/jpeg`, `image/png` | 5 MB | `orgId` |
| `audio-track` | `audio/mpeg`, `audio/wav`, `audio/ogg` | 25 MB | `orgId`, `songId` |
| `music-score` | `application/pdf`, `image/svg+xml` | 10 MB | `orgId`, `songId` |
| `financial-receipt` | `image/jpeg`, `image/png`, `application/pdf` | 5 MB | `orgId`, `eventId` |
| `technical-file` | `application/xml`, `text/plain`, `application/octet-stream` | 8 MB | `orgId`, `eventId` |
| `reference-video` | `video/mp4`, `video/quicktime` | 300 MB | `orgId`, `eventId` |
| `legal-document` | `application/pdf`, `image/jpeg` | 10 MB | `orgId` |

> Archivos > 50 MB → usar flujo **Multipart**.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/storage/presigned-upload` | URL de subida + crear Asset PENDING |
| `POST` | `/storage/confirm-upload` | Verificar en R2 → Asset CONFIRMED |
| `GET` | `/storage/assets/:id/download` | URL de descarga por ID (recomendado) |
| `GET` | `/storage/presigned-download?key=` | URL de descarga por key interna |
| `GET` | `/storage/assets` | Buscar con filtros |
| `GET` | `/storage/assets/:id` | Asset por ID |
| `PATCH` | `/storage/assets/:id` | Editar metadatos |
| `DELETE` | `/storage/assets/:id` | Soft-delete + purga en R2 |
| `GET` | `/storage/objects?prefix=` | Listar objetos en R2 |
| `POST` | `/storage/multipart/initiate` | Iniciar subida multipart |
| `POST` | `/storage/multipart/complete` | Finalizar subida multipart |
| `DELETE` | `/storage/multipart/abort` | Cancelar subida multipart |

### Flujo subida archivo pequeño (≤ 50 MB)

```javascript
// 1. Obtener URL firmada
const { uploadUrl, key, assetId } = await api('POST', '/storage/presigned-upload', {
  assetType: 'audio-track', contentType: 'audio/mpeg',
  fileSizeBytes: file.size, orgId, songId,
  displayName: 'Pista de referencia', originalName: file.name,
});

// 2. Subir directamente a R2
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(file.size) },
  body: file,
});

// 3. Confirmar
await api('POST', '/storage/confirm-upload', { key, assetType: 'audio-track', durationSeconds: 210 });

// 4. Descargar (siempre por assetId, nunca por key)
const { downloadUrl } = await api('GET', `/storage/assets/${assetId}/download`);
```

---

## 19. Base de datos — Modelos y relaciones

### Diagrama simplificado

```
User ──── OrganizationMember ──── Organization
 │                                     │
 ├── UserSkill ── SkillCategory        ├── Song ── Asset
 ├── VehiclePassenger                  ├── Event ─── EventRoster ── User
 ├── InstrumentAssignment              │       └── EventScheduleItem
 ├── Notification                      │       └── EventVehicle ─ VehiclePassenger
 ├── Message (sender/recipient)        │       └── EventFinance
 ├── FinanceEntry (creator/approver)   │       └── FinanceEntry
 ├── PerDiemPayout (recipient/creator) │       └── PerDiemPayout
 └── Instrument (creator)             ├── FinanceCategory
                                       ├── PerDiemPayout
                                       └── Instrument ── InstrumentAssignment
Venue ── Event
```

### Modelos principales

| Modelo | Tabla | Descripción clave |
|---|---|---|
| `User` | `users` | `keycloakId` (JWT sub), `city`, `country`, lazy provisioning |
| `Organization` | `organizations` | `slug` único, soft delete (`deletedAt`) |
| `OrganizationMember` | `organization_members` | Roles: OWNER/ADMIN/MEMBER/EXTERNAL_TECH |
| `InviteLink` | `invite_links` | Token CUID, expiración, `usedAt` |
| `Song` | `songs` | `musicalKey`, `tempo`, soft delete |
| `Venue` | `venues` | `latitude`, `longitude`, `parkingNotes`, `loadInNotes`, `timezone` |
| `Event` | `events` | `type`, `status`, `setlistNotes`, soft delete |
| `EventRoster` | `event_roster` | `status` (INVITED → CONFIRMED/DECLINED) |
| `EventScheduleItem` | `event_schedule_items` | `isCompleted` para tracking en vivo |
| `EventVehicle` | `event_vehicles` | `plateNumber` |
| `VehiclePassenger` | `vehicle_passengers` | Pivot vehicle ↔ user |
| `VehiclePickupPoint` | `vehicle_pickup_points` | `lat`, `lng`, `order` |
| `EventFinance` | `event_finance` | Resumen 1:1 con Event, `paidAt`, `invoiceAssetId` |
| `FinanceCategory` | `finance_categories` | Por org, tipo INCOME/EXPENSE |
| `FinanceEntry` | `finance_entries` | Estado PENDING/APPROVED/REJECTED, `proofAssetId` |
| `PerDiemPayout` | `per_diem_payouts` | Por músico por evento |
| `SkillCategory` | `skill_categories` | Catálogo global (INSTRUMENT/TECHNICAL/MANAGEMENT) |
| `UserSkill` | `user_skills` | Nivel: BEGINNER → PROFESSIONAL |
| `Instrument` | `instruments` | Status: AVAILABLE/IN_USE/MAINTENANCE/RETIRED |
| `InstrumentAssignment` | `instrument_assignments` | `returnedAt` para historial |
| `Notification` | `notifications` | 11 tipos, `isRead`, `sourceId` |
| `Message` | `messages` | `senderId`, `recipientId`, `isRead` |
| `Asset` | `assets` | Ciclo de vida PENDING→CONFIRMED→READY→DELETED, multipart |

---

## 20. Correr los tests

### Requisitos

1. Docker corriendo (`docker-compose up -d`)
2. Servidor API corriendo (`pnpm dev:api`)

### Ejecutar todas las suites

```bash
# Sprint 2 — Organizations, Songs, Events, Venues (107 assertions)
node test-sprint2-endpoints.mjs

# Sprint 3 — DaySheet, Cronograma, Vehículos, Clima (102 assertions)
node test-daysheet-endpoints.mjs

# Sprint 4-7 — Finance, Skills, Inventory, Notifications, Messages (101 assertions)
node test-sprint4-7-endpoints.mjs
```

### Resultado esperado

```
Total: 107  Passed: 107  (Sprint 2)
Total: 102  Passed: 102  (Sprint 3)
Total: 101  Passed: 101  (Sprint 4-7)
```

### Tests unitarios Jest

```bash
pnpm test:api        # Correr tests
pnpm test:api:cov    # Con cobertura
```

---

## 21. Variables de entorno

Copiar `.env.example` como `.env` y completar:

| Variable | Descripción | Ejemplo local |
|---|---|---|
| `NODE_ENV` | Entorno | `development` |
| `PORT` | Puerto del servidor | `3005` |
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:5433/regieart` |
| `REDIS_URL` | Conexión Redis | `redis://localhost:6379` |
| `KEYCLOAK_URL` | URL base Keycloak | `http://localhost:8090` |
| `KEYCLOAK_REALM` | Nombre del realm | `regieart` |
| `KEYCLOAK_CLIENT_ID` | Client ID de la API | `regieart-api` |
| `KEYCLOAK_CLIENT_SECRET` | Secret del cliente | (ver Keycloak admin) |
| `STORAGE_ENDPOINT` | Endpoint S3 de Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |
| `STORAGE_ACCESS_KEY_ID` | API Key R2 | (dashboard Cloudflare) |
| `STORAGE_SECRET_ACCESS_KEY` | Secret de la API Key R2 | (dashboard Cloudflare) |
| `STORAGE_BUCKET_NAME` | Nombre del bucket | `regieart-media-production` |
| `WEATHER_API_KEY` | API key de WeatherAPI.com | (plan gratuito: 1M llamadas/mes) |
| `CORS_ORIGINS` | Origins permitidos | `http://localhost:3001` |

### Configuración en Railway

Agregar estas variables en el dashboard de Railway → servicio `RegieArt-Backend` → Variables:

- Todas las de producción del bloque anterior
- `WEATHER_API_KEY` → registrarse gratis en [weatherapi.com](https://www.weatherapi.com/signup.aspx)
- Sin `WEATHER_API_KEY` el pronóstico devuelve `null` sin romper nada

---

## 22. Migraciones aplicadas

| Migración | Qué hace |
|---|---|
| `20260518145827_inicio` | Tablas `users`, `organizations`, `organization_members`, `invite_links` |
| `20260609101136_add_asset_model` | Tabla `assets` con ciclo de vida completo |
| `20260609133027_add_asset_search_indexes` | Índices GIN full-text search en `assets` |
| `20260616150743_add_user_banner_asset_type` | Enum `USER_BANNER` en `AssetType` |
| `20260616150831_add_user_banner_url` | Campo `bannerUrl` en `users` |
| `20260714155212_sprint2_orgs_songs_events` | `deletedAt` en orgs, tablas `songs`, `venues`, `events`, `event_roster` |
| `20260721154604_sprint3_daysheet_logistics` | `EventScheduleItem`, `EventVehicle`, `VehiclePassenger`, `VehiclePickupPoint`, `EventFinance`; campos `latitude`, `longitude`, `parkingNotes`, `loadInNotes` en `venues` |
| `20260721164420_sprint4_7_finance_skills_inventory_notifications` | `FinanceCategory`, `FinanceEntry`, `PerDiemPayout`, `SkillCategory`, `UserSkill`, `Instrument`, `InstrumentAssignment`, `Notification`, `Message`; campos `city`, `country` en `users`; `timezone` en `venues`; `setlistNotes` en `events` |

### Comandos útiles

```bash
# Crear nueva migración (desarrollo)
pnpm db:migrate

# Aplicar migraciones pendientes (producción / Railway)
pnpm --filter @regieart/database exec prisma migrate deploy

# Explorar la DB visualmente
pnpm db:studio

# Regenerar cliente Prisma sin migrar
pnpm db:generate
```


### Credenciales de desarrollo local

| Campo | Valor |
|---|---|
| **Usuario** | `teststorage@gmail.com` |
| **Contraseña** | `teststorage@gmail.com` |
| **Client ID** | `regieart-mobile` |
| **Realm** | `regieart` |

### Obtener token — cURL

```bash
curl -s -X POST \
  http://localhost:8090/realms/regieart/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=regieart-mobile" \
  -d "username=teststorage@gmail.com" \
  -d "password=teststorage@gmail.com" \
  | jq -r '.access_token'
```

### Obtener token — JavaScript (frontend)

```javascript
async function getToken() {
  const res = await fetch(
    'http://localhost:8090/realms/regieart/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id:  'regieart-mobile',
        username:   'teststorage@gmail.com',
        password:   'teststorage@gmail.com',
      }),
    }
  );
  const { access_token } = await res.json();
  return access_token; // JWT válido ~5 min
}
```

### Usar el token en cada petición

```javascript
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
```

---
