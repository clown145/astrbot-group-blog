export function normalizeQqNumber(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") {
    return null;
  }

  const value = String(input).trim();
  if (!/^\d{5,20}$/.test(value)) {
    return null;
  }

  return value;
}

export function normalizeBindCode(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") {
    return null;
  }

  const value = String(input).trim();
  if (!/^\d{4,10}$/.test(value)) {
    return null;
  }

  return value;
}

export function normalizeSlug(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(value)) {
    return null;
  }

  return value;
}

export function normalizeText(
  input: unknown,
  options: { maxLength?: number } = {},
): string | null {
  if (typeof input !== "string" && typeof input !== "number") {
    return null;
  }

  const value = String(input).trim();
  if (!value) {
    return null;
  }

  if (options.maxLength && value.length > options.maxLength) {
    return null;
  }

  return value;
}

export function normalizePassword(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();
  if (value.length < 8 || value.length > 128) {
    return null;
  }

  return value;
}
