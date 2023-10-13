import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as process from 'process'

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77

/**
 * Frontend app ECS Service and Docker registry
 */

const repo = new aws.ecr.Repository("frontend");

// Directly use the repository's registryId property to get registry details
const registryId = repo.registryId

// This is an object containing authentication information to the ECR registry containing the docker image
const registryInfo = registryId.apply(async (id) => {
  const credentials = await aws.ecr.getCredentials({ registryId: id });
  // Decode the authorization token from base64
  const decodedToken = Buffer.from(credentials.authorizationToken, 'base64').toString();
  // The token is in format USERNAME:PASSWORD
  const [username, password] = decodedToken.split(':');
  return {
    server: id,
    username,
    password,
  }
});

const cluster = new aws.ecs.Cluster("cluster");

const service = new awsx.ecs.FargateService("app-svc", {
  cluster: cluster.name,
  taskDefinitionArgs: {
    containers: {
      app: {
        name: "frontend-service",
        image: pulumi.interpolate`${repo.repositoryUrl}:latest`,
        memory: 512,
        portMappings: [{ name: "frontend", containerPort: 3000 }],
        environment: [
          { name: "PINECONE_API_KEY", value: process.env.PINECONE_API_KEY },
          { name: "PINECONE_ENVIRONMENT", value: process.env.PINECONE_ENVIRONMENT },
          { name: "PINECONE_INDEX", value: process.env.PINECONE_INDEX },
          { name: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY },
          { name: "POSTGRES_DB_NAME", value: process.env.POSTGRES_DB_NAME },
          { name: "POSTGRES_DB_HOST", value: process.env.POSTGRES_DB_HOST },
          { name: "POSTGRES_DB_PORT", value: process.env.POSTGRES_DB_PORT },
          { name: "POSTGRES_DB_USER", value: process.env.POSTGRES_DB_USER },
          { name: "POSTGRES_DB_PASSWORD", value: process.env.POSTGRES_DB_PASSWORD },
          { name: "CERTIFICATE_BASE64", value: process.env.CERTIFICATE_BASE64 },
        ],
      },
    },
  },
  desiredCount: 1,
  assignPublicIp: true,
});

const autoscaling = new aws.appautoscaling.Policy("autoscaling", {
  resourceId: pulumi.interpolate`service/${cluster.name}/${service.service.name}`,
  serviceNamespace: "ecs",
  scalableDimension: "ecs:service:DesiredCount",
  policyType: "TargetTrackingScaling",
  targetTrackingScalingPolicyConfiguration: {
    targetValue: 50,
    predefinedMetricSpecification: {
      predefinedMetricType: "ECSServiceAverageCPUUtilization",
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
export const clusterName = cluster.name;
export const serviceName = service.service.name;
export const autoscalingArn = autoscaling.arn

export const bucketName = bucket.id;
export const deadLetterQueueId = deadletterQueue.id
export const jobQueueId = jobQueue.id
export const ecrRegistryId = registryId
