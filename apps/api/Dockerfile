FROM node:22-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

# Copy configuration files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Copy the packages and API app
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies and build
# --ignore-scripts avoids pnpm 10 blocking postinstall hooks
# then rebuild only the packages that need native binaries
RUN pnpm install --ignore-scripts
RUN pnpm rebuild @prisma/engines @prisma/client @nestjs/core
RUN pnpm --filter @regieart/types build
RUN pnpm --filter database prisma:generate
RUN pnpm --filter api build

FROM node:20-alpine AS runner

RUN npm install -g pnpm prisma
WORKDIR /app

# Copy the necessary files from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api

# Define environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run Prisma migrations then start the server.
# ../../node_modules/.bin/prisma resolves to /app/node_modules/.bin/prisma (root workspace bin).
# ../../packages/database/prisma/schema.prisma resolves to /app/packages/database/prisma/schema.prisma.
CMD ["sh", "-c", "prisma migrate deploy --schema=../../packages/database/prisma/schema.prisma && node dist/main"]
