const textEncoder = new TextEncoder();
// Cloudflare Workers' PBKDF2 currently rejects iteration counts above 100000.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const BIND_CHALLENGE_TTL_SECONDS = 60 * 10;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(input),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function createSessionToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export function createPasswordSalt(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(
  password: string,
  salt: string,
  pepper = "",
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(`${password}${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: textEncoder.encode(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    keyMaterial,
    256,
  );

  return bytesToHex(new Uint8Array(bits));
}

export async function hashBindCode(
  secret: string,
  blogId: string,
  qqNumber: string,
  bindCode: string,
): Promise<string> {
  return sha256Hex(`${secret}:${blogId}:${qqNumber}:${bindCode}`);
}

export async function hashSessionToken(
  secret: string,
  sessionToken: string,
): Promise<string> {
  return sha256Hex(`${secret}:${sessionToken}`);
}

export function getBindChallengeTtlSeconds(): number {
  return BIND_CHALLENGE_TTL_SECONDS;
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}
