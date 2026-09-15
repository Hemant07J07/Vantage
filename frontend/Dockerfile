# --- deps ---------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# --- build ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public env vars must be present at build time to be inlined into the client bundle.
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/dashboard/
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN npm run build

# --- run --------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
