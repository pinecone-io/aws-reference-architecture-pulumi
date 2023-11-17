import { Pinecone } from '@pinecone-database/pinecone'
import { query } from '@/utils/db';
import PipelineSingleton from './pipeline.js';
import { NextResponse } from 'next/server'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
});
const limit = 10;

async function handler(req) {
  const { searchTerm, currentPage } = await req.json();

  console.log(`searchTerm: ${searchTerm}, currentPage: ${currentPage}`);

  const offset = currentPage > 1 ? (currentPage - 1) * limit : 0;

  const indexName = process.env.PINECONE_INDEX;

  await pinecone.createIndex({
    name: indexName,
    dimension: 384,
    suppressConflicts: true,
    waitUntilReady: true,
  });

  const index = pinecone.index(indexName);
  // Intentionally use the default namespace for Pinecone
  // The Emu microservice correlatively upserts to the default namespace, 
  // signified by ''
  const namespace = index.namespace('')

  const classifier = await PipelineSingleton.getInstance();

  const embeddedSearchTerm = await classifier(searchTerm, { pooling: 'mean', normalize: true })

  console.log(`embeddedSearchTerm: %o`, embeddedSearchTerm)
  console.log(`embeddedSearchTerm.data: %o`, embeddedSearchTerm.data)

  const result = await namespace.query({
    vector: Array.from(embeddedSearchTerm.data),
    topK: 100,
    includeMetadata: true
  });

  console.log(`result: %o`, result);
  console.log(`length of matches in Pinecone: ${result.matches.length}`)

  const ids = result ? result.matches?.map((match) => match.metadata?.id) : [];

  console.log(`ids before query: ${ids}`)

  const productsQuery = `
    SELECT * FROM products_with_increment
    ${ids.length > 0 ? `WHERE id IN (${ids.map((id) => `'${id}'`).join(',')})` : ''}
    LIMIT ${limit} OFFSET ${offset}    
  `;

  console.log(`products query: ${productsQuery}`);

  const products = await query(productsQuery);

  //console.log(products.rows);

  return NextResponse.json(products.rows);
}

export {
  handler as POST
};

