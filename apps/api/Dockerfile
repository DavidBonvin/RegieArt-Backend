FROM node:20-alpine AS builder

RUN npm install -g pnpm
WORKDIR /app

# Copy configuration files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Copy the packages and API app
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies and build
RUN pnpm install
RUN pnpm --filter database prisma:generate
RUN pnpm --filter api build

FROM node:20-alpine AS runner

RUN npm install -g pnpm
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

CMD ["node", "dist/main"]
