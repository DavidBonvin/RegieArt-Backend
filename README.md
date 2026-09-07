# RégieArt — Backend API

REST API for RégieArt, a platform for performing arts production management. Built with NestJS, PostgreSQL, Redis, and Keycloak (SSO). File storage via Cloudflare R2.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (latest)
- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/installation) >= 8

```bash
npm install -g pnpm
```

---

## Local setup

### 1. Clone the repository

```bash
git clone git@github.com:DavidBonvin/RegieArt-Backend.git
cd RegieArt-Backend
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Most default values in `.env` work out of the box for local development. The one exception is
file storage (Cloudflare R2) — see below.

#### Cloudflare R2 credentials (required)

The API reads `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` and
`STORAGE_BUCKET_NAME` at startup (`apps/api/src/storage/providers/s3-client.provider.ts`) and
**will not boot without them**. These are left empty in `.env.example` on purpose — they're
real credentials, not something safe to commit.

Before running `pnpm dev:api`, either:

- Ask the project maintainer for the shared R2 credentials, or
- Create your own free bucket at [dash.cloudflare.com](https://dash.cloudflare.com/) → R2 →
  Create bucket → Manage R2 API Tokens.

Fill in the 4 `STORAGE_*` variables in your `.env` with those values before step 6.

### 3. Start infrastructure (PostgreSQL, Keycloak, Redis)

```bash
docker compose up -d
```

This starts only the 3 infra containers (`postgres`, `redis`, `keycloak`). The `api` service is
behind a Docker Compose profile and does **not** start here — the API runs locally in step 6
with `pnpm dev:api` (hot reload). If you want the API fully dockerized instead, see
[Running the API in Docker](#running-the-api-in-docker) below.

Wait ~30 seconds for Keycloak to finish importing the realm. You can check with:

```bash
docker compose logs -f keycloak
```

Ready when you see: `Keycloak 23.0 on /`

### 4. Install dependencies

```bash
pnpm install
```

### 5. Generate Prisma client, run migrations and seed catalogs

```bash
pnpm db:generate
pnpm --filter api prisma:migrate
pnpm db:seed
```

`pnpm db:seed` populates global catalogs the frontend depends on (e.g. `skill-categories`).
It's safe to re-run — it upserts by name and won't duplicate rows.

### 6. Start the API

```bash
pnpm dev:api
```

The API will be available at: **http://localhost:3000/api/v1** (global prefix `api/v1`).

---

## Running the API in Docker

Instead of `pnpm dev:api`, you can run the API itself as a Docker container using the
`docker-api` profile:

```bash
docker compose --profile docker-api up -d api
```

This builds and runs the API in Docker, published on **http://localhost:3005/api/v1** (not 3000).
Only use this if you intentionally need the API containerized — for normal local development,
`pnpm dev:api` on port 3000 is the default and what the frontend `.env.example` expects.

---

## Services

| Service    | URL                       | Credentials          |
|------------|---------------------------|----------------------|
| API        | http://localhost:3000/api/v1 | —                 |
| Keycloak   | http://localhost:8090     | admin / admin        |
| PostgreSQL | localhost:5433            | postgres / postgres  |
| Redis      | localhost:6379            | —                    |

---

## Useful commands

```bash
pnpm docker:down          # Stop all containers
pnpm docker:logs          # View container logs
pnpm test:api             # Run unit tests
pnpm db:studio            # Open Prisma Studio (DB browser)
pnpm db:seed              # Re-seed global catalogs (skill-categories, etc.)
```

