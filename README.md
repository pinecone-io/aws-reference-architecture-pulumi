# Pinecone AWS Reference Architecture with Pulumi

# Introduction 
The Pinecone AWS Reference Architecture is a distributed system that performs vector-database-enabled semantic search over Postgres records. 
It is appropriate for use as a starting point to a more specific use case or as a learning resource. 

It is permissively licensed and supported by Pinecone's open-source
team in order to ease getting started with high-scale use cases for Pinecone's highly scalable vector database.

![Pinecone AWS Reference Architecture](./docs/aws-ref-arch-pulumi.png)

# Getting started: 

## Prerequisites
* AWS account 
* Free Pinecone account
* Free Pulumi account 

## Quick start guide 
1. **Set Up AWS IAM User**

    * Create a New IAM User: In your AWS account, create a new IAM user.
    * Security Credentials: Generate new security credentials for this IAM user.
    * Attach Administrator Policy: Attach the Administrator IAM policy to your IAM user, either directly or by adding the user to an appropriate IAM group.

2. **Configure AWS Credentials**

    * Add Credentials to AWS Profile: Insert your IAM user's access key ID and secret access key into your `~/.aws/credentials` file.

3. **Install Pulumi CLI**

    * Download and [install the Pulumi CLI](https://www.pulumi.com/docs/install/).
    * Link GitHub Account: Complete your Pulumi account setup using your GitHub account.

4. **Configure Pulumi**

    * Set AWS Profile: Run `pulumi config set aws:profile <your-aws-profile-name>` to configure the AWS profile in Pulumi.

5. **Obtain Pinecone API Key**

    * [Log into Pinecone's dashboard or create a free account](https://app.pinecone.io) to obtain your Pinecone API key and environment values.

6. **Set Environment Variables**

    * Ensure the following environment variables are set: 
        * `PINECONE_API_KEY` 
        * `PINECONE_ENVIRONMENT` 
        * `PINECONE_INDEX`
        * `AWS_REGION`
        * `POSTGRES_DB_PASSWORD`

7. **Initialize and Run Pulumi Stack**

    * Initialize Stack: Run `pulumi stack init <your-stack-name>`.
    * Deploy Resources: Execute `pulumi up` to start the deployment.
    * Review and Confirm: Review the Pulumi preview of resources to be created. Confirm by selecting `Yes` to proceed.

# Detailed Setup Instructions
 
## Installation guides

# Architecture Overview 
![Pinecone AWS Reference Architecture](./docs/aws-ref-arch-pulumi.png)

[Read more](./docs/architecture.md)

# Running Pulumi 

# Common tasks

# Troubleshooting and FAQs

# Contribution Guidelines

# License 

# Contact and Support 

### Step 1. Install Pulumi 

Follow Pulumi's [setup instructions here](https://www.pulumi.com/docs/install/)

### Step 2. Get AWS access credentials

**DO NOT USE YOUR ROOT USER ACCOUNT FOR PULUMI OR ANYTHING ELSE**

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

## Apps

The Pinecone AWS Reference Architecture is comprised of three applications (one frontend UI app and two microservices) as well as the Pinecone index 
and the AWS infrastructure to support these: 

- semantic-search-postgres (user-facing UI application which enables semantic search over a table of products)
- pelican (microservice that listens to the RDS Postgres instance for changes and puts changes on the SQS jobs queue)
- emu (microservice that takes jobs off the SQS queue and embeds and upserts their contents into the Pinecone index)

Each application has its own Dockerfile and README. Each README includes instructions on manually building the Docker image for that app in case 
you wish to debug or explore the application locally.

## Docker images 

When you run `pulumi up`, Pulumi takes care of programmatically building the Docker images for each app and pushing them to their respective ECR container repository. 

Pulumi handles authentication under the hood, so you do not need to manually authenticate to ECR repositories to push the Docker images.


## Issues and contributions

If you encounter any issues with the AWS Reference Architecture, please [file an issue against the repo](https://github.com/pinecone-io/ref-arch-init/issues/new).
