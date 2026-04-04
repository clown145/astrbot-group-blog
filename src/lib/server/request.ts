import type { AuthSessionView } from "./auth-store";
import { getSessionFromToken } from "./auth-store";
import type { RuntimeEnv } from "./runtime-env";
import { readSessionCookie, type CookieStore } from "./session-cookie";

export function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length).trim() : "";
}

export async function parseJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as T;
  } catch {
    return null;
  }
}

export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  const cfVisitor = request.headers.get("cf-visitor");
  if (cfVisitor?.includes('"scheme":"https"')) {
    return true;
  }

  return new URL(request.url).protocol === "https:";
}

export async function getCurrentAuthSession(
  env: RuntimeEnv,
  cookies: Pick<CookieStore, "get">,
): Promise<{
  sessionToken: string | null;
  authSession: AuthSessionView | null;
}> {
  const sessionToken = readSessionCookie(cookies);
  if (!sessionToken) {
    return {
      sessionToken: null,
      authSession: null,
    };
  }

  return {
    sessionToken,
    authSession: await getSessionFromToken(env, sessionToken),
  };
}
