# Core concepts 

This document explains core concepts and functionality within the Pinecone AWS Reference Architecture.

# Table of contents 
* [General data flow](#data-flow)
* [Initial data bootstrapping flow](#initial-data-bootstrapping-flow)
* [Chunking and embedding](#chunking-and-embedding)
* [Autoscaling](#autoscaling)

## General data flow 

In normal operating mode, after the [initial data bootstrapping flow](#initial-data-bootstrapping-flow) has been completed, there are two main flows the end user can flex: 

* Semantic search flow 
* Live editing / data sync flow

Let's examine them both in detail: 

### Semantic search flow

First, the user visits the frontend UI, which features a search bar and a table of product results: 

<img alt="The Pinecone AWS Reference Architecture frontend" src="./frontend-microservice-1.png" />

The user may search through all the records in Postgres, via Pinecone, by issuing a query into the text input. 

<img alt="Ref Arch semantic search flow" src="./refarch-semantic-search-flow.png" />

The user's search query on the frontend is first converted into a "query vector" and sent to the Pinecone Index. 

The embedding model converts this query to an embedding, then queries Pinecone's index for the nearest neighbors. These are the Postgres records whose descriptions 
most closely match the user's initial query **semantically**.

Pinecone's index returns a list of results - each of which has metadata attached to it. The metadata contains the record's ID in Postgres. Therefore, the Frontend UI
need only convert this array of objects to an array of IDs to query Postgres for. 

The frontend microservice issues the SQL query directly to the Postgres database, and Postgres returns the records identified by the IDs to the Frontend UI for display. 

In this way, Pinecone serves as an accelerating phase that first determines which records in Postgres most closely match the user's query semantically, and then allows the 
Frontend UI to query for those specific records directly.

### Live edit flow

The user can also edit records directly in the table and save their changes to the product's description. 

<img alt="Ref Arch data flow: editing a record" src="./refarch-edit-record-flow.png" />

When a user updates a record in the table, the frontend microservice issues a SQL query to the RDS Postgres instance. 

The RDS Postgres instance emits the old and new record via `pg_notify` and some custom trigger functions we've defined and codified in the public RDS snapshot 
that the Reference Architecture uses to allow everyone to deploy it a known good state. 

The Pelican microservice picks up that changed record and places it on the SQS queue. 

The Emu microservice, which is constantly polling the SQS queue for jobs, picks up the changed record, converts its new description to embeddings. 

The Emu microservice then converts the completed embeddings to batches. Emu also attaches metadata to the vectors, which includes the original ID of the record 
in the Postgres database - which allows us to later use this ID in SQL queries to complete the semantic search round trip. 

Emu then upserts the batches to Pinecone. At this point, the Pinecone index is fully in sync with the records in Postgres, and the user of the frontend UI 
is able to issue semantic search queries. 

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

## Chunking and embedding

All chunking and embedding is performed by the Emu microservice, which lives in the `./emu` folder in the Reference Architecture monorepo. The Emu microservice has a method named `pollQueue` that 
repeatedly queries SQS for jobs from the queue. 

When Emu receives a message from the queue, it first performs validation on the messages to ensure that they contain the expected fields. 

Emu then creates an array of type `EmbedderInput`, which represents text, an optional ID and a metadata object that needs to be converted to vectors: 

```typescript
export type EmbedderInput = {
  id?: string;
  text: string;
  metadata: RecordMetadata;
};
```
Every valid message that Emu receives in its polling loop is added to the `EmbedderInput` array, and each field of the metadata object for that work is 
converted to a string. 

Emu then calls its `orchestrate` method with the inputs and the processing mode, which currently defaults to `serial`. The orchestrator's job is to multiplex 
work across the two supported methods: `embedBatchSerially` and `embedBatchWithWorkers`. At the time of this writing, only the `embedBatchSerially` method is used. 

The `embedBatchSerially` method creates a new Embedder class, which wraps the `@xenova/transformers` library, and creates an array of type `PineconeRecord<T>`. 

`embedBatchSerially` loops through the inputs it received, converts each input to embeddings, and then batches the completed embeddings into the `PineconeRecord` array which it returns.

Back in the `orchestrate` method, Emu passes the array of `PineconeRecord` to the `createBatches` helper method. The `createBatches` helper method is a generator function that creates 
batches of records up to the Pinecone API limit of 2MB per message. `createBatches` returns the array typed `RecordMetadata` to the `orchestrate` method. 

```typescript
// Generator function to create batches of records up to 2MB
async function* createBatches<T extends RecordMetadata>(
  records: PineconeRecord<T>[],
): AsyncGenerator<PineconeRecord<T>[]> {
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB
  let chunk: PineconeRecord<T>[] = [];
  let chunkSize = 0;

  for (const record of records) {
    const recordSize = getSizeOfRecord(record);

    if (chunkSize + recordSize > MAX_SIZE) {
      yield chunk;
      chunk = [record];
      chunkSize = recordSize;
    } else {
      chunk.push(record);
      chunkSize += recordSize;
    }
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}
```

The `orchestrate` method iterates through the batches and calls the `upsertBatch` helper method on each batch. The `upsertBatch` method uses the Pinecone API client to upsert the records 
to the index's configured namespace. 

Once processing is complete, Emu deletes the processed message from the SQS queue, so that no other worker will pick it up. 

## Autoscaling 

<img alt="Autoscaling Pelican and Emu" src="./autoscaling-concept.png" width="500" />

The Pinecone AWS Reference Architecture defines autoscaling policies for Pelican and Emu, the two microservices that write to, and read from, the shared SQS queue respectively. 

Pelican is the microservice that reads records out of Postgres and writes them to the SQS queue. It has an attached autoscaling policy configured to keep the Pelican ECS service's 
average CPU at a certain amount. There are also minimum and maximum counts defined for Pelican workers on the policy. 

Emu is the microservice that reads changed Postgres records off the shared SQS queue and converts their description fields to embeddings, then upserts the vectors to Pinecone, attaching metadata
that associates the vector with the original Postgres record (by storing its Postgres ID). It also has an attached autoscaling policy configured to keep the Emu ECS service's 
average CPU at a certain amount. There are also minimum and maximum counts defined for Emu workers on the policy. 

Generally speaking, you will need less Pelican workers than Emu workers, because Pelican's task of reading messages out of Postgres and writing them to the SQS queue is less resource intensive than 
Emu's task of converting the natural language descriptions of products into embeddings and upserting them via the Pinecone API. 

Pelican also supports an environment variable, `BATCH_SIZE` which determines the number of Postgres records each Pelican worker will `select` when it is retrieving a segment of records to loop through 
and place on the queue. Once the full Reference Architecture is successfully deployed, you can modify this variable and then run `pulumi up` in order to modify the value. The default value is `1000` records
per batch if no `BATCH_SIZE` environment variable is set.

### Triggers - high and low watermarks

The autoscaling policies for Pelican and Emu are defined at the bottom of the `index.ts` file. Though their criteria and thresholds are set differently, each autoscaling policy works in the same way: 

1. When the condition for the average CPU utilization is breached - the associated CloudWatch Alarm enters the `alarm` state. You can view the CloudWatch dashboard and view the alarms themselves. 
1. The converse "scale-in" activity for the autoscaling policy won't be triggered until enough datapoints are received that show the inverse condition has been reached. Typically, this is 15 data 
points received over the course of 15 minutes.

In other words, you'll typically notice that Pelican and Emu are relatively quick to scale-out and add more workers, but are more conservative about "scaling-in" to a lesser number of workers. 

