import type { APIRoute } from "astro";

import {
  createSessionForAccount,
  getAccountByQqNumber,
  getSessionFromToken,
  verifyPassword,
} from "@/lib/server/auth-store";
import { getClientIp, getUserAgent, jsonError } from "@/lib/server/http";
import { isSecureRequest, parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { writeSessionCookie } from "@/lib/server/session-cookie";
import { normalizePassword, normalizeQqNumber } from "@/lib/server/validators";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return jsonError(400, "Invalid JSON body");
  }

  const qqNumber = normalizeQqNumber(body.qqNumber);
  const password = normalizePassword(body.password);

  if (!qqNumber) {
    return jsonError(400, "Invalid qqNumber");
  }

  if (!password) {
    return jsonError(400, "Invalid password");
  }

  try {
    const env = getRuntimeEnv(locals);
    const account = await getAccountByQqNumber(env, qqNumber);

    if (!account) {
      return jsonError(401, "Invalid credentials");
    }

    const isValid = await verifyPassword(env, account, password);
    if (!isValid) {
      return jsonError(401, "Invalid credentials");
    }

    const { token, session } = await createSessionForAccount(env, account.id, {
      userAgent: getUserAgent(request),
      ipAddress: getClientIp(request),
    });

    const authSession = await getSessionFromToken(env, token);
    if (!authSession) {
      return jsonError(500, "Failed to load session");
    }

    writeSessionCookie(
      cookies,
      token,
      session.expires_at,
      isSecureRequest(request),
    );

    return Response.json({
      ok: true,
      authenticated: true,
      account: authSession.account,
      memberships: authSession.memberships,
      session: authSession.session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return jsonError(500, message);
  }
};
