import { Pool } from "pg";

// Initialize the pool
const pool = new Pool({
    host: process.env.POSTGRES_DB_HOST,
    port: Number(process.env.POSTGRES_DB_PORT || "5432"),
    database: process.env.POSTGRES_DB_NAME,
    user: process.env.POSTGRES_DB_USER,
    password: process.env.POSTGRES_DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false,
    },
});

// Query function to execute database queries
export const query = async (text: string, params?: any[]) => {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

// Export pool for additional operations if necessary
export const dbPool = pool;
