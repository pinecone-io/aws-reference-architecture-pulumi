import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77

/**
 * Networking
 */

// Allocate a new VPC with the default settings:
const vpc = new awsx.classic.ec2.Vpc("custom", {});

// Export a few interesting fields to make them easy to use:
export const vpcId = vpc.id;
export const vpcPrivateSubnetIds = vpc.privateSubnetIds;
export const vpcPublicSubnetIds = vpc.publicSubnetIds;

/**
 * Elastic Container Registry (ECR) repositories
 *
 * We have one repo for each of: 
 * - Frontend (the semantic-search-postgres app)
 * - Pelican microservice (listen for changes from Postgres)
 * - Emu microservice (perform embeddings and upserts to Pinecone)
 */
const frontendRepo = new awsx.ecr.Repository("frontend");
const pelicanRepo = new awsx.ecr.Repository("pelican");
const emuRepo = new awsx.ecr.Repository("emu");

/**
 * Docker image builds
 */
const frontendImage = new awsx.ecr.Image("frontendImage", {
  repositoryUrl: frontendRepo.url,
  path: "./semantic-search-postgres",
  args: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`
  },
  env: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`,
    "PINECONE_INDEX": `${process.env.PINECONE_INDEX}`,
    "OPENAI_API_KEY": `${process.env.OPENAI_API_KEY}`,
    "POSTGRES_DB_NAME": `${process.env.POSTGRES_DB_NAME}`,
    "POSTGRES_DB_HOST": `${process.env.POSTGRES_DB_HOST}`,
    "POSTGRES_DB_PORT": `${process.env.POSTGRES_DB_PORT}`,
    "POSTGRES_DB_USER": `${process.env.POSTGRES_DB_USER}`,
    "POSTGRES_DB_PASSWORD": `${process.env.POSTGRES_DB_PASSWORD}`,
    "CERTIFICATE_BASE64": `${process.env.CERTIFICATE_BASE64}`
  }
})

const pelicanImage = new awsx.ecr.Image("pelicanImage", {
  repositoryUrl: pelicanRepo.url,
  path: "./pelican",
  env: {
    "POSTGRES_DB_NAME": `${process.env.POSTGRES_DB_NAME}`,
    "POSTGRES_DB_HOST": `${process.env.POSTGRES_DB_HOST}`,
    "POSTGRES_DB_PORT": `${process.env.POSTGRES_DB_PORT}`,
    "POSTGRES_DB_USER": `${process.env.POSTGRES_DB_USER}`,
    "POSTGRES_DB_PASSWORD": `${process.env.POSTGRES_DB_PASSWORD}`,
    "CERTIFICATE_BASE64": `${process.env.CERTIFICATE_BASE64}`,
    "EMU_ENDPOINT": `${process.env.EMU_ENDPOINT}`
  }
})

const emuImage = new awsx.ecr.Image("emuImage", {
  repositoryUrl: emuRepo.url,
  path: "./emu",
  env: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`,
    "PINECONE_INDEX": `${process.env.PINECONE_INDEX}`,
    "PINECONE_NAMESPACE": `${process.env.PINECONE_NAMESPACE}`
  }
})

// Frontend UI ECS Service
const frontendCluster = new awsx.classic.ecs.Cluster("cluster", {
  vpc,
});

/**
* Backend - RDS Postgres database
*/
const targetDbPort = 5432;

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
  subnetIds: vpcPrivateSubnetIds,
})

// Configure the RDS security group to only accept traffic from the ECS service's security group
const rdsSecurityGroup = new aws.ec2.SecurityGroup("rdsSecurityGroup", {
  vpcId: vpc.vpc.id,
  egress: [{
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"],
  }],
  ingress: [{
    protocol: "tcp",
    fromPort: targetDbPort,
    toPort: targetDbPort,
    securityGroups: frontendCluster.securityGroups.map(sg => sg.id),
  }],
});

// Postgres database
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
  port: targetDbPort,
});

export const dbEndpoint = db.endpoint;
export const dbPort = db.port

/**
 * Frontend application ECS service and networking 
 */
const alb = new awsx.classic.lb.ApplicationLoadBalancer("lb", { vpc, external: true, securityGroups: frontendCluster.securityGroups });

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

const pelicanCluster = new awsx.classic.ecs.Cluster("pelicanCluster", {
  vpc,
});

const frontendService = new awsx.classic.ecs.FargateService("service", {
  cluster: frontendCluster,
  subnets: vpcPublicSubnetIds,
  assignPublicIp: true,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      image: frontendImage.imageUri,
      cpu: 512,
      memory: 1024,
      essential: true,
      portMappings: [listener],
      environment: [
        { name: "PINECONE_API_KEY", value: process.env.PINECONE_API_KEY as string },
        { name: "PINECONE_ENVIRONMENT", value: process.env.PINECONE_ENVIRONMENT as string },
        { name: "PINECONE_INDEX", value: process.env.PINECONE_INDEX as string },
        { name: "OPENAI_API_KEY", value: process.env.OPENAI_API_KEY as string },
        { name: "POSTGRES_DB_NAME", value: process.env.POSTGRES_DB_NAME as string },
        // Pass in the hostname and port of the RDS Postgres instance so the frontend knows where to find it
        { name: "POSTGRES_DB_HOST", value: dbEndpoint },
        { name: "POSTGRES_DB_PORT", value: dbPort.toString() },
        { name: "POSTGRES_DB_USER", value: process.env.POSTGRES_DB_USER as string },
        { name: "POSTGRES_DB_PASSWORD", value: process.env.POSTGRES_DB_PASSWORD as string },
        { name: "CERTIFICATE_BASE64", value: process.env.CERTIFICATE_BASE64 as string },
      ],
    },
  },
});

const pelicanService = new awsx.classic.ecs.FargateService("pelican-service", {
  cluster: pelicanCluster,
  subnets: vpcPrivateSubnetIds,
  securityGroups: [rdsSecurityGroup.id],
  assignPublicIp: false,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      image: pelicanImage.imageUri,
      cpu: 512,
      memory: 1024,
      essential: true,
      environment: [
        { name: "POSTGRES_DB_NAME", value: process.env.POSTGRES_DB_NAME as string },
        { name: "POSTGRES_DB_HOST", value: dbEndpoint },
        { name: "POSTGRES_DB_PORT", value: dbPort.toString() },
        { name: "POSTGRES_DB_USER", value: process.env.POSTGRES_DB_USER as string },
        { name: "POSTGRES_DB_PASSWORD", value: process.env.POSTGRES_DB_PASSWORD as string },
        { name: "CERTIFICATE_BASE64", value: process.env.CERTIFICATE_BASE64 as string },
        { name: "EMU_ENDPOINT", value: process.env.EMU_ENDPOINT as string },
      ],
    },
  },
});

/**
 * EMU: the emu microservice handles embeddings and upserts to the Pinecone index
 */
const emuCluster = new awsx.classic.ecs.Cluster("emuCluster", {
  vpc,
});

const emuService = new awsx.classic.ecs.FargateService("emu-service", {
  cluster: emuCluster,
  subnets: vpcPrivateSubnetIds,
  securityGroups: [rdsSecurityGroup.id],
  assignPublicIp: false,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      image: emuImage.imageUri,
      cpu: 4096,
      memory: 8192,
      essential: true,
      environment: [
        { name: "PINECONE_INDEX", value: process.env.PINECONE_INDEX as string },
        { name: "PINECONE_NAMESPACE", value: process.env.PINECONE_NAMESPACE as string },
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

// Networking
export const frontendServiceUrl = alb.loadBalancer.dnsName;

// Service URNs
export const serviceUrn = frontendService.urn
export const pelicanServiceUrn = pelicanService.urn
export const emuServiceUrn = emuService.urn

export const bucketName = bucket.id;
export const deadLetterQueueId = deadletterQueue.id
export const jobQueueId = jobQueue.id
