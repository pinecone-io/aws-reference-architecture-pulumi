import { query } from "./dbClient"; // Import query function from dbClient
import { SQS } from "aws-sdk";

const sqs = new SQS();

async function fetchAndSendRecordsToSQS() {
  console.log(`fetchAndSendRecordsToSQS running...`);
  const batchSize = 100; // Adjust the batch size as needed
  let offset = 0;

  let hasMoreRecords = true;

  try {
    while (hasMoreRecords) {
      // Fetch a batch of records from Postgres using the pooled query method
      const result = await query(
        `SELECT * FROM products_with_increment OFFSET $1 LIMIT $2`,
        [offset, batchSize],
      );

      const records = result.rows;

      if (records.length === 0) {
        hasMoreRecords = false; // Set the flag to false to exit the loop
        console.log(`fetchAndSendRecordsToSQS sees no more rows to process...`);
      } else {
        // Wrap records and send messages to SQS queue
        for (const record of records) {
          const envelope = {
            payload: {
              new: record, // Wrap the record as required by downstream microservice
            },
          };

          // Convert payload to a JSON string
          const messageBody = JSON.stringify(envelope);

          // Send the message to the SQS queue
          await sqs
            .sendMessage({
              QueueUrl: process.env.SQS_QUEUE_URL!,
              MessageBody: messageBody,
            })
            .promise();

          console.log(
            `fetchAndSendRecordsToSQS placed batch of ${records.length} records on SQS queue`,
          );
        }

        offset += batchSize;
      }
    }
  } catch (error) {
    console.error("Error fetching and sending records:", error);
  }
}

export { fetchAndSendRecordsToSQS };
