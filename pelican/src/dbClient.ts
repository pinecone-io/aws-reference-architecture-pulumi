import { Pool, QueryResult } from 'pg';

const pool = new Pool();

// Query function to execute database queries
export async function query(text: string, params: any[] = []): Promise<QueryResult> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query:', { text, duration, rows: res.rowCount });
  return res;
}

// Get a client from the pool to run multiple queries in a transaction
export async function getClient() {
  const client = await pool.connect();
  return client;
}

