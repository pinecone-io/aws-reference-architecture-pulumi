# Core concepts 

This document explains core concepts and functionality within the Pinecone AWS Reference Architecture.

# Table of contents 
* [Initial data bootstrapping flow](#initial-data-bootstrapping-flow)

## Initial data bootstrapping flow

<img alt="Bootstrapping data from Postgres to Pinecone" src="./postgres-to-pinecone-bootstrapping.png" width="500" />

The initial data bootstrapping phase is a crucial component of the Reference Architecture. 

This phase ensures that the Pinecone index is always in sync with the contents of the RDS Postgres database. 

By maintaining this synchronization, Pinecone can effectively serve as the semantic search backend, enabling end-users to issue natural language queries that are accurately mapped to the structured data within RDS Postgres.

<img alt="RefArch data bootstrapping flow" src="./refarch-data-bootstrapping-flow.png" />

### Bootstrapping process

1. **Deployment of Reference Architecture**: The process begins once the Reference Architecture is deployed. This setup includes all the necessary components, such as the RDS Postgres database and the Pinecone service.

1. **Activation of Pelican**: Upon deployment, the Pelican service starts and checks the RDS Postgres database for records marked as processed = false. These unprocessed records are the primary focus of the initial bootstrapping.

1. **Batch Processing by Pelican**: Pelican identifies all unprocessed records and processes them in configurable batches. To ensure efficiency and prevent conflicts, row-level locking is employed. This mechanism allows multiple Pelican workers to operate simultaneously without interfering with each other.

1. **Queueing and Processing Records**: Each record in a batch is placed on the SQS queue by Pelican workers. After placing a record on the queue, the worker marks it as processed in the Postgres database.

1. **Handling by Emu**: The Emu service continuously pulls jobs off the SQS queue. For each record, Emu converts the record's description into embeddings and upserts these into the Pinecone index. Crucially, Emu attaches metadata linking each vector back to its original Postgres record, including the Postgres ID, ensuring traceability and synchronization.

1. **Transition to Passive Listening**: Once all existing records are processed, Pelican shifts to a passive listening mode. In this mode, Pelican monitors the RDS Postgres database for any new or changed records. These records are then placed on the SQS queue, maintaining ongoing synchronization between Postgres and Pinecone.

### Importance of synchronization

The synchronization between the RDS Postgres database and the Pinecone index is vital for the Reference Architecture's core functionality. 

It allows the architecture to support ambiguous natural language queries from users, translating them into structured queries that interact with the data 
in RDS Postgres. 

This synchronization ensures that users can retrieve accurate and relevant results from their searches, enhancing the overall utility and user experience of the system.
