import type { RuntimeEnv } from "./runtime-env";

export function requireBlogDatabase(env: RuntimeEnv) {
  if (!env.BLOG_DB) {
    throw new Error("BLOG_DB binding is not configured");
  }

  return env.BLOG_DB;
}

export function requireArchiveBucket(env: RuntimeEnv) {
  if (!env.BLOG_ARCHIVE) {
    throw new Error("BLOG_ARCHIVE binding is not configured");
  }

  return env.BLOG_ARCHIVE;
}
