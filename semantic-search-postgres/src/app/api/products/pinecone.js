import { Pinecone } from '@pinecone-database/pinecone';
import logger from '../../logger';
import worker_id from '../../workerIdSingleton'

let indexSetup = false;

/** @type Pinecone */
let pinecone;
export function getPinecone() {
  if (pinecone) {
    return pinecone;
  }
  pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  // If the index hasn't already been set up (e.g., created if it does not already exist)
  // then create it via the Pinecone client
  if (!indexSetup) {
    setupIndex(pinecone, process.env.PINECONE_INDEX).then(() => {
      indexSetup = true
    })
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
      // This option tells the client not to throw if the index already exists.
      suppressConflicts: true,
      // This option tells the client not to resolve the promise until the
      // index is ready.
      waitUntilReady: true,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: process.env.AWS_REGION } }
    });

  } catch (err) {
    logger.error({
      message: "Error creating index",
      err,
      service: "frontend",
      worker_id,
      action: "error_creating_index",
    });
  }
}
