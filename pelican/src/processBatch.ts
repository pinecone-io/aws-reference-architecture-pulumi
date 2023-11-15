import { query } from "./dbClient";
import { isBootstrappingComplete } from "./bootstrap";
import { SQS } from "aws-sdk";

const sqs = new SQS();

export const processBatch = async () => {
  if (await isBootstrappingComplete()) {
    console.log("Bootstrapping already completed.");
    return;
  }

  const batchSize = Number(process.env.BATCH_SIZE ?? 100);
  let hasMoreRecords = true;

  while (hasMoreRecords) {
    try {
      // Select records with row-level locking
      const result = await query(
        `SELECT * FROM products_with_increment 
             WHERE processed = FALSE 
             ORDER BY id 
             LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );

      const records = result.rows;

      if (records.length === 0) {
        hasMoreRecords = false;
        // No more records to process, update bootstrapping state
        await query("UPDATE bootstrapping_state SET is_complete = TRUE");
        console.log("Bootstrapping process completed.");
      } else {
        // Process each record
        for (const record of records) {
          const envelope = {
            payload: {
              new: record, // Wrap the record as required by downstream microservice
            },
          };

          // Send the message to the SQS queue
          await sqs
            .sendMessage({
              QueueUrl: process.env.SQS_QUEUE_URL!,
              MessageBody: JSON.stringify(envelope),
            })
            .promise();

          // Update the processed status of the record
          await query(
            "UPDATE products_with_increment SET processed = TRUE WHERE id = $1",
            [record.id],
          );

          console.log(`Record with ID ${record.id} sent to SQS queue`);
        }
      }
    } catch (error) {
      console.error("Error in transaction", error);
      hasMoreRecords = false;
    }
  }
};
