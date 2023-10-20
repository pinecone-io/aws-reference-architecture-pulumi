import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { VpcSubnetType } from "@pulumi/awsx/classic/ec2";

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77


/**
 * Networking
 */
// Create VPC & subnets
// TODO - fix conflicts
const vpc = new awsx.classic.ec2.Vpc("vpc", {
  cidrBlock: "10.0.0.0/16",
  subnets: [
    {
      name: "public-subnet",
      type: "public" as VpcSubnetType,
      location: "10.0.0.0/18",
    },
    {
      name: "db-subnet",
      type: "private" as VpcSubnetType,
      location: "10.0.64.0/18",
    },
    {
      name: "pelican-subnet",
      type: "private" as VpcSubnetType,
      location: "10.0.192.0/18"
    },
  ]
});

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
  subnets: vpc.publicSubnetIds,
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
 * Backend - RDS Postrges database
 */

// Configure the RDS security group to only accept traffic from the ECS service's security group
const rdsSecurityGroup = new aws.ec2.SecurityGroup("rdsSecurityGroup", {
  egress: [{
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"],
  }],
  ingress: [{
    protocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    securityGroups: frontendCluster.securityGroups.map(sg => sg.id), // Referencing ECS cluster's security groups
  }],
});

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
  subnetIds: vpc.privateSubnetIds,
  tags: {
    Name: 'db-subnet',
  }
})

const db = new aws.rds.Instance("mydb", {
  dbSubnetGroupName: dbSubnetGroup.name,
  engine: "postgres",
  engineVersion: "15.4",
  instanceClass: "db.t3.micro",
  allocatedStorage: 20,
  storageType: "gp2",
  username: process.env.POSTGRES_DB_USER,
  password: process.env.POSTGRES_DB_PASSWORD,
  parameterGroupName: "default.postgres15",
  skipFinalSnapshot: true,
  vpcSecurityGroupIds: [rdsSecurityGroup.id],
});

/**
 * Pelican app Docker registry
 */
const pelicanRepo = new aws.ecr.Repository("pelican");

// Directly use the repository's registryId property to get registry details
const pelicanRegistryId = pelicanRepo.registryId

// Pelican is the microservice that listens to Postgres for changes and forwards changed records to Emu
const pelicanCluster = new awsx.classic.ecs.Cluster("pelican-cluster", {});
const pelicanService = new awsx.classic.ecs.FargateService("pelican-service", {
  cluster: pelicanCluster,
  subnets: vpc.privateSubnetIds,
  assignPublicIp: false,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      image: pulumi.interpolate`${pelicanRepo.repositoryUrl}:latest`,
      cpu: 512,
      memory: 128,
      essential: true,
      environment: [
        { name: "POSTGRES_DB_NAME", value: process.env.POSTGRES_DB_NAME as string },
        { name: "POSTGRES_DB_HOST", value: process.env.POSTGRES_DB_HOST as string },
        { name: "POSTGRES_DB_PORT", value: process.env.POSTGRES_DB_PORT as string },
        { name: "POSTGRES_DB_USER", value: process.env.POSTGRES_DB_USER as string },
        { name: "POSTGRES_DB_PASSWORD", value: process.env.POSTGRES_DB_PASSWORD as string },
        { name: "CERTIFICATE_BASE64", value: process.env.CERTIFICATE_BASE64 as string },
        { name: "EMU_ENDPOINT", value: process.env.EMU_ENDPOINT as string },
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
export const pelicanServiceUrn = pelicanService.urn

export const dbEndpoint = db.endpoint;

export const bucketName = bucket.id;
export const deadLetterQueueId = deadletterQueue.id
export const jobQueueId = jobQueue.id
export const ecrRegistryId = registryId
export const pelicanEcrRegistryId = pelicanRegistryId 
