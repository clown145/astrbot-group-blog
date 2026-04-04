import type { APIRoute } from "astro";

import { invalidateSessionToken } from "@/lib/server/auth-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/lib/server/session-cookie";
import { isSecureRequest } from "@/lib/server/request";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const sessionToken = readSessionCookie(cookies);

  if (sessionToken) {
    try {
      await invalidateSessionToken(env, sessionToken);
    } catch {
      // Session cleanup should not prevent the client from being logged out locally.
    }
  }

  clearSessionCookie(cookies, isSecureRequest(request));

  return Response.json({
    ok: true,
    authenticated: false,
  });
};
