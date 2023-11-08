import { Pinecone } from '@pinecone-database/pinecone'
import db from '@/utils/db';
import PipelineSingleton from './pipeline.js';
import { NextResponse } from 'next/server'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: 'eastus-azure',
});
const limit = 10;

async function handler(req) {
  const { searchTerm, currentPage } = await req.json();
  console.log(searchTerm, currentPage);

  const offset = currentPage > 1 ? (currentPage - 1) * limit : 0;

  const pgClient = await db.getClient();

  const indexName = process.env.PINECONE_INDEX;

  await pinecone.createIndex({
    name: indexName,
    dimension: 384,
    suppressConflicts: true,
    waitUntilReady: true,
  });

  const index = pinecone.index(indexName);

  const classifier = await PipelineSingleton.getInstance();

  const embeddedSearchTerm = await classifier(searchTerm, { pooling: 'mean', normalize: true })

  console.log(`embeddedSearchTerm: %o`, embeddedSearchTerm)

  console.log(`embeddedSearchTerm.data: %o`, embeddedSearchTerm.data)

  const result = await index.query({
    vector: Array.from(embeddedSearchTerm.data),
    topK: 100,
    includeMetadata: true
  });

  console.log(`result: %o`, result);

  const ids = result ? result.matches?.map((match) => match.metadata?.id) : [];

  const query = `
    SELECT * FROM products_with_increment
    ${ids.length > 0 ? `WHERE id IN (${ids.map((id) => `'${id}'`).join(',')})` : ''}
    LIMIT ${limit} OFFSET ${offset}    
  `;

  console.log(`query: ${query}`);

  const products = await pgClient.query(query);

  console.log(products.rows);

  return NextResponse.json(products.rows);
}

export {
  handler as POST
};

