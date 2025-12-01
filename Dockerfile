# Use Node.js 20.x
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Ensure workflow JSON files are accessible in public directory
# (in case they're not included in the build)
RUN cp -f back_squat_workflow.json public/ 2>/dev/null || true
RUN cp -f src/back_squat_workflow.json public/ 2>/dev/null || true

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]

