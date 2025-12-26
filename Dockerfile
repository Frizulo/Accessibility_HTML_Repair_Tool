# Multi-stage build for local/offline-friendly accessibility repair tool
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
# Use npm install (not ci) to be tolerant to lockfile differences across environments
RUN npm config set registry https://registry.npmjs.org/ \
  && npm install --no-fund --no-audit

# Copy source and build
COPY . .
RUN npm run build

# Runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy built output only
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.cjs"]
