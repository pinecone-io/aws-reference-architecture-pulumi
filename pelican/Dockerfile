# Stage 1: Build the TypeScript application
FROM node:20.0.0-slim AS builder

WORKDIR /usr/src/app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Install pnpm, if it's not already installed
RUN npm install -g pnpm@8.6.12

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the source code
COPY . .

# Build the project
RUN npm run build

# Stage 2: Run the compiled JavaScript
FROM node:20.0.0-slim

WORKDIR /usr/src/app

# Copy node modules and compiled JavaScript from the previous stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Define build arguments for environment variables
ARG POSTGRES_DB_USER
ARG POSTGRES_DB_HOST
ARG POSTGRES_DB_NAME
ARG POSTGRES_DB_PASSWORD
ARG POSTGRES_DB_PORT
ARG CERTIFICATE_BASE64
ARG EMU_ENDPOINT

# Set environment variables from build arguments
ENV POSTGRES_DB_USER=$POSTGRES_DB_USER
ENV POSTGRES_DB_HOST=$POSTGRES_DB_HOST
ENV POSTGRES_DB_NAME=$POSTGRES_DB_NAME
ENV POSTGRES_DB_PASSWORD=$POSTGRES_DB_PASSWORD
ENV POSTGRES_DB_PORT=$POSTGRES_DB_PORT
ENV CERTIFICATE_BASE64=$CERTIFICATE_BASE64
ENV EMU_ENDPOINT=$EMU_ENDPOINT

# Start the application
CMD ["node", "dist/index.js"]

