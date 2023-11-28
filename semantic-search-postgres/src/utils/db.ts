import { Pool } from "pg";

let pool: Pool
// Initialize the pool
function getPool() {
    if (pool) return pool;

    pool = new Pool({
        host: process.env.POSTGRES_DB_HOST,
        port: Number(process.env.POSTGRES_DB_PORT || "5432"),
        database: process.env.POSTGRES_DB_NAME,
        user: process.env.POSTGRES_DB_USER,
        password: process.env.POSTGRES_DB_PASSWORD,
        ssl: {
            rejectUnauthorized: false,
        },
    });

    return pool;
}

// Query function to execute database queries
export const query = async (text: string, params?: any[]) => {
    const client = await getPool().connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};
