import { Notification } from "pg";
import process from "process";
import { SQS } from "aws-sdk";
import checkEnvVars from "./utils";
import { getClient } from "./dbClient";
import { type PoolClient } from "pg";
import { processBatch } from "./processBatch";

const sqs = new SQS({ region: process.env.AWS_REGION });

let listenClient: PoolClient | null = null;

// Ensure all required environment variables are set before starting up
checkEnvVars();

async function connectToDatabase() {
  try {
    console.log(
      "Pelican: Database connected successfully. Listening for changes...",
    );

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
    console.log("Listening for table changes...");
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

      console.log(`Pelican handleNotification payloadObject: %o`, payloadObject)

      forwardMessageToQueue(payloadObject);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error handling notification:", error.stack);
    } else {
      console.error("An unexpected error occurred:", error);
    }
  }
}

function handleDatabaseConnectionError(err: unknown) {
  if (err instanceof Error) {
    console.error("Failed to connect to database:", err.stack);
  } else {
    console.error("An unexpected error occurred:", err);
  }
}

function reconnectToDatabase() {
  console.log("Attempting to reconnect to database...");
  setTimeout(connectToDatabase, 5000); // Retry connection every 5 seconds
}

connectToDatabase();

async function forwardMessageToQueue(message: any) {
  try {
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify(message),
    };
    const result = await sqs.sendMessage(params).promise();
    console.log(`Message sent to SQS queue, message ID: ${result.MessageId}`);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error sending message to SQS:", error.stack);
    } else {
      console.error("An unexpected error occurred:", error);
    }
  }
}

// Gracefully handle app shutdown
process.on("SIGINT", async () => {
  // Release the dedicated client for listening
  if (listenClient) {
    listenClient.release();
    console.log(
      "Released the dedicated client for listening to table changes.",
    );
  }
  console.log("Database connection closed on app termination");
  process.exit();
});

// Global Unhandled Rejection Listener
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
