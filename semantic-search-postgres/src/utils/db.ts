import { Client } from 'pg';

let client: Client | undefined = undefined
export const runtime = 'edge';
const db = {
    getClient: async () => {
        if (client) return client
        else {
            client = new Client({
                host: process.env.POSTGRES_DB_HOST,
                port: process.env.POSTGRES_DB_PORT ? parseInt(process.env.POSTGRES_DB_PORT) : 25060,
                database: process.env.POSTGRES_DB_NAME,
                user: process.env.POSTGRES_DB_USER,
                password: process.env.POSTGRES_DB_PASSWORD,
                ssl: {
                    rejectUnauthorized: false,
                },
            });

            await client.connect();
            return client
        }
    },
    createClient: async () => {
        const client = new Client({
            host: process.env.POSTGRES_DB_HOST,
            port: process.env.POSTGRES_DB_PORT ? parseInt(process.env.POSTGRES_DB_PORT) : 25060,
            database: process.env.POSTGRES_DB_NAME,
            user: process.env.POSTGRES_DB_USER,
            password: process.env.POSTGRES_DB_PASSWORD,
            ssl: {
                rejectUnauthorized: false,
            },
        });
        return client

    }
}

export default db
