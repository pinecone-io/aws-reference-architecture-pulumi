import { Pool } from "pg";

const pool = new Pool({
  user: process.env.POSTGRES_DB_USER,
  password: process.env.POSTGRES_DB_PASSWORD,
  host: process.env.POSTGRES_DB_HOST,
  database: process.env.POSTGRES_DB_NAME,
  port: Number(process.env.POSTGRES_DB_PORT || "5432"),
  ssl: {
    rejectUnauthorized: false,
  },
});

// Query function to execute database queries
export const query = async (
  text: string,
  params?: (string | number | boolean)[],
) => {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

// Get a client from the pool to run multiple queries in a transaction
export async function getClient() {
  const client = await pool.connect();
  return client;
}
