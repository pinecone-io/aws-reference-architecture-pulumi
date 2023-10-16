import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77

/**
 * Frontend app Docker registry
 */
const repo = new aws.ecr.Repository("frontend");

// Directly use the repository's registryId property to get registry details
const registryId = repo.registryId

/**
 * Frontend application ECS service and networking 
 */
const frontendCluster = new awsx.classic.ecs.Cluster("cluster", {});
const alb = new awsx.classic.lb.ApplicationLoadBalancer("lb", { external: true, securityGroups: frontendCluster.securityGroups });

const targetGroup = alb.createTargetGroup("frontend", {
  port: 3000,
  targetType: "ip",
  protocol: "HTTP",
})

// Create a Listener that listens on port 80 and forwards traffic to the new Target Group
const listener = alb.createListener("listener", {
  port: 80,
  targetGroup: targetGroup,
});

const frontendService = new awsx.classic.ecs.FargateService("service", {
  cluster: frontendCluster,
  assignPublicIp: true,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      image: pulumi.interpolate`${repo.repositoryUrl}:latest`,
      cpu: 512,
      memory: 128,
      essential: true,
      portMappings: [listener],
      environment: [
        { name: "PINECONE_API_KEY", value: process.env.PINECONE_API_KEY as string },
        { name: "PINECONE_ENVIRONMENT", value: process.env.PINECONE_ENVIRONMENT as string },
        { name: "PINECONE_INDEX", value: process.env.PINECONE_INDEX as string },
        { name: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY as string },
        { name: "POSTGRES_DB_NAME", value: process.env.POSTGRES_DB_NAME as string },
        { name: "POSTGRES_DB_HOST", value: process.env.POSTGRES_DB_HOST as string },
        { name: "POSTGRES_DB_PORT", value: process.env.POSTGRES_DB_PORT as string },
        { name: "POSTGRES_DB_USER", value: process.env.POSTGRES_DB_USER as string },
        { name: "POSTGRES_DB_PASSWORD", value: process.env.POSTGRES_DB_PASSWORD as string },
        { name: "CERTIFICATE_BASE64", value: process.env.CERTIFICATE_BASE64 as string },
      ],
    },
  },
});

/**
 * Supporting resources
 */
// Create an S3 bucket to store video frames
const bucket = new aws.s3.Bucket("input-bucket");

// Create an SQS queue to handle dead letters
const deadletterQueue = new aws.sqs.Queue("dead-letter")

// Create an SNS topic to handle dead letter notifications
const deadLetterTopic = new aws.sns.Topic("failed-jobs")

// Subscribe to the SNS Topic
new aws.sns.TopicSubscription("dlQueueSubscription", {
  topic: deadLetterTopic.arn,
  protocol: "sqs",
  endpoint: deadletterQueue.arn
});

// Create an SQS queue to handle jobs messages - and configure it to send its failed jobs to 
// the dead letter queue
const jobQueue = new aws.sqs.Queue("job-queue", {
  redrivePolicy: deadletterQueue.arn.apply(arn => JSON.stringify({
    deadLetterTargetArn: arn,
    maxReceiveCount: 4,
  }))
});

/**
 * Exports
 *
 * Whatever values are exported here will be output in pulumi's terminal output that displays following an update:
 */
export const repositoryUrl = repo.repositoryUrl;

export const frontendServiceUrl = alb.loadBalancer.dnsName;
export const serviceUrn = frontendService.urn

export const bucketName = bucket.id;
export const deadLetterQueueId = deadletterQueue.id
export const jobQueueId = jobQueue.id
export const ecrRegistryId = registryId
