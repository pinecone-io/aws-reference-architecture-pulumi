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
-- Check if the trigger 'products_inserted' exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_inserted') THEN
        CREATE TRIGGER products_inserted
        AFTER INSERT ON public.products_with_increment
        FOR EACH ROW EXECUTE FUNCTION notify_change();
    END IF;
END
$$;

-- Check if the trigger 'products_updated' exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated') THEN
        CREATE TRIGGER products_updated
        AFTER UPDATE ON public.products_with_increment
        FOR EACH ROW EXECUTE FUNCTION notify_change();
    END IF;
END
$$;

-- Check if the trigger 'products_deleted' exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_deleted') THEN
        CREATE TRIGGER products_deleted
        AFTER DELETE ON public.products_with_increment
        FOR EACH ROW EXECUTE FUNCTION notify_change();
    END IF;
END
$$;

-- Step 4: Create the 'bootstrapping_state' table
CREATE TABLE IF NOT EXISTS bootstrapping_state (
    is_complete BOOLEAN NOT NULL DEFAULT FALSE
);

-- Optional: Insert initial row for bootstrapping state
INSERT INTO bootstrapping_state (is_complete) VALUES (FALSE);

-- Step 5: Create the 'last_record_processed' table
CREATE TABLE IF NOT EXISTS last_record_processed (
    last_id INTEGER NOT NULL DEFAULT 0
);

-- Optional: Insert initial row for last_record_processed
INSERT INTO last_record_processed (last_id)
SELECT 0 WHERE NOT EXISTS (SELECT * FROM last_record_processed);
