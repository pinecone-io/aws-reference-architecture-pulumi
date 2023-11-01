import { Client } from "pg";
import process from "process";
import { SQS } from "aws-sdk";
import checkEnvVars from "./utils";

type ChangeMessage = {
  channel: string;
  payload: string;
};

let client: Client;
const sqs = new SQS({ region: process.env.AWS_REGION });

async function connectToDatabase() {
  client = new Client({
    user: process.env.POSTGRES_DB_USER,
    host: process.env.POSTGRES_DB_HOST,
    database: process.env.POSTGRES_DB_NAME,
    password: process.env.POSTGRES_DB_PASSWORD,
    port: process.env.POSTGRES_DB_PORT as unknown as number,
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

    // eslint-disable-next-line
    (client as any).on("notification", async (message: ChangeMessage) => {
      if (message.channel === "table_change") {
        const payload = JSON.parse(message.payload);
        console.log("Change detected:", payload);

        await forwardMessageToQueue(message);
      }
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Failed to connect to database:", err.stack);
    } else {
      console.error("An unexpected error occurred:", err);
    }
    reconnectToDatabase();
  }

  // Listen for notifications of changes
  client.query("LISTEN table_change");
}

function reconnectToDatabase() {
  console.log("Attempting to reconnect to database...");
  setTimeout(connectToDatabase, 5000); // Retry connection every 5 seconds
}

// Ensure all required environment variables are set before starting up
checkEnvVars();

connectToDatabase();

async function forwardMessageToQueue(message: ChangeMessage) {
  try {
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify(message),
    };
    const result = await sqs.sendMessage(params).promise();
    console.log(`Message sent to SQS queue, message ID: ${result.MessageId}`);
  } catch (error) {
    console.error("Error sending", error);
  }
}

// Gracefully handle app shutdown
process.on("SIGINT", async () => {
  await client.end();
  console.log("Database connection closed on app termination");
  process.exit();
});
