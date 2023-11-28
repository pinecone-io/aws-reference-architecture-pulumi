# Use an ARM64 compatible Node.js runtime as a parent image
FROM node:20.0.0-slim

# Set the working directory to /app-backend
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.6.12

# Copy package.json and pnpm-lock.yaml to the working directory
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install app dependencies
RUN pnpm install --frozen-lockfile
RUN pnpm install onnxruntime-node@1.14.0

# Set the Pinecone env vars explicitly, otherwise we'll get a build error
ARG PINECONE_API_KEY
ARG PINECONE_ENVIRONMENT

ENV PINECONE_API_KEY=$PINECONE_API_KEY
ENV PINECONE_ENVIRONMENT=$PINECONE_ENVIRONMENT

# Copy the rest of the app's source code to the working directory
COPY . .

# Build everything
RUN pnpm build

# Expose port 4000 for the app to listen on
EXPOSE 4000

# Start the app
CMD [ "pnpm", "start" ]
