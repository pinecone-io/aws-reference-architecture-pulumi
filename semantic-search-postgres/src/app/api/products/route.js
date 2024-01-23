import { query } from "../../../utils/db";
import PipelineSingleton from "./pipeline.js";
import { NextResponse } from "next/server";
import logger from "../../logger";
import worker_id from "../../workerIdSingleton";
import { getPinecone } from "./pinecone.js";

// This cannot be served at build time.
export const dynamic = "force-dynamic";

const limit = 10;

async function handler(req) {
  const { searchTerm, currentPage } = await req.json();

  const pinecone = await getPinecone();

  logger.info({
    message: "Products route hit",
    service: "frontend",
    worker_id,
    searchTerm,
    currentPage,
    action: "products_route_handler",
  });

  const offset = currentPage > 1 ? (currentPage - 1) * limit : 0;

  const namespace = pinecone.index(process.env.PINECONE_INDEX).namespace("");

  const classifier = await PipelineSingleton.getInstance();

  const embeddedSearchTerm = await classifier(searchTerm, {
    pooling: "mean",
    normalize: true,
  });

  logger.info({
    message: "Search term converted to embedding",
    service: "frontend",
    embeddedSearchTerm,
    worker_id,
    action: "search_term_embedded",
  });

  const result = await namespace.query({
    vector: Array.from(embeddedSearchTerm.data),
    topK: 100,
    includeMetadata: true,
  });

  logger.info({
    message: "Pinecone query results received",
    result,
    length: result.matches.length,
    service: "frontend",
    worker_id,
    action: "pinecone_query_results",
  });

  const ids = result
    ? result.matches?.map((match) => Number(match.metadata?.id))
    : [];

  console.log(`ids before query: ${ids}`);

  logger.info({
    message: "Filtered Postgres Ids from Pinecone results metadata",
    ids,
    service: "frontend",
    worker_id,
    action: "postgres_ids_filtered",
  });

  const productsQuery = `
    SELECT * FROM products_with_increment
    ${ids.length > 0 ? `WHERE id = ANY ($1)` : ""}
    LIMIT ${limit} OFFSET ${offset}
  `;
  const params = [];
  if (ids.length > 0) {
    params.push(ids);
  }

  logger.info({
    message: "Products query formed",
    productsQuery,
    service: "frontend",
    worker_id,
    action: "products_query_formed",
  });

  const products = await query(productsQuery, params);

  return NextResponse.json(products.rows);
}

export { handler as POST };
