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

async function runMigrationSql(env: RuntimeEnv, sql: string): Promise<void> {
  const db = requireBlogDatabase(env);
  const statements = splitSqlStatements(sql);
  if (!statements.length) {
    return;
  }

  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function bootstrapSchema(env: RuntimeEnv): Promise<void> {
  const hasBlogs = await tableExists(env, "blogs");
  const hasReportAssets = await tableExists(env, "report_assets");

  if (hasBlogs && hasReportAssets) {
    return;
  }

  await runMigrationSql(env, initialMigrationSql);
  await runMigrationSql(env, reportAssetsMigrationSql);
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
