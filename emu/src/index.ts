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
import logger from "./logger"
import worker_id from "./workerIdSingleton"

config();

logger.info({
  message: 'starting up',
  service: 'emu',
  worker_id,
  action: 'startup',
})

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
  logger.info({
    message: `Deleted message with receipt handle: ${receiptHandle} from SQS queue`,
    service: 'emu',
    worker_id,
    action: 'deleted_sqs_message',
  });
};

const pollMessages = async () => {

  logger.info({
    message: 'polling',
    service: 'emu',
    worker_id,
    action: 'polling',
  })

  const command = new ReceiveMessageCommand(params);
  try {
    const { Messages } = await client.send(command);

    if (Messages) {
      const inputs: EmbedderInput[] = []; // Explicitly type the array as EmbedderInput[]

      for (const message of Messages) {
        logger.info({
          message: `Received message`,
          body: message,
          service: 'emu',
          worker_id,
          action: 'received_message',
        })


        // Process message
        if (!message.Body) {
          logger.info({
            message: `Message does not contain a body: ${message}`,
            service: 'emu',
            worker_id,
            action: 'message_missing_body',
          })
          continue; // Skip this message and continue with the next
        }

        try {
          const payload = JSON.parse(message.Body);

          logger.info({
            message: `Parsed payload`,
            payload,
            service: 'emu',
            worker_id,
            action: 'parsed_payload',
          });

          // Ensure the payload has the expected structure before proceeding
          if (!payload.new || !payload.new.id || !payload.new.description) {
            logger.error({
              message: `Payload does not contain expected properties: ${payload}`,
              service: 'emu',
              worker_id,
              action: 'payload_missing_properties',
            });
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
          await orchestrate(inputs, mode);

          await deleteMessageFromQueue(message.ReceiptHandle as string);

          // Reset retryCount after successful processing
          retryCount = 0;
        } catch (jsonError) {
          logger.error({
            message: `Error parsing message body: ${message.Body}, ${jsonError}`,
            service: 'emu',
            worker_id,
            action: 'error_parsing_message_body',
          });
        }
      }
    }

    // Prevent an overly active loop if no messages were found
    if (!Messages || Messages.length === 0) {
      //console.log("No messages received, polling again in 1 second.");
      logger.info({
        message: 'No messages received, polling again in 1 second.',
        service: 'emu',
        worker_id,
        action: 'polling_restart',
      })

      setTimeout(pollMessages, 1000); // Wait for 1 second before polling again
      return;
    }

    // Continue polling for new messages
    setImmediate(pollMessages);
  } catch (err) {
    logger.error({
      message: 'Error receiving messages',
      err,
      service: 'emu',
      worker_id,
      action: 'error_receiving_messages',
    })
    const retryDelay = calculateExponentialBackoff(retryCount);
    retryCount++;
    setTimeout(pollMessages, retryDelay);
  }
};

pollMessages();
