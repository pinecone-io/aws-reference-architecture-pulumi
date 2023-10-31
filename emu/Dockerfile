# Use an ARM64 compatible Node.js runtime as a parent image
FROM node:20.0.0

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


# Copy the rest of the app's source code to the working directory
COPY . .

# Build everything
RUN pnpm build

# Expose port 4000 for the app to listen on
EXPOSE 4000

# Start the app
CMD [ "pnpm", "start" ]
