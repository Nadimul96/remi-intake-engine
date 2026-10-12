import postgres from "postgres";

import { loadRootEnv, requiredEnv } from "./env";

let sqlInstance: postgres.Sql | null = null;

export function getDb(): postgres.Sql {
  loadRootEnv(import.meta.url);

  if (!sqlInstance) {
    sqlInstance = postgres(requiredEnv("DATABASE_URL"), {
      max: 10
    });
  }

  return sqlInstance;
}

export async function closeDb(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end();
    sqlInstance = null;
  }
}
