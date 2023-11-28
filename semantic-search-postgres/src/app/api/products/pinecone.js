import { Pinecone } from '@pinecone-database/pinecone';
import logger from '../../logger';
import worker_id from '../../workerIdSingleton'

/** @type Pinecone */
let pinecone;
export function getPinecone() {
  if (pinecone) {
    return pinecone;
  }
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });
  return pinecone;
}

let setupPromise;
/**
 *
 * @param {Pinecone} pinecone
 * @param {string} indexName
 * @returns {Promise<Pinecone.Index>}
 */
export async function getNamespace(pinecone, indexName) {
  // Memoize setting up the index, but only if it succeeds.
  if (!setupPromise) {
    // No race condition here: Node.js is single-threaded and we assign to setupPromise after checking
    // its value, with no awaits in between.
    setupPromise = new Promise(async (resolve) => {
      resolve(await setupIndex(pinecone, indexName));
    });
  }

  const indexReady = await setupPromise;

  if (!indexReady) {
    // On failure, reset state and try again on the next request.
    setupPromise = null;
    logger.error({
      message: "Index not ready",
      service: "frontend",
      worker_id,
      action: "index_not_ready",
    });
    throw new Error("Index not ready");
  }

  // Intentionally use the default namespace for Pinecone
  // The Emu microservice correlatively upserts to the default namespace,
  // signified by ''
  return pinecone.index(indexName).namespace('');
}

/**
 * Create the Pinecone index if it doesn't exist.
 *
 * @param {Pinecone} pinecone
 * @param {string} indexName
 * @returns {boolean}
 */
async function setupIndex(pinecone, indexName) {
  logger.info({
    message: "Listing indices",
    service: "frontend",
    worker_id,
    action: "listing_indices",
  });
  const indices = await pinecone.listIndexes();

  const indexExists = indices.some((index) => index.name === indexName);

  logger.info({
    message: "Finding index",
    indexExists,
    service: "frontend",
    worker_id,
    action: "finding_index",
  });

  if (indexExists) {
    return true;
  }

  try {
    logger.info({
      message: "Creating index",
      service: "frontend",
      worker_id,
      action: "creating_index",
    });

    await pinecone.createIndex({
      name: indexName,
      dimension: 384,
      suppressConflicts: true,
      waitUntilReady: true,
      metric: 'cosine'
    });

    return true;
  } catch (err) {
    logger.error({
      message: "Error creating index",
      err,
      service: "frontend",
      worker_id,
      action: "error_creating_index",
    });

    return false;
  }
}
