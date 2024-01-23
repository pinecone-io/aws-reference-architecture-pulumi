import { Pinecone } from "@pinecone-database/pinecone";
import logger from "../../logger";
import worker_id from "../../workerIdSingleton";

let indexSetup = false;
/** @type Pinecone */
let pinecone;

export async function getPinecone() {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }

  if (!indexSetup) {
    indexSetup = await setupIndex(pinecone, process.env.PINECONE_INDEX);
    if (!indexSetup) {
      throw new Error("Failed to set up Pinecone index");
    }
  }

  return pinecone;
}

/**
 * Create the Pinecone index if it doesn't exist.
 *
 * @param {Pinecone} pinecone
 * @param {string} indexName
 * @returns {boolean}
 */
async function setupIndex(pinecone, indexName) {
  try {
    logger.info({
      message: "Creating Pinecone index if necessary",
      service: "frontend",
      worker_id,
      action: "creating_index",
    });

    await pinecone.createIndex({
      name: indexName,
      dimension: 384,
      metric: "cosine",
      // Don't return an error if the target Index already exists
      suppressConflicts: true,
      // Wait until the index is ready before returning success
      waitUntilReady: true,
      spec: {
        serverless: {
          cloud: "aws",
          region: process.env.AWS_REGION,
        },
      },
    });

    return true;
  } catch (err) {
    logger.error({
      message: "Error creating index",
      err: err.message,
      service: "frontend",
      worker_id,
      action: "error_creating_index",
    });

    return false;
  }
}
