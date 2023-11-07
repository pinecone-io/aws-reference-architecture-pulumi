import * as pulumi from "@pulumi/pulumi"
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import checkEnvVars from "./utils"

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77
//

// Sanity check that all required environment variables are defined, and error 
// out with a helpful message about which ones are unset if not
checkEnvVars();

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


const targetDbPort = 5432;

/**
 * Docker image builds
 */
// The frontend image runs the semantic-search-postgres app 
// which exposes a searchable table UI to users filled with products 
// that can be edited. When a product is edited, the frontend app 
// persists the change to the RDS Postgres instance running in the private
// subnet. The pelican microservice listens to the RDS Postgres database for 
// changes and places those changes on the SQS queue
const frontendImage = new awsx.ecr.Image("frontendImage", {
  repositoryUrl: frontendRepo.url,
  path: "./semantic-search-postgres",
  // These two values must be passed in as build-args, otherwise the call to `new Pinecone();`
  // fails. They are also set as environment variables
  args: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`
  },
  env: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`,
    "PINECONE_INDEX": `${process.env.PINECONE_INDEX}`,
    "OPENAI_API_KEY": `${process.env.OPENAI_API_KEY}`,
    "POSTGRES_DB_NAME": `postgres`,
    "POSTGRES_DB_HOST": `${process.env.POSTGRES_DB_HOST}`,
    "POSTGRES_DB_PORT": targetDbPort.toString(),
    "POSTGRES_DB_USER": `${process.env.POSTGRES_DB_USER}`,
    "POSTGRES_DB_PASSWORD": `${process.env.POSTGRES_DB_PASSWORD}`,
  }
})

// The pelican microservice is concerned with listening for changes in the RDS Postgres
// Database. The RDS Postgres database is configured with Postgres triggers as defined in 
// the rds_postgres_schema.sql file in the root of this project
// These triggers are run on table changes, leading to the old and 
// new records being emitted, picked up by Pelican and placed on the SQS job queue
const pelicanImage = new awsx.ecr.Image("pelicanImage", {
  repositoryUrl: pelicanRepo.url,
  path: "./pelican",
  env: {
    "POSTGRES_DB_NAME": `postgres`,
    "POSTGRES_DB_HOST": `${process.env.POSTGRES_DB_HOST}`,
    "POSTGRES_DB_PORT": targetDbPort.toString(),
    "POSTGRES_DB_USER": `postgres`,
    "POSTGRES_DB_PASSWORD": `${process.env.POSTGRES_DB_PASSWORD}`,
    "AWS_REGION": `${process.env.AWS_REGION}` || 'us-east-1',
    "SQS_QUEUE_URL": `${process.env.SQS_QUEUE_URL}`
  }
})

// Emu is the EMbedding and Upsert (Emu) service, which handles converting the 
// changed records and product descriptions in to embeddings and upserting them 
// into the Pinecone index. It runs as a separate ECS service in the private subnet
const emuImage = new awsx.ecr.Image("emuImage", {
  repositoryUrl: emuRepo.url,
  path: "./emu",
  args: {
    "PINECONE_INDEX": `${process.env.PINECONE_INDEX}`,
    "PINECONE_NAMESPACE": `${process.env.PINECONE_NAMESPACE}`
  },
  env: {
    "PINECONE_API_KEY": `${process.env.PINECONE_API_KEY}`,
    "PINECONE_ENVIRONMENT": `${process.env.PINECONE_ENVIRONMENT}`,
    "PINECONE_INDEX": `${process.env.PINECONE_INDEX}`,
    "PINECONE_NAMESPACE": `${process.env.PINECONE_NAMESPACE}`,
    "AWS_REGION": `${process.env.AWS_REGION}` || 'us-east-1',
    "SQS_QUEUE_URL": `${process.env.SQS_QUEUE_URL}`
  }
})

// Frontend UI ECS Service
// This is the user-facing UI service, so it is avalable to the public internet 
// and therefore runs in the public subnet
const frontendCluster = new awsx.classic.ecs.Cluster("cluster", {
  vpc,
});

/**
* Backend - RDS Postgres database
*/
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
  subnetIds: vpcPrivateSubnetIds,
})

const pelicanSecurityGroup = new aws.ec2.SecurityGroup("pelicanSecurityGroup", {
  vpcId: vpc.vpc.id,
  egress: [{
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"],
  }],
});

const emuSecurityGroup = new aws.ec2.SecurityGroup("emuSecurityGroup", {
  vpcId: vpc.vpc.id,
  egress: [{
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"],
  }],
})

// Configure the RDS security group to only accept traffic from the pelican ECS 
// service's security group. This allows us to keep access to the RDS Postgres 
// instance locked down - only the frontend UI and Pelican microservice can 
// reach the database directly 
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
    // Grant the frontend UI's security group access to the RDS Postgres database
    securityGroups: frontendCluster.securityGroups.map(sg => sg.id).concat(pelicanSecurityGroup.id.apply(i => i))
  }],
});

// Postgres database
// This RDS Postgres database stores product information and natural language descriptions
// of each product. When a record is edited by the user on the frontend table UI, the 
// record is updated in this Postgres instance, which then fires the notification triggers
// which the Pelican microservice is listening for
const db = new aws.rds.Instance("mydb", {
  // This RDS snapshot has the products_with_increment table already created and is populated with the data from 
  // data/products_no_ids.csv
  snapshotIdentifier: "arn:aws:rds:us-east-1:675304494746:snapshot:pinecone-aws-ref-arch-postgres-db-snapshot",
  dbSubnetGroupName: dbSubnetGroup.name,
  engine: "postgres",
  engineVersion: "15.4",
  instanceClass: "db.t3.micro",
  allocatedStorage: 20,
  storageType: "gp2",
  username: "postgres",
  password: process.env.POSTGRES_DB_PASSWORD,
  parameterGroupName: "default.postgres15",
  skipFinalSnapshot: true,
  vpcSecurityGroupIds: [rdsSecurityGroup.id],
  port: targetDbPort,
});

export const dbName = db.name
export const dbAddress = db.address.apply(a => a);
export const dbPort = db.port.apply(p => p)
export const dbUser = db.username
export const dbPassword = db.password.apply(p => p)


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

// SQS IAM Policy granting access to send messages and get queue URL and attributes
const sqsPolicy = new aws.iam.Policy("sqsPolicy", {
  policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "sqs:SendMessage",
                "sqs:GetQueueUrl",
                "sqs:GetQueueAttributes"
            ],
            "Resource": "${jobQueue.arn}"
        }]
    }`
});

const ecsTaskExecutionRole = new aws.iam.Role("ecsTaskExecutionRole", {
  assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {
                "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }]
    }`
});

new aws.iam.RolePolicyAttachment("sqsPolicyAttachment", {
  role: ecsTaskExecutionRole.name,
  policyArn: sqsPolicy.arn
});

const sqsReadPolicy = new aws.iam.Policy("sqsReadPolicy", {
  policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": [
                "sqs:ReceiveMessage",
                "sqs:GetQueueUrl",
                "sqs:GetQueueAttributes"
            ],
            "Resource": "${jobQueue.arn}"
        }]
    }`
});

const ecsEmuTaskExecutionRole = new aws.iam.Role("ecsEmuTaskExecutionRole", {
  assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {
                "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }]
    }`
});

new aws.iam.RolePolicyAttachment("sqsReadPolicyAttachment", {
  role: ecsEmuTaskExecutionRole.name,
  policyArn: sqsReadPolicy.arn
});

export const jobQueueId = jobQueue.id
export const jobQueueUrl = jobQueue.url

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
        { name: "POSTGRES_DB_NAME", value: dbName.apply(n => n) },
        // Pass in the hostname and port of the RDS Postgres instance so the frontend knows where to find it
        { name: "POSTGRES_DB_HOST", value: dbAddress.apply(a => a) },
        { name: "POSTGRES_DB_PORT", value: dbPort.apply(p => p.toString()) },
        { name: "POSTGRES_DB_USER", value: dbUser.apply(u => u) },
        { name: "POSTGRES_DB_PASSWORD", value: dbPassword.apply(p => p as unknown as string) },
      ],
    },
  },
});

const pelicanService = new awsx.classic.ecs.FargateService("pelican-service", {
  cluster: pelicanCluster,
  subnets: vpcPrivateSubnetIds,
  securityGroups: [pelicanSecurityGroup.id.apply(i => i)],
  assignPublicIp: false,
  desiredCount: 2,
  taskDefinitionArgs: {
    taskRole: ecsTaskExecutionRole,
    container: {
      image: pelicanImage.imageUri,
      cpu: 512,
      memory: 1024,
      essential: true,
      environment: [
        { name: "POSTGRES_DB_NAME", value: `postgres` },
        { name: "POSTGRES_DB_HOST", value: dbAddress.apply(a => a) },
        { name: "POSTGRES_DB_PORT", value: targetDbPort.toString() },
        { name: "POSTGRES_DB_USER", value: dbUser.apply(u => u) },
        { name: "POSTGRES_DB_PASSWORD", value: dbPassword.apply(p => p as unknown as string) },
        { name: "AWS_REGION", value: process.env.AWS_REGION ?? 'us-east-1' },
        { name: "SQS_QUEUE_URL", value: jobQueueUrl }
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
  securityGroups: [emuSecurityGroup.id],
  assignPublicIp: false,
  desiredCount: 2,
  taskDefinitionArgs: {
    taskRole: ecsEmuTaskExecutionRole,
    container: {
      image: emuImage.imageUri,
      cpu: 4096,
      memory: 8192,
      essential: true,
      environment: [
        { name: "PINECONE_INDEX", value: process.env.PINECONE_INDEX as string },
        { name: "PINECONE_NAMESPACE", value: process.env.PINECONE_NAMESPACE as string },
        { name: "AWS_REGION", value: process.env.AWS_REGION ?? "us-east-1" },
        { name: "SQS_QUEUE_URL", value: jobQueueUrl }
      ],
    },
  },
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
