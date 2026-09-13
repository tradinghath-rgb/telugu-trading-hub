FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose server port (default 3000 for AWS App Runner / Elastic Beanstalk)
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]
