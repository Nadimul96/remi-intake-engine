import postgres from "postgres";

import { loadRootEnv, requiredEnv } from "./env";

let sqlInstance: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  loadRootEnv(import.meta.url);

  if (!sqlInstance) {
    sqlInstance = postgres(requiredEnv("DATABASE_URL"), {
      max: 10,
      onnotice: () => undefined
    });
  }

  return sqlInstance;
}

/**
 * Bind a value as jsonb. Interpolating `JSON.stringify(value)` with a `::jsonb` cast
 * double-encodes it (postgres.js serializes the string again), storing a JSON string
 * instead of an object and breaking `->>` lookups.
 */
export function jsonb(value: unknown): postgres.Parameter {
  return getDb().json(value as postgres.JSONValue);
}

export async function closeDb(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end();
    sqlInstance = null;
  }
}
