import { Client } from 'pg';
import process from 'process';
import fetch from 'cross-fetch';
import checkEnvVars from './utils';

type ChangeMessage = {
  channel: string;
  payload: string;
}

let client: Client;

async function connectToDatabase() {
  const decodedCertificate = Buffer.from(process.env.CERTIFICATE_BASE64 as string, 'base64').toString('utf-8');
  client = new Client({
    user: process.env.POSTGRES_DB_USER,
    host: process.env.POSTGRES_DB_HOST,
    database: process.env.POSTGRES_DB_NAME,
    password: process.env.POSTGRES_DB_PASSWORD,
    port: process.env.POSTGRES_DB_PORT as unknown as number,
    ssl: {
      rejectUnauthorized: true,
      ca: decodedCertificate,
    }
  });

  client.on('error', (err: Error) => {
    console.error('Database connection error:', err.stack);
    client.end();
    reconnectToDatabase();
  });

  client.on('end', () => {
    console.log('Database connection ended');
    reconnectToDatabase();
  });

  try {
    await client.connect();
    console.log('Pelican: Database connected successfully. Listening for changes...');

    (client as any).on('notification', async (message: ChangeMessage) => {
      if (message.channel === 'table_change') {
        const payload = JSON.parse(message.payload);
        console.log('Change detected:', payload);

        await forwardMessageToEmu(message);
      }
    });

  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('Failed to connect to database:', err.stack);
    } else {
      console.error('An unexpected error occurred:', err)
    }
    reconnectToDatabase();
  }

  // Listen for notifications of changes
  client.query('LISTEN table_change');
}

function reconnectToDatabase() {
  console.log('Attempting to reconnect to database...');
  setTimeout(connectToDatabase, 5000);  // Retry connection every 5 seconds
}

// Ensure all required environment variables are set before starting up 
checkEnvVars();

connectToDatabase();


async function forwardMessageToEmu(message: ChangeMessage) {
  try {

    const response = await fetch(process.env.EMU_ENDPOINT!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to forward message: ${response.statusText}`);
    }
    console.log('Message forwarded successfully:', await response.json());

  } catch (error) {

    console.error('Error forwarding message:', error);
  }
}

// Gracefully handle app shutdown 
process.on('SIGINT', async () => {
  await client.end();
  console.log('Database connection closed on app termination');
  process.exit();
});
