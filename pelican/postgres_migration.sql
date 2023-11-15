-- Step 1: Create 'products_with_increment' table if it does not exist
CREATE TABLE IF NOT EXISTS public.products_with_increment (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    name VARCHAR(255),
    sku VARCHAR(255),
    description TEXT,
    price MONEY,
    last_updated DATE,
    uuid VARCHAR(255),
    processed BOOLEAN NOT NULL DEFAULT FALSE
);

-- Step 2: Create a function for notification on table changes
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

-- Step 3: Create triggers for each action on 'products_with_increment'
CREATE TRIGGER products_inserted
AFTER INSERT ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_updated
AFTER UPDATE ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER products_deleted
AFTER DELETE ON public.products_with_increment
FOR EACH ROW EXECUTE FUNCTION notify_change();

-- Step 4: Create the 'bootstrapping_state' table
CREATE TABLE IF NOT EXISTS bootstrapping_state (
    is_complete BOOLEAN NOT NULL DEFAULT FALSE
);

-- Optional: Insert initial row for bootstrapping state
INSERT INTO bootstrapping_state (is_complete) VALUES (FALSE);
