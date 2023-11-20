# Common tasks 

# Jump host

This document contains instructions for common tasks when working with the AWS Reference Architecture. 

## Creating a Jump host to access resources running in the private subnet 

For security reasons, the Reference Architecture's VPC divides resources into public and private subnets. The frontend UI microservice runs in the 
public subnet, and everything else, including the RDS Postgres database and the backend microservices, run in the private subnet.

Resources running in the private subnets are not directly accessible via the public internet, by design. Therefore, in order to query the database directly
or perform any other tasks that require direct access to the backend, you must connect through a "jump" or bastion host that runs in the public subnet but 
has access to private resources. 

At a high-level, this involves launching a new EC2 instance into the public subnet and granting its security group access to the RDS Database by adding an inbound 
rule allowing traffic from the jump host's security group into the RDS Postgres database's security group. 

1. **Go to EC2 and select launch**


## Install the Postgres client on the jump host 

On box, install `psql`: 
sudo yum update
sudo yum search "postgres"

Find the latest package, for example at the time of writing: 
`sudo yum install -y postgresql15.x86_64`


## Connect to the Postgres database from the jump host 

PSQL connect: 
`psql -h mydb0e0dbc2.c4ztncw5rxvr.us-east-1.rds.amazonaws.com -U postgres`

## SSH to the jump host from your machine

SSH: 
`ssh -i ~/Downloads/rds-sql-bastion.pem ec2-user@54.88.236.252`

## Use SCP to transfer files from your machine to the jump host 

SCP: 
`scp -i ~/Downloads/rds-sql-bastion.pem ~/Pinecone/ref-arch-init/semantic-search-postgres/data/one_million_products.csv ec2-user@54.88.236.252:/home/ec2-user/one_million_products.csv`


## Load test records into the Postgres database from the jump host 

PSQL load from Jumphost:
`\copy products_with_increment(name, sku, description, price, last_updated) FROM './one_million_products.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');


# Destroying the RefArch 

The inverse of `pulumi up` is `pulumi destroy`. Generally speaking, running `pulumi destroy` from the root of the project and accepting the confirmation prompt will commence tear down of 
the Reference Architecture. 

Destroying the Reference Architecture takes about as long as spinning it up: ~20 minutes or so depending on several factors. 

**N.B:** If you used the above instructions to create a jump host, you must first do the following before the `pulumi destroy` will run end to end cleanly:
* Terminate the EC2 jump host instance 
* Delete the EC2 jump host instance's security group 
* Update the RDS Security group so that it no longer includes the rule allowing access to the jump host's security group 

These changes will ensure that the AWS control plane does not get tripped up on lingering dependencies that are not managed via Pulumi. 
