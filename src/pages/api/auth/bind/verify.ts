import type { APIRoute } from "astro";

import { verifyBindChallengeFromBot } from "@/lib/server/auth-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { jsonError } from "@/lib/server/http";
import { extractBearerToken, parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import {
  normalizeBindCode,
  normalizeQqNumber,
  normalizeText,
} from "@/lib/server/validators";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const expectedToken = env.BIND_CALLBACK_SECRET;

  if (!expectedToken) {
    return jsonError(500, "BIND_CALLBACK_SECRET is not configured");
  }

  const providedToken = extractBearerToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return jsonError(401, "Unauthorized");
  }

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return jsonError(400, "Invalid JSON body");
  }

  const platform = normalizeText(body.platform, { maxLength: 64 });
  const groupId = normalizeText(body.groupId ?? body.group_id, {
    maxLength: 128,
  });
  const qqNumber = normalizeQqNumber(body.qqNumber ?? body.qq_number);
  const bindCode = normalizeBindCode(body.bindCode ?? body.bind_code);

  if (!platform) {
    return jsonError(400, "Invalid platform");
  }

  if (!groupId) {
    return jsonError(400, "Invalid groupId");
  }

  if (!qqNumber) {
    return jsonError(400, "Invalid qqNumber");
  }

  if (!bindCode) {
    return jsonError(400, "Invalid bindCode");
  }

  try {
    const result = await verifyBindChallengeFromBot(env, {
      platform,
      groupId,
      qqNumber,
      bindCode,
    });

    return Response.json({
      ok: true,
      blog: {
        id: result.blog.id,
        slug: result.blog.public_slug,
        platform: result.blog.platform,
        group_id: result.blog.group_id,
      },
      challenge: {
        id: result.challenge.id,
        qq_number: result.challenge.qq_number,
        verified_at: result.challenge.verified_at,
        verified_by_qq: result.challenge.verified_by_qq,
        expires_at: result.challenge.expires_at,
        consumed_at: result.challenge.consumed_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify bind challenge";
    if (message === "Blog not found" || message === "Bind challenge not found") {
      return jsonError(404, message);
    }

    if (message === "Bind challenge expired") {
      return jsonError(400, message);
    }

    return jsonError(500, message);
  }
};
