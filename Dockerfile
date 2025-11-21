# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and configuration files
COPY . .

# Build the application
RUN echo "=== Starting build ===" && \
    npm run build || (echo "❌ Build failed!" && exit 1) && \
    echo "=== Build completed successfully ===" && \
    echo "=== Checking build output ===" && \
    ls -la /app/ && \
    echo "=== Checking if dist exists ===" && \
    (test -d /app/dist && echo "✅ dist directory exists" || (echo "❌ dist directory NOT found" && exit 1)) && \
    echo "=== Contents of dist ===" && \
    ls -la /app/dist/ && \
    echo "=== Full directory tree ===" && \
    find /app/dist -type f -name "*.js" | head -20 && \
    echo "=== Looking for main.js ===" && \
    (test -f /app/dist/main.js && echo "✅ Found dist/main.js") || \
    (test -f /app/dist/main && echo "✅ Found dist/main (no extension)") || \
    (echo "⚠️ main.js not found at root. Searching..." && \
     find /app/dist -name "main.js" -o -name "main" | head -5 && \
     echo "First few JS files found:" && \
     find /app/dist -name "*.js" -type f | head -10)

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api

# Verify files are copied and find the correct entry point
RUN echo "=== Verifying copied files ===" && \
    echo "=== Current directory ===" && \
    pwd && \
    echo "=== Contents of /app ===" && \
    ls -la /app/ && \
    echo "=== Checking dist directory ===" && \
    (test -d dist && echo "✅ dist directory exists" || echo "❌ dist directory NOT found") && \
    echo "=== Contents of dist ===" && \
    (ls -la dist/ 2>/dev/null || echo "dist is empty or doesn't exist") && \
    echo "=== All files in dist recursively ===" && \
    (find dist -type f 2>/dev/null | head -20 || echo "No files found") && \
    echo "=== Looking for main file ===" && \
    (test -f dist/main.js && echo "✅ Found dist/main.js") || \
    (test -f dist/main && echo "✅ Found dist/main") || \
    (echo "⚠️ main.js/main not found at root. Searching..." && \
     find dist -name "*main*" -type f 2>/dev/null | head -10 || echo "No main files found") && \
    echo "=== First 10 JS files found ===" && \
    (find dist -name "*.js" -type f 2>/dev/null | head -10 || echo "No JS files found")

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/sync/sync-status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
# For Vercel, use api/index.ts
# For Docker, use dist/main.js explicitly (Node.js requires .js extension)
# Environment variables are passed at runtime via docker run --env-file or docker-compose
# Use a shell command to find and run the main file dynamically
CMD ["sh", "-c", "MAIN_FILE=$(find dist -name 'main.js' -type f | head -1); if [ -z \"$MAIN_FILE\" ]; then echo 'ERROR: main.js not found. Files in dist:'; find dist -type f | head -20; exit 1; else echo \"Starting with: $MAIN_FILE\"; node \"$MAIN_FILE\"; fi"]
