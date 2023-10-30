/**
 * How to Run:
 * 
 * 1. Place your CA certificate in a folder named `crt` at the root of your project.
 * 2. Make sure you have a CSV file named `products.csv` at the root of your project.
 * 3. Set your environment variables (POSTGRES_DB_NAME, POSTGRES_DB_HOST, POSTGRES_DB_USER, POSTGRES_DB_PASSWORD).
 * 4. Run the script.
 * 
 * You could set your environment variables inline while running the script:
 * 
 * ```bash
 * POSTGRES_DB_NAME=defaultdb POSTGRES_DB_HOST=your_host POSTGRES_DB_USER=your_user POSTGRES_DB_PASSWORD=your_password node your_script.js
 * ```
 * 
 * Or, you could use a `.env` file and a package like `dotenv` to load them into `process.env`.
 */

import { Client } from 'pg';
import fs from 'fs';
import cp from 'pg-copy-streams';

const copyFrom = cp.from;

// Read database configurations from environment variables
const {
  POSTGRES_DB_NAME,
  POSTGRES_DB_HOST,
  POSTGRES_DB_USER,
  POSTGRES_DB_PASSWORD
} = process.env;

// Initialize PostgreSQL client with configurations
const client = new Client({
  host: POSTGRES_DB_HOST,
  port: 25060,
  database: POSTGRES_DB_NAME,
  user: POSTGRES_DB_USER,
  password: POSTGRES_DB_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('./crt/do.crt').toString(),
  },
});

// Connect to the database
client.connect();

// Read the CSV file to be imported
const fileStream = fs.createReadStream('./products.csv');

// Create a COPY FROM stream for PostgreSQL
const copyStream = client.query(
  copyFrom('COPY products_with_increment FROM stdin WITH CSV HEADER')
);

// Pipe the CSV file content to the COPY command, and handle the stream events
fileStream.pipe(copyStream)
  .on('finish', async () => {
    console.log('Data imported successfully.');
    await client.end();
  })
  .on('error', (error) => {
    console.error('Error importing data:', error);
    client.end();
  });

