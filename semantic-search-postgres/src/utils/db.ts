
import { Client } from 'pg';

let client: Client | undefined = undefined
export const runtime = 'edge';
const db = {
    getClient: async () => {
        if (client) return client
        else {
            const decodedCertificate = Buffer.from(process.env.CERTIFICATE_BASE64 as string, 'base64').toString('utf-8');
            client = new Client({
                host: process.env.POSTGRES_DB_HOST,
                port: process.env.POSTGRES_DB_PORT ? parseInt(process.env.POSTGRES_DB_PORT) : 25060,
                database: process.env.POSTGRES_DB_NAME,
                user: process.env.POSTGRES_DB_USER,
                password: process.env.POSTGRES_DB_PASSWORD,
                ssl: {
                    rejectUnauthorized: true,
                    ca: decodedCertificate,
                },
            });

            await client.connect();
            return client
        }
    },
    createClient: async () => {
        const decodedCertificate = Buffer.from(process.env.CERTIFICATE_BASE64 as string, 'base64').toString('utf-8');
        const client = new Client({
            host: process.env.POSTGRES_DB_HOST,
            port: process.env.POSTGRES_DB_PORT ? parseInt(process.env.POSTGRES_DB_PORT) : 25060,
            database: process.env.POSTGRES_DB_NAME,
            user: process.env.POSTGRES_DB_USER,
            password: process.env.POSTGRES_DB_PASSWORD,
            ssl: {
                rejectUnauthorized: true,
                ca: decodedCertificate,
            },
        });
        return client

    }
}

export default db