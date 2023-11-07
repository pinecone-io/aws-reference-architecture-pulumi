import AWS, { AWSError, SQS } from "aws-sdk";
import { config } from "dotenv";

import {
  RecordMetadata,
  RecordMetadataValue,
} from "@pinecone-database/pinecone";

import { EmbedderInput } from "./embedder";
import { orchestrate } from "./orchestrator";
import { ReceiveMessageResult, Message } from "aws-sdk/clients/sqs";
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

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const sqs = new SQS({ region: process.env.AWS_REGION });
const queueURL = process.env.SQS_QUEUE_URL!;

const params = {
  AttributeNames: ["SentTimestamp"],
  MaxNumberOfMessages: 10,
  MessageAttributeNames: ["All"],
  QueueUrl: queueURL,
  VisibilityTimeout: 20,
  WaitTimeSeconds: 0,
};

const handleMessages = async function (
  err: AWSError | null, // Error should be AWSError or null
  data: ReceiveMessageResult, // Data should be of type ReceiveMessageResult
) {
  console.log("handleMessages: ");
  if (err) {
    console.log("Receive Error", err);
  } else if (data.Messages) {
    const inputs: EmbedderInput[] = []; // Explicitly type the array as EmbedderInput[]
    data.Messages.forEach((message: Message) => {
      // Message should be of type Message
      // First, parse the Body to get the payload string
      const body = JSON.parse(message.Body as string); // Assert that Body is a string
      // Then, parse the payload string to get the actual object
      const payload = JSON.parse(body.payload);
      console.log("payload: %o", payload);

      inputs.push({
        id: payload.new.id.toString(),
        text: payload.new.description,
        metadata: Object.entries(payload.new).reduce((meta, [key, value]) => {
          // Skip null and undefined values
          if (value !== null && value !== undefined) {
            // Assert that value is of type RecordMetadataValue
            const metadataValue: RecordMetadataValue = Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string") // Keep only strings in arrays
              : typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ? value
              : value.toString(); // Convert other types to string
            // TypeScript needs assertion for key to be of type keyof T where T extends RecordMetadata
            meta[key as keyof RecordMetadata] = metadataValue;
          }
          return meta;
        }, {} as RecordMetadata), // Assert the accumulator as RecordMetadata
      });

      // TODO: Delete messages
      // Remember to handle message deletion after processing
    });

    const mode = "serial";

    console.log(`inputs: %o`, inputs);

    // Assuming orchestrate function is correctly defined and imported
    // Also assuming that the EmbedderInput and Metadata types are correctly defined
    await orchestrate(inputs, mode);
  }
};

sqs.receiveMessage(params, handleMessages);
