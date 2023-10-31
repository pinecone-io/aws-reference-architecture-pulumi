#!/usr/bin/env bash
#
# This script builds the Docker image for the frontend Next.js
# application, while passing the correct env vars into the build
#
# It will fail if you are missing a required environment variable
# and ask you to export it in your shell
# 

# Declare an array of named environment variables that must be set
required_env_vars=(
"PINECONE_API_KEY" 
"PINECONE_ENVIRONMENT" 
"PINECONE_INDEX"
"OPENAI_API_KEY"
"POSTGRES_DB_NAME"
"POSTGRES_DB_HOST"
"POSTGRES_DB_PORT"
"POSTGRES_DB_USER"
"POSTGRES_DB_PASSWORD"
"CERTIFICATE_BASE64"
)

# Initialize an array to hold missing variables
missing_vars=()

# Loop through the array and check each variable
for env_var in "${required_env_vars[@]}"; do
  # Use indirect variable reference to get the value of the env var
  value="${!env_var}"

  if [[ -z "$value" ]]; then
    missing_vars+=("$env_var")
  fi
done

# Check if there are any missing variables and report them all at once
if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "Error: The following environment variables must be exported and cannot be an empty string: ${missing_vars[*]}"
  exit 1
fi

echo "All required environment variables are set. Proceeding to Docker build..."

DOCKER_IMAGE_NAME="semantic-app"

docker build \
  --build-arg PINECONE_ENVIRONMENT="$PINECONE_ENVIRONMENT" \
  --build-arg PINECONE_API_KEY="$PINECONE_API_KEY" \
  --build-arg PINECONE_INDEX="$PINECONE_INDEX" \
  --build-arg OPENAI_API_KEY="$OPENAI_API_KEY" \
  --build-arg POSTGRES_DB_NAME="$POSTGRES_DB_NAME" \
  --build-arg POSTGRES_DB_HOST="$POSTGRES_DB_HOST" \
  --build-arg POSTGRES_DB_PORT="$POSTGRES_DB_PORT" \
  --build-arg POSTGRES_DB_USER="$POSTGRES_DB_USER" \
  --build-arg POSTGRES_DB_PASSWORD="$POSTGRES_DB_PASSWORD" \
  --build-arg CERTIFICATE_BASE64="$CERTIFICATE_BASE64" \
  -t "$DOCKER_IMAGE_NAME:latest" .

