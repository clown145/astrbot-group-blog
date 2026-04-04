export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function parseJsonObject<T>(
  value: string | null | undefined,
  fallback: T,
): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
