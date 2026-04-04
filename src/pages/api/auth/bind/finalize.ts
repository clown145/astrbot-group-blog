import type { APIRoute } from "astro";

import { finalizeBindChallenge } from "@/lib/server/auth-store";
import { getBlogByPlatformGroup } from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getClientIp, getUserAgent, jsonError } from "@/lib/server/http";
import { getCurrentAuthSession, isSecureRequest, parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { clearSessionCookie, writeSessionCookie } from "@/lib/server/session-cookie";
import {
  normalizePassword,
  normalizeQqNumber,
  normalizeSlug,
  normalizeText,
} from "@/lib/server/validators";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return jsonError(400, "Invalid JSON body");
  }

  const blogSlug = normalizeSlug(body.blogSlug);
  const qqNumber = normalizeQqNumber(body.qqNumber);
  const platform = normalizeText(body.platform, { maxLength: 64 });
  const groupId = normalizeText(body.groupId ?? body.group_id, {
    maxLength: 128,
  });
  const password =
    body.password == null ? null : normalizePassword(body.password);

  if (!qqNumber) {
    return jsonError(400, "Invalid qqNumber");
  }

  if (body.password != null && !password) {
    return jsonError(400, "Invalid password");
  }

  try {
    const env = getRuntimeEnv(locals);
    await ensureBlogSchema(env);
    let targetSlug = blogSlug;

    if (!targetSlug) {
      if (!platform || !groupId) {
        return jsonError(
          400,
          "Either blogSlug or platform + groupId is required",
        );
      }

      const blog = await getBlogByPlatformGroup(env, platform, groupId);
      if (!blog) {
        return jsonError(404, "Blog not found", {
          hint: "Please upload at least one web report for this platform/group before binding.",
        });
      }

      targetSlug = blog.public_slug;
    }

    const current = await getCurrentAuthSession(env, cookies);

    if (current.sessionToken && !current.authSession) {
      clearSessionCookie(cookies, isSecureRequest(request));
    }

    const result = await finalizeBindChallenge(env, {
      blogSlug: targetSlug,
      qqNumber,
      password,
      currentSession: current.authSession,
      userAgent: getUserAgent(request),
      ipAddress: getClientIp(request),
    });

    writeSessionCookie(
      cookies,
      result.sessionToken,
      result.authSession.session.expires_at,
      isSecureRequest(request),
    );

    return Response.json({
      ok: true,
      authenticated: true,
      account: result.authSession.account,
      memberships: result.authSession.memberships,
      session: result.authSession.session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize bind";
    if (message === "Blog not found") {
      return jsonError(404, message, {
        hint: "Please upload at least one web report for this platform/group before binding.",
      });
    }

    if (message === "No verified bind challenge found") {
      return jsonError(409, message);
    }

    if (message === "Bind challenge expired" || message === "Password is required") {
      return jsonError(400, message);
    }

    if (message === "Current session does not match bind QQ") {
      return jsonError(403, message);
    }

    if (message === "Invalid password") {
      return jsonError(401, message);
    }

    return jsonError(500, message);
  }
};
