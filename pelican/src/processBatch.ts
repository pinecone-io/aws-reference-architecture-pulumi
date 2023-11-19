import { getClient } from "./dbClient";
import { SQS } from "aws-sdk";

const sqs = new SQS();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "1000");

export const processBatch = async () => {
  const client = await getClient();
  let hasMoreRecords = true;

  try {
    while (hasMoreRecords) {
      await client.query('BEGIN');

      // Fetch a batch of unprocessed records
      const recordsResult = await client.query(
        `SELECT * FROM products_with_increment 
                 WHERE processed = FALSE 
                 ORDER BY id 
                 FOR UPDATE SKIP LOCKED 
                 LIMIT $1`,
        [BATCH_SIZE]
      );

      const records = recordsResult.rows;
      if (records.length === 0) {
        hasMoreRecords = false;
        console.log("No unprocessed records found. Exiting batch processing.");
        await client.query('COMMIT');
        break;  // Exit the loop if no unprocessed records are found
      }

      for (const record of records) {
        const envelope = {
          new: record,
        };

        // Send the message to the SQS queue
        await sqs.sendMessage({
          QueueUrl: process.env.SQS_QUEUE_URL!,
          MessageBody: JSON.stringify(envelope),
        }).promise();

        // Update the processed status of the record
        await client.query(
          "UPDATE products_with_increment SET processed = TRUE WHERE id = $1",
          [record.id],
        );

        console.log(`Record with ID ${record.id} sent to SQS queue`);
      }

      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in processBatch:', error);
  } finally {
    client.release();
  }
};
