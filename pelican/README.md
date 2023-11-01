# Pelican

![Pelican Postgres change observing microservice](./docs/pelican-hero-image.png)

Pelican is a microservice that listens to Postgres table changes, collects the changes records, and forwards them
to the Emu microservice which performs embeddings and upserts to Pinecone.

Pelican is a component of [the Pinecone Reference Architecture](https://github.com/pinecone-io/ref-arch-init).

## Getting started

## Running Pelican

1. Export the required environment variables which Pelican uses to connect to the Postgres database:

The following environment variables control Pelican's access to the Postgres database it will listen to for changes:

- `POSTGREST_DB_USER` - The Postgres username
- `POSTGRES_DB_HOST` - The Postgres hostname - if using RDS this is the full DNS endpoint
- `POSTGRES_DB_NAME` - The name of the Postgres database
- `POSTGRES_DB_PASSWORD` - The Postgres password
- `POSTGRES_DB_PORT` - The Postgres port - note that AWS tends to use a different port than other hosts by default
- `AWS_REGION` - The AWS Region where the SQS job queue is running
- `SQS_QUEUE_URL` - The URL to the SQS endpoint for placing jobs on the queue

The following environment variables allow Pelican to find the Emu microservice that it forwards changes to

- `EMU_ENDPOINT` - The endpoint where the [Emu microservice](https://github.com/pinecone-io/emu)
