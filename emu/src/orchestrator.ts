import { EmbedderInput, Embedder } from "./embedder";
import {
  Pinecone,
  PineconeRecord,
  RecordMetadata,
} from "@pinecone-database/pinecone";
import { config } from "dotenv";
import { Worker } from "worker_threads";
import { EventEmitter } from "events";

import os from "os";
import { printProgress } from "./progressBar";
config();

const indexName = process.env.PINECONE_INDEX;
// Use the default Pinecone namespace
const namespace = "";

if (!indexName) {
  throw new Error("environment variable PINECONE_INDEX must be set");
}

const pinecone = new Pinecone();

const numCPUs = os.cpus().length;

const threadPool: Worker[] = [];

const populateThreadPool = () => {
  for (let i = 0; i < numCPUs; i++) {
    const worker = new Worker("./dist/worker.js");
    threadPool.push(worker);
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const clearThreadPool = async () => {
  await Promise.all(
    threadPool.map(async (worker) => {
      if (worker.threadId) {
        await worker.terminate();
      }
    }),
  );
};

async function embedBatchWithWorkers<T extends RecordMetadata>(
  inputs: EmbedderInput[],
): Promise<PineconeRecord<T>[]> {
  return new Promise((resolve) => {
    const results: PineconeRecord<T>[] = [];
    const eventEmitter = new EventEmitter();

    eventEmitter.on("result", async (result) => {
      results.push(result);
      if (results.length == inputs.length) {
        return resolve(results);
      } else {
        printProgress(results.length / inputs.length);
      }
    });

    let inputIndex = 0;

    populateThreadPool();

    for (const worker of threadPool) {
      const messageHandler = async (result: PineconeRecord<T>) => {
        eventEmitter.emit("result", result);

        if (results.length < inputs.length && inputs[inputIndex]) {
          worker.postMessage(inputs[inputIndex]);
          inputIndex++;
        } else {
          // No more tasks, terminate the worker
          worker.off("message", messageHandler); // Remove the event listener
        }
      };

      worker.on("message", messageHandler);

      if (inputIndex < inputs.length) {
        worker.postMessage(inputs[inputIndex]);
        inputIndex++;
      }
    }
  });
}

// Given a PineconeRecord, get the size of the record in bytes
function getSizeOfRecord<T extends RecordMetadata>(
  record: PineconeRecord<T>,
): number {
  const recordString = JSON.stringify(record);
  const recordSize = Buffer.byteLength(recordString, "utf8");
  return recordSize;
}

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

async function embedBatchSerially<T extends RecordMetadata>(
  inputs: EmbedderInput[],
): Promise<PineconeRecord<T>[]> {
  const embedder = new Embedder();
  await embedder.init();

  const results: PineconeRecord<T>[] = [];

  for (const input of inputs) {
    const result = await embedder.embed<T>({
      ...input,
      metadata: input.metadata as T,
    });
    results.push(result);
  }

  return results;
}

const upsertBatch = async <T extends RecordMetadata>(
  records: PineconeRecord<T>[],
): Promise<void> => {
  const index = pinecone.index<T>(indexName);
  const ns = index.namespace(namespace);
  await ns.upsert(records);
};

const orchestrate = async <T extends RecordMetadata>(
  inputs: EmbedderInput[],
  mode = "serial",
): Promise<void> => {
  const result =
    mode === "serial"
      ? await embedBatchSerially<T>(inputs)
      : await embedBatchWithWorkers<T>(inputs);
  console.log("\nCompleted embedding");
  if (!result || result.length === 0) {
    throw new Error("Embedding failed");
  }
  const batches = await createBatches<T>(result);

  process.stdout.write("\n");
  for await (const batch of batches) {
    await upsertBatch<T>(batch);
    process.stdout.write("_");
  }
  return Promise.resolve();
};

export { orchestrate };
