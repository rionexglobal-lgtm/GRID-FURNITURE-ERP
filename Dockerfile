# Production Dockerfile for GRID Shop Manager ERP
FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Ensure data and uploads directories exist
RUN mkdir -p /app/data/uploads

# Expose server port
EXPOSE 3000

# Volume for database and uploads persistence
VOLUME ["/app/data"]

CMD ["npm", "start"]
