FROM node:22-alpine AS builder

RUN apk add --no-cache openssl
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
RUN pnpm --filter @regieart/database prisma:generate
RUN pnpm --filter @regieart/database build
RUN pnpm --filter api build

FROM node:22-alpine AS runner

RUN apk add --no-cache openssl
RUN npm install -g pnpm
WORKDIR /app

# Copy the necessary files from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api

# Define environment variables for production
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Copy the startup script and make it executable.
# The script runs prisma migrate deploy with automatic P3009 recovery,
# then starts the Node server.
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

CMD ["./start.sh"]
