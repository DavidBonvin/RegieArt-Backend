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

The default values in `.env` work out of the box for local development. No changes needed to start.

### 3. Start infrastructure (PostgreSQL, Keycloak, Redis)

```bash
docker compose up -d
```

Wait ~30 seconds for Keycloak to finish importing the realm. You can check with:

```bash
docker compose logs -f keycloak
```

Ready when you see: `Keycloak 23.0 on /`

### 4. Install dependencies

```bash
pnpm install
```

### 5. Generate Prisma client and run migrations

```bash
pnpm db:generate
pnpm --filter api prisma:migrate
```

### 6. Start the API

```bash
pnpm dev:api
```

The API will be available at: **http://localhost:3000**  
Swagger docs at: **http://localhost:3000/api**

---

## Services

| Service    | URL                       | Credentials          |
|------------|---------------------------|----------------------|
| API        | http://localhost:3000     | —                    |
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
```
