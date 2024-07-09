import * as pulumi from "@pulumi/pulumi";
import * as pinecone from "@pinecone-database/pulumi";
import * as docker from "@pulumi/docker";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

import { makeSsmParameterSecrets } from "./secrets";

const config = new pulumi.Config();

const AWS_REGION = aws.config.requireRegion();
const PINECONE_API_KEY = config.requireSecret("PINECONE_API_KEY");
const PINECONE_INDEX = config.require("PINECONE_INDEX");
const PELICAN_BATCH_SIZE = config.getNumber("PELICAN_BATCH_SIZE") ?? 1000;

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77
//
//

/**
 * Networking
 */

// Allocate a new VPC with the default settings:
const vpc = new awsx.ec2.Vpc("pinecone-ref-arch", {
	// A single NAT Gateway (instead of the default of 1 per AZ) is fine:
	natGateways: {
		strategy: "Single"
	}
});

const pineconeProvider = new pinecone.Provider("pinecone-provider", {
	APIKey: PINECONE_API_KEY
});

// Provision Pinecone index
const pineconeIndex = new pinecone.PineconeIndex("pinecone-index", {
	name: PINECONE_INDEX,
	metric: pinecone.IndexMetric.Cosine,
	dimension: 384,
	spec: {
		serverless: {
			cloud: pinecone.ServerlessSpecCloud.Aws,
			region: AWS_REGION,
		},
	},
}, { provider: pineconeProvider });

/**
 * Elastic Container Registry (ECR) repositories
 *
 * We have one repo for each of:
 * - Frontend (the semantic-search-postgres app)
 * - Pelican microservice (listen for changes from Postgres)
 * - Emu microservice (perform embeddings and upserts to Pinecone)
 */

const frontendRepo = new aws.ecr.Repository("frontend-repo", {
	forceDelete: true,
});

// Get frontend repo info (creds and endpoint) so we can build/publish to it.
const frontendRegistryInfo = frontendRepo.registryId.apply(async (id) => {
	const credentials = await aws.ecr.getCredentials({ registryId: id });
	const decodedCredentials = Buffer.from(
		credentials.authorizationToken,
		"base64",
	).toString();
	const [username, password] = decodedCredentials.split(":");
	if (!password || !username) {
		throw new Error("Invalid credentials");
	}
	return {
		server: credentials.proxyEndpoint,
		username: username,
		password: password,
	};
});

const pelicanRepo = new aws.ecr.Repository("pelican-repo", {
	forceDelete: true,
});

// Get pelican registry info (creds and endpoint) so we can build/publish to it.
const registryInfo = pelicanRepo.registryId.apply(async (id) => {
	const credentials = await aws.ecr.getCredentials({ registryId: id });
	const decodedCredentials = Buffer.from(
		credentials.authorizationToken,
		"base64",
	).toString();
	const [username, password] = decodedCredentials.split(":");
	if (!password || !username) {
		throw new Error("Invalid credentials");
	}
	return {
		server: credentials.proxyEndpoint,
		username: username,
		password: password,
	};
});

const emuRepo = new aws.ecr.Repository("emu-repo", {
	forceDelete: true,
});

const emuRegistryInfo = emuRepo.registryId.apply(async (id) => {
	const credentials = await aws.ecr.getCredentials({ registryId: id });
	const decodedCredentials = Buffer.from(
		credentials.authorizationToken,
		"base64",
	).toString();
	const [username, password] = decodedCredentials.split(":");
	if (!password || !username) {
		throw new Error("Invalid credentials");
	}
	return {
		server: credentials.proxyEndpoint,
		username: username,
		password: password,
	};
});

/**
 * Backend - RDS Postgres database
 */
const targetDbPort = 5432;
// The Reference Architecture uses a public RDS snapshot to give everyone the same checkpoint
// and to preload sample data into the database. For that reason, the password for the public
// snapshot, which contains only fake products data, is the same
const dbSnapshotPassword = "AVNS_UhAVnXgK9zFnxOH1-Hj";

const pelicanSecurityGroup = new aws.ec2.SecurityGroup(
	"pelican-security-group",
	{
		vpcId: vpc.vpcId,
		egress: [
			{
				protocol: "-1",
				fromPort: 0,
				toPort: 0,
				cidrBlocks: ["0.0.0.0/0"],
			},
		],
	},
);

const frontendPort = 3000;

// Create a security group for the load balancer
const lbSecurityGroup = new aws.ec2.SecurityGroup("lb-security-group", {
	vpcId: vpc.vpcId,
	egress: [
		{
			protocol: "tcp",
			fromPort: frontendPort,
			toPort: frontendPort,
			cidrBlocks: [vpc.vpc.cidrBlock],
		},
	],
	ingress: [
		{
			protocol: "tcp",
			fromPort: 80,
			toPort: 80,
			cidrBlocks: ["0.0.0.0/0"],
		},
	],
});

// Create a security group for the frontend service
const frontendSecurityGroup = new aws.ec2.SecurityGroup(
	"frontend-security-group",
	{
		vpcId: vpc.vpcId,
		egress: [
			{
				protocol: "-1",
				fromPort: 0,
				toPort: 0,
				cidrBlocks: ["0.0.0.0/0"],
			},
		],
		ingress: [
			{
				protocol: "tcp",
				fromPort: frontendPort,
				toPort: frontendPort,
				securityGroups: [lbSecurityGroup.id],
			},
		],
	},
);

// Configure the RDS security group to only accept traffic from the pelican ECS
// service's security group. This allows us to keep access to the RDS Postgres
// instance locked down - only the frontend UI and Pelican microservice can
// reach the database directly
const rdsSecurityGroup = new aws.ec2.SecurityGroup("rds-security-group", {
	vpcId: vpc.vpcId,
	egress: [
		{
			protocol: "-1",
			fromPort: 0,
			toPort: 0,
			cidrBlocks: ["0.0.0.0/0"],
		},
	],
	ingress: [
		{
			protocol: "tcp",
			fromPort: targetDbPort,
			toPort: targetDbPort,
			// Grant the frontend UI's security group access to the RDS Postgres database
			securityGroups: [frontendSecurityGroup.id, pelicanSecurityGroup.id],
		},
	],
});

const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
	subnetIds: vpc.privateSubnetIds,
});

const emuSecurityGroup = new aws.ec2.SecurityGroup("emu-security-group", {
	vpcId: vpc.vpcId,
	egress: [
		{
			protocol: "-1",
			fromPort: 0,
			toPort: 0,
			cidrBlocks: ["0.0.0.0/0"],
		},
	],
});

// Postgres database
// This RDS Postgres database stores product information and natural language descriptions
// of each product. When a record is edited by the user on the frontend table UI, the
// record is updated in this Postgres instance, which then fires the notification triggers
// which the Pelican microservice is listening for
const db = new aws.rds.Instance("mydb", {
	// This RDS snapshot has the products_with_increment table already created and is populated with the data from
	// data/products_no_ids.csv
	snapshotIdentifier:
		"arn:aws:rds:us-west-2:675304494746:snapshot:pinecone-aws-refarch-postgres-snapshot-v5",
	dbSubnetGroupName: dbSubnetGroup.name,
	engine: "postgres",
	engineVersion: "15.4",
	instanceClass: "db.t3.micro",
	allocatedStorage: 20,
	storageType: "gp2",
	username: "postgres",
	password: dbSnapshotPassword,
	parameterGroupName: "default.postgres15",
	skipFinalSnapshot: true,
	vpcSecurityGroupIds: [rdsSecurityGroup.id],
	port: targetDbPort,
});

const dbPort = db.port;
const dbUser = db.username;

/**
 * Docker image builds
 */
// The frontend image runs the semantic-search-postgres app
// which exposes a searchable table UI to users filled with products
// that can be edited. When a product is edited, the frontend app
// persists the change to the RDS Postgres instance running in the private
// subnet. The pelican microservice listens to the RDS Postgres database for
// changes and places those changes on the SQS queue
const frontendImage = new docker.Image("frontend-image", {
	build: {
		platform: "linux/amd64",
		context: "./semantic-search-postgres/",
	},
	imageName: frontendRepo.repositoryUrl,
	registry: frontendRegistryInfo,
});

// The pelican microservice is concerned with listening for changes in the RDS Postgres
// Database. The RDS Postgres database is configured with Postgres triggers as defined in
// the rds_postgres_schema.sql file in the root of this project
// These triggers are run on table changes, leading to the old and
// new records being emitted, picked up by Pelican and placed on the SQS job queue
const pelicanImage = new docker.Image("pelican-image", {
	build: {
		platform: "linux/amd64",
		context: "./pelican",
	},
	imageName: pelicanRepo.repositoryUrl,
	registry: registryInfo,
});

// Emu is the EMbedding and Upsert (Emu) service, which handles converting the
// changed records and product descriptions in to embeddings and upserting them
// into the Pinecone index. It runs as a separate ECS service in the private subnet
const emuImage = new docker.Image("emu-image", {
	build: {
		platform: "linux/amd64",
		context: "./emu",
	},
	imageName: emuRepo.repositoryUrl,
	registry: emuRegistryInfo,
});

// Frontend UI ECS Service
// This is the user-facing UI service, so it is available to the public internet
// and therefore runs in the public subnet
const frontendCluster = new aws.ecs.Cluster("frontend-cluster", {});

/**
 * Supporting resources
 */
// Create an SQS queue to handle dead letters
const deadletterQueue = new aws.sqs.Queue("dead-letter");

// Create an SNS topic to handle dead letter notifications
const deadLetterTopic = new aws.sns.Topic("failed-jobs");

// Subscribe to the SNS Topic
new aws.sns.TopicSubscription("dl-queue-subscription", {
	topic: deadLetterTopic.arn,
	protocol: "sqs",
	endpoint: deadletterQueue.arn,
});

// Create an SQS queue to handle jobs messages - and configure it to send its failed jobs to
// the dead letter queue
const jobQueue = new aws.sqs.Queue("job-queue", {
	redrivePolicy: deadletterQueue.arn.apply((arn) =>
		JSON.stringify({
			deadLetterTargetArn: arn,
			maxReceiveCount: 4,
		}),
	),
});

// SQS IAM Policy granting access to send messages and get queue URL and attributes
const sqsPolicy = new aws.iam.Policy("sqs-policy", {
	policy: {
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Action: [
					"sqs:SendMessage",
					"sqs:GetQueueUrl",
					"sqs:GetQueueAttributes",
				],
				Resource: jobQueue.arn,
			},
		],
	},
});

const ecsTaskRole = new aws.iam.Role("ecs-task-execution-role", {
	assumeRolePolicy: {
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: {
					Service: "ecs-tasks.amazonaws.com",
				},
				Action: "sts:AssumeRole",
			},
		],
	},
});

new aws.iam.RolePolicyAttachment("sqs-policy-attachment", {
	role: ecsTaskRole.name,
	policyArn: sqsPolicy.arn,
});

const ecsExecutionRole = new aws.iam.Role("ecs-execution-role", {
	assumeRolePolicy: {
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: {
					Service: "ecs-tasks.amazonaws.com",
				},
				Action: "sts:AssumeRole",
			},
		],
	},
});

new aws.iam.RolePolicyAttachment("ecs-execution-policy-attachment", {
	role: ecsExecutionRole.name,
	policyArn: aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy,
});

const sqsReadAndDeletePolicy = new aws.iam.Policy(
	"sqs-read-and-delete-policy",
	{
		policy: {
			Version: "2012-10-17",
			Statement: [
				{
					Effect: "Allow",
					Action: [
						"sqs:ReceiveMessage",
						"sqs:DeleteMessage",
						"sqs:GetQueueUrl",
						"sqs:GetQueueAttributes",
					],
					Resource: jobQueue.arn,
				},
			],
		},
	},
);

const ecsEmuTaskRole = new aws.iam.Role("ecs-emu-task-execution-role", {
	assumeRolePolicy: {
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: {
					Service: "ecs-tasks.amazonaws.com",
				},
				Action: "sts:AssumeRole",
			},
		],
	},
});

new aws.iam.RolePolicyAttachment("sqs-read-and-delete-policy-attachment", {
	role: ecsEmuTaskRole.name,
	policyArn: sqsReadAndDeletePolicy.arn,
});

const jobQueueUrl = jobQueue.url;

/**
 * Frontend application ECS service and networking
 */
const alb = new awsx.lb.ApplicationLoadBalancer("alb", {
	defaultTargetGroup: {
		port: 3000,
		protocol: "HTTP",
		targetType: "ip",
	},
	internal: false,
	listener: {
		port: 80,
		protocol: "HTTP",
	},
	securityGroups: [lbSecurityGroup.id],
	subnetIds: vpc.publicSubnetIds,
});

// const targetGroup = alb.createTargetGroup("frontend", {
//   port: 3000,
//   targetType: "ip",
//   protocol: "HTTP",
// })

// // Create a Listener that listens on port 80 and forwards traffic to the new Target Group
// const listener = alb.createListener("listener", {
//   port: 80,
//   targetGroup: targetGroup,
// });
//

/**
 * CloudWatch log groups
 *
 */
const pelicanLogGroup = new aws.cloudwatch.LogGroup("pelicanLogGroup", {});
const emuLogGroup = new aws.cloudwatch.LogGroup("emuLogGroup", {});
const frontendLogGroup = new aws.cloudwatch.LogGroup("frontendLogGroup", {});

const pelicanCluster = new aws.ecs.Cluster("pelican-cluster", {});

const frontendService = new awsx.ecs.FargateService("frontend-service", {
	cluster: frontendCluster.arn,
	desiredCount: 2,
	networkConfiguration: {
		assignPublicIp: false,
		securityGroups: [frontendSecurityGroup.id],
		subnets: vpc.privateSubnetIds,
	},
	taskDefinitionArgs: {
		executionRole: {
			roleArn: ecsExecutionRole.arn,
		},
		taskRole: {
			roleArn: ecsTaskRole.arn,
		},
		container: {
			name: "frontend",
			image: frontendImage.repoDigest,
			cpu: 512,
			memory: 1024,
			essential: true,
			portMappings: [
				{
					containerPort: 3000,
					hostPort: 3000, // May be removed, must match containerPort if present
					targetGroup: alb.defaultTargetGroup,
				},
			],
			logConfiguration: {
				logDriver: "awslogs",
				options: {
					"awslogs-group": frontendLogGroup.name,
					"awslogs-region": AWS_REGION,
					"awslogs-stream-prefix": "frontend",
				},
			},
			secrets: makeSsmParameterSecrets("frontend", ecsExecutionRole, {
				PINECONE_API_KEY: PINECONE_API_KEY,
				POSTGRES_DB_USER: dbUser,
				POSTGRES_DB_PASSWORD: dbSnapshotPassword,
			}),
			environment: [
				{ name: "AWS_REGION", value: AWS_REGION },
				{ name: "HOSTNAME", value: "0.0.0.0" },
				{ name: "PINECONE_INDEX", value: PINECONE_INDEX },
				{ name: "POSTGRES_DB_NAME", value: "postgres" },
				// Pass in the hostname and port of the RDS Postgres instance so the frontend knows where to find it
				{ name: "POSTGRES_DB_HOST", value: db.address },
				{ name: "POSTGRES_DB_PORT", value: db.port.apply((p) => p.toString()) },
			],
		},
	},
});

const pelicanService = new awsx.ecs.FargateService("pelican-service", {
	cluster: pelicanCluster.arn,
	desiredCount: 2,
	networkConfiguration: {
		assignPublicIp: false,
		securityGroups: [pelicanSecurityGroup.id],
		subnets: vpc.privateSubnetIds,
	},
	taskDefinitionArgs: {
		executionRole: {
			roleArn: ecsExecutionRole.arn,
		},
		taskRole: {
			roleArn: ecsTaskRole.arn,
		},
		container: {
			name: "pelican",
			image: pelicanImage.repoDigest,
			cpu: 512,
			memory: 1024,
			essential: true,
			logConfiguration: {
				logDriver: "awslogs",
				options: {
					"awslogs-group": pelicanLogGroup.name,
					"awslogs-region": AWS_REGION,
					"awslogs-stream-prefix": "pelican",
				},
			},
			secrets: makeSsmParameterSecrets("pelican", ecsExecutionRole, {
				POSTGRES_DB_USER: dbUser,
				POSTGRES_DB_PASSWORD: dbSnapshotPassword,
			}),
			environment: [
				{ name: "POSTGRES_DB_NAME", value: `postgres` },
				{ name: "POSTGRES_DB_HOST", value: db.address },
				{ name: "POSTGRES_DB_PORT", value: targetDbPort.toString() },
				{ name: "AWS_REGION", value: AWS_REGION },
				{ name: "SQS_QUEUE_URL", value: jobQueue.url },
				{ name: "BATCH_SIZE", value: PELICAN_BATCH_SIZE.toString() },
			],
		},
	},
});

/**
 * EMU: the emu microservice handles embeddings and upserts to the Pinecone index
 */
const emuCluster = new aws.ecs.Cluster("emu-cluster", {});

const emuService = new awsx.ecs.FargateService("emu-service", {
	cluster: emuCluster.arn,
	desiredCount: 2,
	networkConfiguration: {
		assignPublicIp: false,
		securityGroups: [emuSecurityGroup.id],
		subnets: vpc.privateSubnetIds,
	},
	taskDefinitionArgs: {
		executionRole: {
			roleArn: ecsExecutionRole.arn,
		},
		taskRole: {
			roleArn: ecsEmuTaskRole.arn,
		},
		container: {
			name: "emu",
			image: emuImage.repoDigest,
			cpu: 4096,
			memory: 8192,
			essential: true,
			logConfiguration: {
				logDriver: "awslogs",
				options: {
					"awslogs-group": emuLogGroup.name,
					"awslogs-region": AWS_REGION,
					"awslogs-stream-prefix": "emu",
				},
			},
			secrets: makeSsmParameterSecrets("emu", ecsExecutionRole, {
				PINECONE_API_KEY: PINECONE_API_KEY,
			}),
			environment: [
				{ name: "PINECONE_INDEX", value: PINECONE_INDEX },
				{ name: "AWS_REGION", value: AWS_REGION },
				{ name: "SQS_QUEUE_URL", value: jobQueueUrl },
			],
		},
	},
});

const emuResourceId = pulumi.interpolate`service/${emuCluster.name}/${emuService.service.name}`;

const ecsTarget = new aws.appautoscaling.Target("ecsTarget", {
	maxCapacity: 50,
	minCapacity: 2,
	resourceId: emuResourceId,
	scalableDimension: "ecs:service:DesiredCount",
	serviceNamespace: "ecs",
});

new aws.appautoscaling.Policy(
	"cpuUtilizationPolicy",
	{
		policyType: "TargetTrackingScaling",
		resourceId: ecsTarget.resourceId,
		scalableDimension: ecsTarget.scalableDimension,
		serviceNamespace: ecsTarget.serviceNamespace,
		targetTrackingScalingPolicyConfiguration: {
			targetValue: 25, // Target CPU utilization percentage
			predefinedMetricSpecification: {
				predefinedMetricType: "ECSServiceAverageCPUUtilization",
			},
			scaleInCooldown: 30,
			scaleOutCooldown: 30,
		},
	},
);

const pelicanResourceId = pulumi.interpolate`service/${pelicanCluster.name}/${pelicanService.service.name}`;

const pelicanEcsTarget = new aws.appautoscaling.Target("pelicanEcsTarget", {
	maxCapacity: 6,
	minCapacity: 2,
	resourceId: pelicanResourceId,
	scalableDimension: "ecs:service:DesiredCount",
	serviceNamespace: "ecs",
});

const pelicanCpuUtilizationPolicy = new aws.appautoscaling.Policy(
	"pelicanCpuUtilizationPolicy",
	{
		policyType: "TargetTrackingScaling",
		resourceId: pelicanEcsTarget.resourceId,
		scalableDimension: pelicanEcsTarget.scalableDimension,
		serviceNamespace: pelicanEcsTarget.serviceNamespace,
		targetTrackingScalingPolicyConfiguration: {
			targetValue: 25, // Target CPU utilization percentage
			predefinedMetricSpecification: {
				predefinedMetricType: "ECSServiceAverageCPUUtilization",
			},
			scaleInCooldown: 30,
			scaleOutCooldown: 30,
		},
	},
);

/**
 * CloudWatch dashboard
 */
// Define a new CloudWatch dashboard
const refArchDashboard = pulumi
	.all([pelicanLogGroup.name, emuLogGroup.name])
	.apply(
		([pelicanName, emuName]) =>
			new aws.cloudwatch.Dashboard("refArchDashboard", {
				dashboardName: "refArchDashboard",
				dashboardBody: JSON.stringify({
					widgets: [
						{
							type: "log",
							x: 0,
							y: 0,
							width: 24,
							height: 6,
							properties: {
								query: `SOURCE ${pelicanName} | fields @timestamp, worker_id, @service\n| filter service = "pelican" and action = "record_write" \n| stats count(*) as records_processed by worker_id\n| sort records_processed desc\n`,
								region: AWS_REGION,
								title: "Pelican: Postgres records processed by worker",
								view: "pie",
							},
						},
						{
							type: "log",
							x: 0,
							y: 6,
							width: 24,
							height: 6,
							properties: {
								query: `SOURCE ${pelicanName} | fields @timestamp, worker_id, @service\n| filter service = \"pelican\" and action = \"record_write\" \n| stats count(*) as records_processed by worker_id\n| sort records_processed desc\n`,
								region: AWS_REGION,
								title: "Pelican: Postgres records processed by worker",
								view: "table",
							},
						},
						{
							type: "log",
							x: 0,
							y: 12,
							width: 24,
							height: 6,
							properties: {
								query: `SOURCE ${emuName} | fields @timestamp, worker_id, @service\n| filter service = \"emu\" and action = \"embedding_completed\" \n| stats count(*) as embeddings_processed by worker_id\n| sort embeddings_processed desc\n`,
								region: AWS_REGION,
								title: "Emu: Embeddings processed by worker",
								view: "table",
							},
						},
						{
							type: "log",
							x: 0,
							y: 18,
							width: 24,
							height: 6,
							properties: {
								query: `SOURCE ${emuName} | fields @timestamp, worker_id, @service\n| filter service = \"emu\" and action = \"embedding_completed\" \n| stats count(*) as embeddings_processed by worker_id\n| sort embeddings_processed desc\n`,
								region: AWS_REGION,
								title: "Emu: Embeddings processed by worker (pie)",
								view: "pie",
							},
						},
					],
				}),
			}),
	);

export const frontendServiceUrl = pulumi.interpolate`http://${alb.loadBalancer.dnsName}`;
