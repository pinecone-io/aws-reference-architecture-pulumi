import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Context: see https://www.notion.so/AWS-Pinecone-Reference-Architecture-in-Pulumi-PRD-61245ccff1f040499b5e2417f92eee77

// Create an S3 bucket to store video frames
const bucket = new aws.s3.Bucket("input bucket");

const firstWorkerServer = new aws.ec2.Instance("worker1", { ami: "ami-067d1e60475437da2", instanceType: "t2.micro" })

// Export the name of the bucket
export const bucketName = bucket.id;

export const workerInstanceId = firstWorkerServer.id

