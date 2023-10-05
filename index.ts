import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket("roies-bucket");

for (var i = 0; i < 10; i++) {
  const pbucket = new aws.s3.Bucket(`roies-choice-${i}`);
  console.log(`pbucket: ${pbucket}`)
}

//const whyServerThisWay = new aws.ec2.Instance()

// Export the name of the bucket
export const bucketName = bucket.id;
