# Common tasks 

This document contains instructions for common tasks when working with the AWS Reference Architecture. 

# Table of contents 

* [Jump host](#jump-host)
* [Load testing the RefArch](#load-testing-the-refarch)
* [TODO: Tweaking and tuning autoscaling behavior](#autoscaling)
* [Destroying the RefArch](#destroying-the-refarch)

# Jump host

<img alt="jump host" src="./jumphost.png" width="500" />

## Use a Jump host to access resources running in the private subnet 

For security reasons, the Reference Architecture's VPC divides resources into public and private subnets. The frontend UI microservice runs in the 
public subnet, and everything else, including the RDS Postgres database and the backend microservices, run in the private subnet.

<img alt="jump host data flow" src="./jumphost-flow.png" />

Resources running in the private subnets are not directly accessible via the public internet, by design. 

Therefore, in order to query the database directly
or perform any other tasks that require direct access to the backend, you must connect through a "jump" or bastion host that runs in the public subnet but 
has access to private resources. 

## Step 1. Provision the jump host

At a high-level, this involves launching a new EC2 instance into the public subnet and granting its security group access to the RDS Database by adding an inbound 
rule allowing traffic from the jump host's security group into the RDS Postgres database's security group. 

![Launch an EC2 instance as a jump host](./jumphost-launch-instance.png)

On the EC2 dashboard, choose Launch an instance. Choose the default Amazon Linux flavor as well as the recommended Amazon Machine Image (AMI).

![Configure your jump host](./jumphost-configure-2.png)

Ensure that your jump host: 
1. will be launched into the same VPC that your Reference Architecture deployed
1. will be launched in one of your VPC's public subnets
1. will automatically have a public IPv4 address assigned to it
1. will be launched into a new security group. You can accept the default suggestion for the name

![Continue configuring your jump host](./jumphost-network-configure-3.png)

Create a new SSH keypair, if you don't already have one, and chose `.pem` format. 

When you create a new keypair, the AWS web console will force download the private key to your machine. Check 
your downloads folder, and run the following command to ensure the correct permissions on your key, otherwise your SSH client will complain: 

`chmod 400 ~/Downloads/<your-private-key>.pem`

Launch your instance and wait a few moments for its status to change to Available: 

![Launch your jump host](./jumphost-launch-instance.png)

Ensure your SSH configuration is working properly by connecting to your jump host over ssh: 

`ssh -i ~/Downloads/<your-private-key>.pem ec2-user@<your-jumphost-public-ipv4-address>`

## Step 2. Grant your jump host access to resources running in the backend

The RDS Postgres database is running in its own security group. By design, this security group only grants access to: 
1. the frontend microservice's security group, because the frontend issues database queries
1. the pelican microservice's security group, because Pelican listens to the Postgres database for changes

In order to allow your jump host to access the Postgres RDS database directly, to give yourself direct access via 
tools like `psql`, you must first look up the ID of the security group that was created for your jump host when you launched it: 

![Look up your jump host's security group](./jumphost-security-group-lookup-5.png)

Once you know the ID of your jump host's security group, go to the EC2 dashboard > Security groups and find the RDS Security group. 

Edit the RDS security group and add a new inbound rule. For the protocol, set `PostgreSQL` which automatically allows access via port 5432.

![Expand the RDS security group inbound rules](./jumphost-expand-rds-security-group-6.png)

Once you save the RDS Postgres security group's inbound rules, your jump host should have access to the RDS Postgres database, allowing you to 
run commands from an SSH session to your jump host. 

## Step 3. Install the Postgres client on the jump host 

SSH to your jump host: 

`ssh -i ~/Downloads/<path-to-your-ssh-private-key>.pem ec2-user@<your-jump-host-ipv4-address>`

Next, search for the latest PostgreSQL package using the `yum` package manager: 

```bash
sudo yum update
sudo yum search "postgres"
```

Find and install the latest PostgreSQL package, (for example at the time of writing): 
`sudo yum install -y postgresql15.x86_64`

## Step 4. Connect to the Postgres database from the jump host 

Visit the RDS page in the AWS console. Find the RDS Postgres database and copy it's hostname from the overview panel: 

Here's an example command for connecting from your jump host to your RDS Postgres database:

`psql -h mydb0e0dbc2.c4ztncw5rxvr.us-east-1.rds.amazonaws.com -U postgres`

If everything worked, you'll next be prompted for the password, which is `AVNS_UhAVnXgK9zFnxOH1-Hj`.

The password is the same for all users because the RDS Postgres database uses a public snapshot that already has the password configured. 

You should now be greeted with the `postgres =>` prompt, which will allow you to issue arbitrary SQL.

## Step 5. SSH to the jump host from your machine

SSH: 
`ssh -i ~/Downloads/rds-sql-bastion.pem ec2-user@54.88.236.252`

# Load testing the RefArch

<img alt="Load testing the RefArch" src="./load-testing-refarch.png" width="500" />

## Step 1. Generate additional Postgres records

By default, the Reference Architecture initially deploys with an RDS Postgres public snapshot that contains 10,001 fake product records, all marked as `processed = false`.

This is due to the fact that an initial data bootstrapping phase must be performed where: 
1. Pelican determines that there are unprocessed RDS Postgres records
1. Pelican selects records in configurable batches, selecting them for update (using row-level locking to prevent other Pelican workers from having contention issues)
1. Pelican places the records on the SQS queue and marks them as processed 
1. Emu pulls the jobs off the queue and converts their descriptions to embeddings and upserts them as vectors with metadata tying them back to their original Postgres database records

As part of load testing or while extending the Reference Architecture to your own purposes, you may wish to generate many more Postgres records in order to generate additional traffic 
for the system to process. 

There is a helper tool in `helpers/generate_records.go` that you can run to generate an arbitrary number of records in a format that the default Reference Architecture 
expects. 

If you open that file you'll find two `consts` at the top that control its behavior: 

```golang

const (
	numRecords   = 1000000
	productsFile = "one_million_products.csv"
)

```
You can modify these two const variables to change the number of records or the destination file they'll be written to. 

To run the helper and generate the records, you must [have Golang installed](https://go.dev/doc/install): 

`go run generate_records.go `

## Step 2. Use SCP to transfer files from your machine to the jump host 

SCP: 
`scp -i ~/Downloads/rds-sql-bastion.pem ~/Pinecone/ref-arch-init/semantic-search-postgres/data/one_million_products.csv ec2-user@54.88.236.252:/home/ec2-user/one_million_products.csv`

## Step 3. Load test records into the Postgres database from the jump host 

PSQL load from Jumphost:
`\copy products_with_increment(name, sku, description, price, last_updated) FROM './one_million_products.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');

# Autoscaling

TODO: This section explains how to tune the various knobs the Reference Architecture exposes for autoscaling behavior.

# Destroying the RefArch 

The inverse of `pulumi up` is `pulumi destroy`. Generally speaking, running `pulumi destroy` from the root of the project and accepting the confirmation prompt will commence tear down of 
the Reference Architecture. 

Destroying the Reference Architecture takes about as long as spinning it up: ~20 minutes or so depending on several factors. 

**N.B:** If you used the above instructions to create a jump host, you must first do the following before the `pulumi destroy` will run end to end cleanly:
* Terminate the EC2 jump host instance 
* Delete the EC2 jump host instance's security group 
* Update the RDS Security group so that it no longer includes the rule allowing access to the jump host's security group 

These changes will ensure that the AWS control plane does not get tripped up on lingering dependencies that are not managed via Pulumi. 
