# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

# --- deps: install with full lockfile, no lifecycle scripts (Prisma engines
# and native deps are handled explicitly in the build stage) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --- build: generate Prisma client, compile Next.js in standalone mode ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- runner: slim runtime image, non-root user ---
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# --- realtime: standalone WS server (LISTEN/NOTIFY -> WebSocket), run via tsx ---
FROM base AS runner-realtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=deps /app/node_modules ./node_modules
COPY realtime ./realtime
COPY tsconfig.json ./
USER nextjs
EXPOSE 8080
CMD ["npx", "tsx", "realtime/server.ts"]

# --- worker: pg-boss job processor, run via tsx ---
FROM base AS runner-worker
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=deps /app/node_modules ./node_modules
COPY jobs ./jobs
COPY tsconfig.json ./
USER nextjs
CMD ["npx", "tsx", "jobs/worker.ts"]
