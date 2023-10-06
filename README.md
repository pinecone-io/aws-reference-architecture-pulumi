# Pinecone Reference Architecture Init 

## Overview

This repo is the initial scratch repo for figuring out how to work with Pulumi and define the AWS archtitecture required to get Roie's 
object search through video application stood up and working in a Production-ready manner. 

## Getting started: 

### Step 1. Install Pulumi 

Follow their [setup instructions here](https://www.pulumi.com/docs/install/)

### Step 2. Get AWS access credentials

You can either create your own AWS test account with a billing method you control and eventually expense back the charges, or you may 
be able to obtain access to an AWS account already under Pinecone control.

**DO NOT USE YOUR ROOT USER ACCOUNT FOR SCREWING AROUND WITH PULUMI OR ANYTHING ELSE**

Create an IAM user, ideally named `pulumi`, and check the box to grant this IAM user AWS console permissions, and download the CSV file with the IAM user's credentials 
when prompted. Alternatively, save the IAM user's login information in a password manager like BitWarden.

You can directly attach the `Administrator` permission to your IAM user if you're running this for development purposes in your own AWS account.

## Step 3. Save your AWS credentials securely 

In addition to securely saving your IAM user's login information, you also need to securely store your IAM user's AWS Key ID and AWS secret key values 
(these are the security credentials you create on the IAM user's page after signing back into the console as the IAM user).

I recommend putting them in a password manager like BitWarden or a secure (encrypted) note service. 

## Step 4. Configure AWS credentials file

Normally I'd recommend against doing this (because it keeps your secrets stored in plaintext in your home drive), but it seems to work 
best with the pulumi CLI so far. If you're concerned with security and best practices, recommend setting up and learning to use [aws-vault](https://github.com/99designs/aws-vault)

Follow the [instructions on this page](https://www.pulumi.com/registry/packages/aws/installation-configuration/) to add your credentials
to your `~/.aws/credentials` file - the most straightforward way to do this is via the `aws` CLI which you can install via homebrew if you 
don't already have it.

Run the `aws configure` command as demonstrated in the above instructions. After entering your Key ID and secret key, open `~/.aws/credentials`
and ensure that your profile was created correctly with the key ID and secret key values. If this is your first AWS profile managed via the 
credentials file, you will notice it is named `[default]`. I recommend changing this to `pulumi` and saving the file. This will make it easier
to understand what is happening when you next look at this file 7 months from now. 

Next, tell the pulumi toolchain to use this AWS profile going forward: 

`pulumi config set aws:profile pulumi`

Test that you can run the `index.ts` pulumi configuration by running `pulumi up` with no other flags - as this will attempt to use the AWS 
credentials you have set in your credentials file and configured the `pulumi` CLI to use when making API calls to AWS.

## Running pulumi 

If your AWS account credentials are configured correctly as above, you should only need to run `pulumi up` which is similar to a `terraform plan`
followed by a `terraform apply` if you accept the plan. 

Pulumi will first show you what infrastructure changes it plans to make based on the TypeScript code writen in `index.ts` and the current state of
the resources in your AWS account. If you select the `yes` option from the dropdown in your terminal, Pulumi will attempt to make the AWS API calls
necessary to make the changes in your AWS account.

## Plan 

Once we've figured out Roie's use case and have the infrastructure working properly, we'll generalize this into a generic starting point 
that anyone can use to deploy their own Production-ready high-scale distributed system for creating embeddings and upserting them to Pinecone.

## Roie’s Wishlist

This is what we currently believe we're going to need to get Roie's video frame processing demo working end to end on AWS at scale:

- N instances (workers)
    - Embedding and upserting
    - Workers run docker and pull images (possibly, there are tons of ways to do this)
- ECR container registry
    - Push images here
- SQS or kinesis
    - Dead letter queue for failure
- SNS
    - Monitoring and alerts
    - Dead letter queue notifications to an email address most likely
- S3
    - Input bucket (storing frames)

