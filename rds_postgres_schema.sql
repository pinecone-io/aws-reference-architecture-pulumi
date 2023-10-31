-- Create the products_with_increment table
CREATE TABLE products_with_increment (
    id serial PRIMARY KEY,
    created_at timestamp NOT NULL DEFAULT now(),
    name character varying(255),
    sku character varying(255),
    description text,
    price money,
    last_updated date,
    uuid character varying(255)
);

-- Create or replace the notify_change function
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

-- Create triggers for the products_with_increment table
CREATE TRIGGER products_deleted
AFTER DELETE ON products_with_increment
FOR EACH ROW
EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_inserted
AFTER INSERT ON products_with_increment
FOR EACH ROW
EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_updated
AFTER UPDATE ON products_with_increment
FOR EACH ROW
EXECUTE FUNCTION notify_change();

