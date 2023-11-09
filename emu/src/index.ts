import {
  SQSClient,
  ReceiveMessageCommandInput,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { config } from "dotenv";
import {
  RecordMetadata,
  RecordMetadataValue,
} from "@pinecone-database/pinecone";
import { EmbedderInput } from "./embedder";
import { orchestrate } from "./orchestrator";

config();

const checkEnvVars = () => {
  const requiredVars = ["AWS_REGION", "SQS_QUEUE_URL"];
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new Error(`Environment variable ${varName} is not defined`);
    }
  });
};

checkEnvVars();

const client = new SQSClient({
  region: process.env.AWS_REGION,
});

const queueURL = process.env.SQS_QUEUE_URL!;

const params: ReceiveMessageCommandInput = {
  MaxNumberOfMessages: 10,
  QueueUrl: queueURL,
  WaitTimeSeconds: 20,
};

// Initialize retry count
let retryCount = 0;

// Helper function to calculate exponential backoff
const calculateExponentialBackoff = (retryCount: number): number => {
  const baseDelay = 1000; // 1 second
  return baseDelay * Math.pow(2, retryCount);
};

// Helper function to delete a message from the SQS queue
const deleteMessageFromQueue = async (receiptHandle: string): Promise<void> => {
  const deleteParams = {
    QueueUrl: queueURL,
    ReceiptHandle: receiptHandle,
  };
  const command = new DeleteMessageCommand(deleteParams);
  await client.send(command);
  console.log(
    `Deleted message with receipt handle: ${receiptHandle} from SQS queue`,
  );
};

const pollMessages = async () => {
  const command = new ReceiveMessageCommand(params);
  try {
    const { Messages } = await client.send(command);

    if (Messages) {
      const inputs: EmbedderInput[] = []; // Explicitly type the array as EmbedderInput[]

      for (const message of Messages) {
        console.log(`Received message: %o`, message);
        // Process message

        if (!message.Body) {
          console.error("Message does not contain a body:", message);
          continue; // Skip this message and continue with the next
        }

        try {
          const envelope = JSON.parse(message.Body);
          console.log("envelope: %o", envelope);

          const payload = envelope.payload
          console.log(`payload: %o`, payload);
          console.log(`typeof payload: ${typeof payload}`)

          // Ensure the payload has the expected structure before proceeding
          if (!payload.new || !payload.new.id || !payload.new.description) {
            console.error(
              `Payload does not contain expected properties: `,
              payload,
            );
            continue;
          }

          // Create EmbedderInput and process message
          inputs.push({
            id: payload.new.id.toString(),
            text: payload.new.description,
            metadata: Object.entries(payload.new).reduce(
              (meta, [key, value]) => {
                if (value !== null && value !== undefined) {
                  const metadataValue: RecordMetadataValue = Array.isArray(
                    value,
                  )
                    ? value.filter(
                      (item): item is string => typeof item === "string",
                    )
                    : typeof value === "string" ||
                      typeof value === "number" ||
                      typeof value === "boolean"
                      ? value
                      : value.toString();
                  meta[key as keyof RecordMetadata] = metadataValue;
                }
                return meta;
              },
              {} as RecordMetadata,
            ),
          });

          const mode = "serial";
          console.log(`inputs: %o`, inputs);
          await orchestrate(inputs, mode);

          await deleteMessageFromQueue(message.ReceiptHandle as string);

          // Reset retryCount after successful processing
          retryCount = 0;
        } catch (jsonError) {
          console.error("Error parsing message body:", message.Body, jsonError);
        }
      }
    }

    // Prevent an overly active loop if no messages were found
    if (!Messages || Messages.length === 0) {
      console.log("No messages received, polling again in 1 second.");
      setTimeout(pollMessages, 1000); // Wait for 1 second before polling again
      return;
    }

    // Continue polling for new messages
    setImmediate(pollMessages);
  } catch (err) {
    console.error("Error receiving messages:", err);
    const retryDelay = calculateExponentialBackoff(retryCount);
    retryCount++;
    setTimeout(pollMessages, retryDelay);
  }
};

pollMessages();
