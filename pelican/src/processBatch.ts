import { getClient } from "./dbClient";
import { SQS } from "aws-sdk";
import logger from "./logger";
import worker_id from "./workerIdSingleton";

const sqs = new SQS();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "1000");

export const processBatch = async () => {
  logger.info({
    message: "processing batch of unprocessed records",
    service: "pelican",
    worker_id,
    action: "process_batch",
  });

  const client = await getClient();
  let hasMoreRecords = true;

  try {
    while (hasMoreRecords) {
      await client.query("BEGIN");

      // Fetch a batch of unprocessed records
      const recordsResult = await client.query(
        `SELECT * FROM products_with_increment 
                 WHERE processed = FALSE 
                 ORDER BY id 
                 FOR UPDATE SKIP LOCKED 
                 LIMIT $1`,
        [BATCH_SIZE],
      );

      const records = recordsResult.rows;
      if (records.length === 0) {
        hasMoreRecords = false;

        logger.info({
          message: "No unprocessed records found. Exiting batch processing",
          service: "pelican",
          worker_id,
          action: "exit_batch",
        });

        await client.query("COMMIT");
        break; // Exit the loop if no unprocessed records are found
      }

      for (const record of records) {
        const envelope = {
          new: record,
        };

        // Send the message to the SQS queue
        await sqs
          .sendMessage({
            QueueUrl: process.env.SQS_QUEUE_URL!,
            MessageBody: JSON.stringify(envelope),
          })
          .promise();

        // Update the processed status of the record
        await client.query(
          "UPDATE products_with_increment SET processed = TRUE WHERE id = $1",
          [record.id],
        );

        logger.info({
          message: `Record with ID ${record.id} sent to SQS queue and marked processed`,
          service: "pelican",
          worker_id,
          action: "record_write",
        });
      }

      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({
      message: `Error in processBatch ${error}`,
      service: "pelican",
      worker_id,
      action: "error_batch",
    });
  } finally {
    client.release();
  }
};
