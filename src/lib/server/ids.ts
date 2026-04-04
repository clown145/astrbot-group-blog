const PUBLIC_SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createPublicSlug(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => {
    return PUBLIC_SLUG_ALPHABET[byte % PUBLIC_SLUG_ALPHABET.length];
  }).join("");
}

export function createDigitsCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}
