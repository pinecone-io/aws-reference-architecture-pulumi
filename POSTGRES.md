## Bootstrap data 

Exists in `./data`

## Manually populating the database with sample data

Export the RDS Postgres endpoint: 

`export POSTGRES_DB_HOST=<endpoint>`

Export the RDS Postgres username (change the value if you used something other than the default):
`export POSTGRES_DB_USER=postgres`

Run `psql -h $POSTGRES_DB_HOST -U $POSTGRES_DB_USER`

Enter the password on the command line that you provided when deploying the RDS instance.

Once connected to the database, you can run the following command, ensuring the path to your local `products_no_ids.csv` file
is correct: 

`\COPY products_with_increment(name, sku, description, price, last_updated) FROM 'products_no_id.csv' WITH CSV HEADER;`

If you're in the project root, this path will be: 

`./semantic-search-postgres/data/products_no_id.csv`
