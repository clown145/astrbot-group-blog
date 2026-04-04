import initialMigrationSql from "../../../migrations/0001_initial.sql?raw";
import reportAssetsMigrationSql from "../../../migrations/0002_report_assets.sql?raw";

import { requireBlogDatabase } from "./storage";
import type { RuntimeEnv } from "./runtime-env";

let bootstrapPromise: Promise<void> | null = null;

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function tableExists(
  env: RuntimeEnv,
  tableName: string,
): Promise<boolean> {
  const db = requireBlogDatabase(env);
  const row = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = ?1
       LIMIT 1`,
    )
    .bind(tableName)
    .first<{ name: string }>();

  return Boolean(row?.name);
}

async function columnExists(
  env: RuntimeEnv,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all<{ name: string }>();

  return result.results.some((row) => row.name === columnName);
}

async function runMigrationSql(env: RuntimeEnv, sql: string): Promise<void> {
  const db = requireBlogDatabase(env);
  const statements = splitSqlStatements(sql);
  if (!statements.length) {
    return;
  }

  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function ensureAccountPlatformSchema(env: RuntimeEnv): Promise<void> {
  const db = requireBlogDatabase(env);
  const hasAccounts = await tableExists(env, "accounts");
  if (!hasAccounts) {
    return;
  }

  if (!(await columnExists(env, "accounts", "platform"))) {
    await db
      .prepare(
        `ALTER TABLE accounts
         ADD COLUMN platform TEXT NOT NULL DEFAULT 'legacy'`,
      )
      .run();
  }

  if (!(await columnExists(env, "accounts", "account_uid"))) {
    await db
      .prepare(
        `ALTER TABLE accounts
         ADD COLUMN account_uid TEXT NOT NULL DEFAULT ''`,
      )
      .run();
  }

  await db
    .prepare(
      `UPDATE accounts
       SET account_uid = CASE
         WHEN account_uid = '' THEN CASE
           WHEN instr(qq_number, ':') > 0 THEN substr(qq_number, instr(qq_number, ':') + 1)
           ELSE qq_number
         END
         ELSE account_uid
       END`,
    )
    .run();

  await db
    .prepare(
      `UPDATE accounts
       SET platform = CASE
         WHEN platform = '' OR platform = 'legacy' THEN CASE
           WHEN instr(qq_number, ':') > 0 THEN substr(qq_number, 1, instr(qq_number, ':') - 1)
           ELSE 'legacy'
         END
         ELSE platform
       END`,
    )
    .run();

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_accounts_platform_account_uid
       ON accounts(platform, account_uid)`,
    )
    .run();
}

async function bootstrapSchema(env: RuntimeEnv): Promise<void> {
  const hasBlogs = await tableExists(env, "blogs");
  const hasReportAssets = await tableExists(env, "report_assets");

  if (!hasBlogs || !hasReportAssets) {
    await runMigrationSql(env, initialMigrationSql);
    await runMigrationSql(env, reportAssetsMigrationSql);
  }

  await ensureAccountPlatformSchema(env);
}

export async function ensureBlogSchema(env: RuntimeEnv): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = bootstrapSchema(env).finally(() => {
    bootstrapPromise = null;
  });

  return bootstrapPromise;
}
