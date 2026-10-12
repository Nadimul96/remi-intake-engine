import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import postgres from "postgres";

import { closeDb, getDb } from "./client";
import { loadRootEnv } from "./env";

loadRootEnv(import.meta.url);

type DbTransaction = postgres.Sql;

async function run(): Promise<void> {
  const sql = getDb();
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `;

  for (const file of files) {
    const statement = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(statement).digest("hex");
    const [existing] = await sql<{ checksum: string }[]>`
      select checksum
      from schema_migrations
      where name = ${file}
      limit 1
    `;

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Migration ${file} was already applied with a different checksum.`);
      }

      process.stdout.write(`Skipping ${file} (already applied)\n`);
      continue;
    }

    process.stdout.write(`Applying ${file}\n`);

    await sql.begin(async (rawTx) => {
      const tx = rawTx as unknown as DbTransaction;
      await tx.unsafe(statement);
      await tx`
        insert into schema_migrations (name, checksum)
        values (${file}, ${checksum})
      `;
    });
  }

  await closeDb();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
