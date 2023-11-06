import AWS, { AWSError, SQS } from "aws-sdk";
import { config } from "dotenv";

import { EmbedderInput } from "./embedder";
import { orchestrate } from "./orchestrator";
import { ReceiveMessageResult } from "aws-sdk/clients/sqs";
config();

const checkEnvVars = () => {
  const requiredVars = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "SQS_QUEUE_URL",
  ];
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
  err: AWSError,
  data: ReceiveMessageResult,
) {
  if (err) {
    console.log("Receive Error", err);
  } else if (data.Messages) {
    const inputs: EmbedderInput[] = [];
    data.Messages.forEach((message) => {
      const payload = JSON.parse(message.Body!).payload;

      inputs.push({
        id: payload.new.id,
        text: payload.new.description,
        metadata: { ...payload.new },
      });

      //TODO: Delete messages
    });

    const mode = "serial";

    await orchestrate<Metadata>(inputs, mode);
  }
};

sqs.receiveMessage(params, handleMessages);
