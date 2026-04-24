FROM node:18-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source and config templates
COPY src/ ./src/
COPY config/ ./config/

# Cloud Run sets PORT automatically (default 8080)
ENV PORT=8080
EXPOSE 8080

# Use node directly (not nodemon) for production
CMD ["node", "src/app.js"]
