## Overview 

This application is part of the [Pinecone.io AWS Reference Architecture](https://github.com/pinecone-io/ref-arch-init). It is intended to be run as part of that stack, but 
this README provides information on working with this app individually. 

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Bootstrapping your Pinecone.io index

This application uses a Pinecone index and a Postgres database in concert. 

The sample data for this app exists in `/data/products.csv`. Again, this app is intended to be deployed as part of the [Pinecone AWS Reference Architecture](https://github.com/pinecone-io/ref-arch-init)

The Pinecone index stores embeddings of products, allowing for semantic search over products. 

Postgres is used as a form of temporary storage and in order to emit changes whenever a user modifies product records. 

## Docker build 

You can run the helper `./docker-build.sh` script in the project root. This script will: 
* Ensure you have exported all the environment variables this app requires 
* Explain which are missing, if any are
* Perform the docker build for you, tagging your built image is `semantic-app:latest`

## Environment variables

The following environment variables are required at **build time** in addition to runtime. 

You must export a valid Pinecone API key as `PINECONE_API_KEY` and your `PINECONE_ENVIRONMENT` from 
within [the Pinecone dashboard](https://app.pinecone.io). 

This means you cannot **build** the Docker container without exporting these two environment variables.

In addition to the Pinecone variables, there are additional Postgres environment variables that must be 
set when you **run** the Docker container, as they allow the app to connect to the Postgres database that 
contains the Products information. 

| Env var   | Description  | Required at? |
|---|---|---|
| `PINECONE_API_KEY`  | Your Pinecone API key from [the Pinecone dashboard](https://app.pinecone.io)  | Build time |
| `PINECONE_ENVIRONMENT` | Your Pinecone Environment from [the Pinecone dashboard](https://app.pinecone.io)  | Build time  |
| `PINECONE_INDEX`  | The name of the Pinecone index to connect to and query from. Will be created if it doesn't already exist | Run time  |
| `OPENAI_API_KEY`| Your [OpenAI API key](https://platform.openai.com/account/api-keys) | Run time |
| `POSTGRES_DB_NAME` | The name of the Postgres database to connect to | Run time | 
| `POSTGRES_DB_HOST` | The hostname of the Postgres database to connect to  |  Run time | 
| `POSTGRES_DB_USER` | The username of the Postgres database | Run time | 
| `POSTGRES_DB_PASSWORD` | The password for the Postgres database | Run time | 
| `CERTIFICATE_BASE64` | The base64 encoded SSL certificate used by your Postgres client to connect to the Database | Run time | 

## Running the Docker image 

If you want to run the Docker image locally for testing or debugging purposes, you can run the following command: 

`docker run -p 3000:3000 semantic-app:latest`

This will bind the Docker container's port 3000 to your system's port 3000, meaning you can visit the app once the Docker container is running by visiting 
`http://localhost:3000`.

