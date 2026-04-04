import type { APIRoute } from "astro";

import { createBindChallenge } from "@/lib/server/auth-store";
import { jsonError } from "@/lib/server/http";
import { parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { getBindChallengeTtlSeconds } from "@/lib/server/security";
import { normalizeQqNumber, normalizeSlug } from "@/lib/server/validators";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return jsonError(400, "Invalid JSON body");
  }

  const blogSlug = normalizeSlug(body.blogSlug);
  const qqNumber = normalizeQqNumber(body.qqNumber);

  if (!blogSlug) {
    return jsonError(400, "Invalid blogSlug");
  }

  if (!qqNumber) {
    return jsonError(400, "Invalid qqNumber");
  }

  try {
    const env = getRuntimeEnv(locals);
    const result = await createBindChallenge(env, blogSlug, qqNumber);

    return Response.json({
      ok: true,
      blog: {
        slug: result.blog.public_slug,
        group_name: result.blog.group_name,
        platform: result.blog.platform,
        group_id: result.blog.group_id,
        visibility: result.blog.visibility,
      },
      challenge: {
        qq_number: qqNumber,
        bind_code: result.bindCode,
        expires_at: result.expiresAt,
        expires_in_seconds: getBindChallengeTtlSeconds(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create bind challenge";
    if (message === "Blog not found") {
      return jsonError(404, message);
    }

    return jsonError(500, message);
  }
};
