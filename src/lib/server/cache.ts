import { stableJsonStringify } from "./json";
import type { RuntimeEnv } from "./runtime-env";

function getCache(env: RuntimeEnv) {
  return env.BLOG_CACHE ?? null;
}

export function getBlogCacheKeys(slug: string) {
  return [`blog:home:${slug}`, `blog:archive:${slug}`];
}

export async function getCachedJson<T>(
  env: RuntimeEnv,
  key: string,
): Promise<T | null> {
  const cache = getCache(env);
  if (!cache) {
    return null;
  }

  const value = await cache.get(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function putCachedJson(
  env: RuntimeEnv,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const cache = getCache(env);
  if (!cache) {
    return;
  }

  await cache.put(key, stableJsonStringify(value), {
    expirationTtl: ttlSeconds,
  });
}

export async function deleteCachedKeys(
  env: RuntimeEnv,
  keys: string[],
): Promise<void> {
  const cache = getCache(env);
  if (!cache || !keys.length) {
    return;
  }

  await Promise.all(keys.map((key) => cache.delete(key)));
}
