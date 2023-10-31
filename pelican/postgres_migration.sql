-- This file describes the changes you need to run on a fresh Postgres database 
-- in order to configure the event listening and functions that will push changesets
-- to Pelican 

-- One of the ways to execute this code is to connect to the database via `psql` using the 
-- database username, password, DB hostname, etc and then paste it directly into the Postgres command line

-- You could also run this file via `psql` in the following way: 
-- export PGPASSWORD='yourpassword'; psql -h hostname -U username -d databasename -f filename.sql
-- where filename.sql is this local file

-- Step 1: Create a function to be executed on changes
CREATE OR REPLACE FUNCTION notify_change() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'table_change',
        json_build_object(
            'table', TG_TABLE_NAME,
            'action', TG_OP,
            'old', OLD,
            'new', NEW
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create a trigger for each action we are interested in listening for
CREATE TRIGGER products_inserted
AFTER INSERT ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_updated
AFTER UPDATE ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_deleted
AFTER DELETE ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();
