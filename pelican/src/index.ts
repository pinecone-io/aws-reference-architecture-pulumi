import { Notification } from "pg";
import process from "process";
import { SQS } from "aws-sdk";
import { config } from "dotenv";
import checkEnvVars from "./utils";
import { getClient } from "./dbClient";
import { type PoolClient } from "pg";
import { processBatch } from "./processBatch";
import logger from "./logger";
import worker_id from "./workerIdSingleton";

config();

logger.info({
  message: "starting up",
  service: "pelican",
  worker_id,
  action: "startup",
});

const sqs = new SQS({ region: process.env.AWS_REGION });

let listenClient: PoolClient | null = null;

// Ensure all required environment variables are set before starting up
checkEnvVars();

async function connectToDatabase() {
  try {
    logger.info({
      message: "Connected to database successfully. Listening for changes...",
      service: "pelican",
      worker_id,
      action: "connected",
    });

    await processBatch();

    await listenForTableChanges();
  } catch (err: unknown) {
    handleDatabaseConnectionError(err);
    reconnectToDatabase();
  }
}

async function listenForTableChanges() {
  try {
    // Get a dedicated client from the pool
    listenClient = await getClient();

    // Set up notification handling on this client
    listenClient.on("notification", handleNotification);

    // Start listening to the 'table_change' channel
    await listenClient.query("LISTEN table_change");

    logger.info({
      message:
        "Switched to passive listening mode. Listening for Postgres table changes...",
      service: "pelican",
      worker_id,
      action: "switch_passive_listening",
    });
  } catch (error: unknown) {
    handleDatabaseConnectionError(error);
    // If there's an error, we disconnect the client and try to reconnect
    if (listenClient) {
      listenClient.release();
    }
    reconnectToDatabase();
  }
}

function handleNotification(message: Notification) {
  try {
    if (message.channel === "table_change" && message.payload) {
      const payloadObject = JSON.parse(message.payload as string);

      logger.info({
        message: "handleNotification payloadObject",
        payloadObject,
        service: "pelican",
        worker_id,
        action: "payload_object",
      });

      forwardMessageToQueue(payloadObject);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error handling notification:", error.stack);
      logger.error({
        message: `Error handling notification: ${error.stack}`,
        error,
        service: "pelican",
        worker_id,
        action: "error_handling_notification",
      });
    } else {
      logger.error({
        message: `An unexpected error occurred: ${error}`,
        error,
        service: "pelican",
        worker_id,
        action: "error_handling_notification_unexpected",
      });
    }
  }
}

function handleDatabaseConnectionError(err: unknown) {
  if (err instanceof Error) {
    logger.error({
      message: `Failed to connect to database: ${err.stack}`,
      err,
      service: "pelican",
      worker_id,
      action: "database_connection_error",
    });
  } else {
    logger.error({
      message: `An unexpected error occurred`,
      err,
      service: "pelican",
      worker_id,
      action: "database_connection_error_unexpected",
    });
  }
}

function reconnectToDatabase() {
  logger.info({
    message: `Attempting to reconnect to database...`,
    service: "pelican",
    worker_id,
    action: "database_reconnect_attempt",
  });
  setTimeout(connectToDatabase, 5000); // Retry connection every 5 seconds
}

connectToDatabase();

async function forwardMessageToQueue(message: unknown) {
  try {
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify(message),
    };
    const result = await sqs.sendMessage(params).promise();

    logger.info({
      message: `Message sent to SQS queue, message ID: ${result.MessageId}`,
      result,
      service: "pelican",
      worker_id,
      action: "message_sent",
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({
        message: `Error sending message to SQS: ${error.stack}`,
        error,
        service: "pelican",
        worker_id,
        action: "message_send_error",
      });
    } else {
      logger.error({
        message: `An unexpected error occurred`,
        error,
        service: "pelican",
        worker_id,
        action: "message_send_error_unexpected",
      });
    }
  }
}

// Gracefully handle app shutdown
process.on("SIGINT", async () => {
  // Release the dedicated client for listening
  if (listenClient) {
    listenClient.release();
    logger.info({
      message: `Released the dedicated client for listening to table changes`,
      service: "pelican",
      worker_id,
      action: "listen_client_release",
    });
  }
  logger.info({
    message: `Database connection closed on app termination`,
    service: "pelican",
    worker_id,
    action: "database_connection_closed",
  });
  process.exit();
});

// Global Unhandled Rejection Listener
process.on("unhandledRejection", (reason, promise) => {
  logger.error({
    message: `Unhandled Rejection at: ${promise}, reason: ${reason}`,
    service: "pelican",
    worker_id,
    action: "unhandled_rejection",
  });
});
