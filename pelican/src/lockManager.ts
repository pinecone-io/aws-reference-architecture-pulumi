import { query } from "./dbClient";

async function acquireLock(): Promise<boolean> {
  const insertResult = await query(
    `INSERT INTO locks (lock_name, initialized)
    VALUES ($1, $2)
    ON CONFLICT (lock_name) DO NOTHING`,
    ["pelican-init-lock", false],
  );

  // Check if a row was inserted
  return insertResult.rowCount > 0;
}

async function releaseLock(): Promise<void> {
  await query("UPDATE locks SET initialized = $1 WHERE lock_name = $2", [
    true,
    "pelican-init-lock",
  ]);
}

async function checkInitializationStatus(): Promise<boolean> {
  const result = await query(
    "SELECT initialized FROM locks WHERE lock_name = $1",
    ["pelican-init-lock"],
  );

  if (result.rows.length > 0) {
    return result.rows[0].initialized;
  } else {
    // No lock record found, proceed to try and acquire lock
    return false;
  }
}

export { acquireLock, releaseLock, checkInitializationStatus };
