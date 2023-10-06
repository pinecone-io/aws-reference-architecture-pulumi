import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77


/**
 * Supporting resources
 */
// Create an S3 bucket to store video frames
const bucket = new aws.s3.Bucket("input-bucket");

// Create an SNS topic to handle dead letter notifications
const sns = new aws.sns.Topic("failed-jobs")

// Create an SQS queue to handle dead letters
const deadletterQueue = new aws.sqs.Queue("dead-letter")

// Create an SQS queue to handle jobs messages - and configure it to send its failed jobs to 
// the dead letter queue
const jobQueue = new aws.sqs.Queue("job-queue", {
  redrivePolicy: deadletterQueue.arn.apply(arn => JSON.stringify({
    deadLetterTargetArn: arn,
    maxReceiveCount: 4,
  }))
});

// Create an Elastic Container Registry (ECR) to hold Docker images we plan to ship for the workers
const registry = new aws.ecr.Repository("docker-registry")

/**
 * Worker tier
 */
// Create an array to hold the worker servers we've created
let workerServers = [];

// Create 4 worker EC2 instances, all using the same Amazon Machine Image (AMI) and instance type
for (var i = 0; i < 4; i++) {
  const workerServer = new aws.ec2.Instance(`worker-${i}`, { ami: "ami-067d1e60475437da2", instanceType: "t2.micro" })
  workerServers.push(workerServer.id)
}

/**
 * Exports
 *
 * Whatever values are exported here will be output in pulumi's terminal output that displays following an update:
 */
export const bucketName = bucket.id;
export const deadLetterQueueId = deadletterQueue.id
export const jobQueueId = jobQueue.id
export const registryId = registry.id
export const workerInstanceIds = workerServers.forEach((id) => id)
