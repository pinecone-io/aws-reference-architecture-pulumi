import { Client } from 'pg';
import { SQS } from 'aws-sdk';

const pgClient = new Client({
  user: process.env.POSTGRES_DB_USER,
  host: process.env.POSTGRES_DB_HOST,
  database: process.env.POSTGRES_DB_NAME,
  password: process.env.POSTGRES_DB_PASSWORD,
  port: Number(process.env.POSTGRES_DB_PORT),
});

const sqs = new SQS();

async function fetchAndSendRecordsToSQS() {
  console.log(`fetchAndSendRecordsToSQS running...`)
  try {
    await pgClient.connect();

    const batchSize = 100; // Adjust the batch size as needed
    let offset = 0;

    while (true) {
      // Fetch a batch of records from Postgres
      const result = await pgClient.query(
        `SELECT * FROM your_table OFFSET $1 LIMIT $2`,
        [offset, batchSize]
      );

      const records = result.rows;

      if (records.length === 0) {
        console.log(`fetchAndSendRecordsToSQS sees no more rows to process...`)
        break; // No more records to process
      }

      // Wrap records and send messages to SQS queue
      for (const record of records) {
        const payload = {
          new: record, // Wrap the record as required by downstream microservice
        };

        // Convert payload to a JSON string
        const messageBody = JSON.stringify(payload);

        // Send the message to the SQS queue
        await sqs.sendMessage({
          QueueUrl: process.env.SQS_QUEUE_URL!,
          MessageBody: messageBody,
        }).promise();

        console.log(`fetchAndSendRecordsToSQS placed batch of ${records.length} records on SQS queue`)
      }

      offset += batchSize;
    }

    console.log('All records sent to SQS.');
  } catch (error) {
    console.error('Error fetching and sending records:', error);
  } finally {
    await pgClient.end();
  }
}

export { fetchAndSendRecordsToSQS };

