import { Client, Notification } from "pg";
import process from "process";
import { SQS } from "aws-sdk";
import checkEnvVars from "./utils";

let client: Client;
const sqs = new SQS({ region: process.env.AWS_REGION });

// Ensure all required environment variables are set before starting up
checkEnvVars();

async function connectToDatabase() {
  client = new Client({
    user: process.env.POSTGRES_DB_USER,
    host: process.env.POSTGRES_DB_HOST,
    database: process.env.POSTGRES_DB_NAME,
    password: process.env.POSTGRES_DB_PASSWORD,
    port: Number(process.env.POSTGRES_DB_PORT),
    ssl: {
      rejectUnauthorized: false,
    }
  });

  client.on("error", (err: Error) => {
    console.error("Database connection error:", err.stack);
    client.end();
    reconnectToDatabase();
  });

  client.on("end", () => {
    console.log("Database connection ended");
    reconnectToDatabase();
  });

  try {
    await client.connect();
    console.log(
      "Pelican: Database connected successfully. Listening for changes...",
    );

    /* eslint-disable  @typescript-eslint/no-explicit-any */
    (client as any).on("notification", handleNotification);
    await listenForTableChanges();
  } catch (err: unknown) {
    handleDatabaseConnectionError(err);
    reconnectToDatabase();
  }
}

async function listenForTableChanges() {
  try {
    await client.query("LISTEN table_change");
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error listening to table changes:", error.stack);
    } else {
      console.error("An unexpected error occurred:", error);
    }
    reconnectToDatabase();
  }
}

function handleDatabaseConnectionError(err: unknown) {
  if (err instanceof Error) {
    console.error("Failed to connect to database:", err.stack);
  } else {
    console.error("An unexpected error occurred:", err);
  }
}

function handleNotification(message: Notification) {
  try {
    if (message.channel === "table_change") {
      const payload = JSON.parse(message.payload as string);
      console.log("Change detected:", payload);

      forwardMessageToQueue(message);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Error handling notification:", error.stack);
    } else {
      console.error("An unexpected error occurred:", error);
    }
  }
}

function reconnectToDatabase() {
  console.log("Attempting to reconnect to database...");
  setTimeout(connectToDatabase, 5000); // Retry connection every 5 seconds
}

connectToDatabase();

async function forwardMessageToQueue(message: Notification) {
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
  await client.end();
  console.log("Database connection closed on app termination");
  process.exit();
});

// Global Unhandled Rejection Listener
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
