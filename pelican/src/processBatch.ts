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

            // Check if bootstrapping is complete
            const isCompleteResult = await client.query('SELECT is_complete FROM bootstrapping_state');
            const isBootstrappingComplete = isCompleteResult.rows[0].is_complete;

            if (isBootstrappingComplete === true) {
                console.log("Bootstrapping already completed.");
                await client.query('COMMIT');
                break;
            }

            // Get the last processed ID
            const lastIdResult = await client.query('SELECT last_id FROM last_record_processed');
            let lastId = lastIdResult.rows[0].last_id;
            console.log(`Pelican worker got lastId: ${lastId}`)

            // Calculate next range of IDs
            const nextId = lastId + 1;
            const upperBoundId = nextId + BATCH_SIZE;
            console.log(`Pelican worker calculated upperBoundId as ${upperBoundId}`)

            // Fetch and process records
            const recordsResult = await client.query(
                `SELECT * FROM products_with_increment 
                 WHERE id >= $1 AND id < $2 AND processed = FALSE`,
                [nextId, upperBoundId]
            );

            if (recordsResult.rows.length === 0) {
                // Check if there are any unprocessed records left in the entire table
                const remainingRecordsResult = await client.query(
                    'SELECT COUNT(*) FROM products_with_increment WHERE processed = FALSE'
                );
                const remainingRecordsCount = parseInt(remainingRecordsResult.rows[0].count, 10);

                if (remainingRecordsCount === 0) {
                    hasMoreRecords = false
                    console.log(`Pelican worker setting bootstrapping as complete`);
                    await client.query('UPDATE bootstrapping_state SET is_complete = TRUE');
                    console.log(`All records processed.`)
                } else {
                    console.log(`No records in the current batch, but ${remainingRecordsCount} unprocessed records remain.`);
                }

            } else {
                for (const record of recordsResult.rows) {
                    // Process each record
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

                // Update last_record_processed table with new last_id
                await client.query('UPDATE last_record_processed SET last_id = $1', [upperBoundId]);
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

