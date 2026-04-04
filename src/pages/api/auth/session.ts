import type { APIRoute } from "astro";

import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getCurrentAuthSession, isSecureRequest } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { clearSessionCookie } from "@/lib/server/session-cookie";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const current = await getCurrentAuthSession(env, cookies);

  if (!current.authSession) {
    if (current.sessionToken) {
      clearSessionCookie(cookies, isSecureRequest(request));
    }

    return Response.json({
      ok: true,
      authenticated: false,
    });
  }

  return Response.json({
    ok: true,
    authenticated: true,
    account: current.authSession.account,
    memberships: current.authSession.memberships,
    session: current.authSession.session,
  });
};
