import type { APIRoute } from "astro";

import { createBindChallenge } from "@/lib/server/auth-store";
import { getBlogByPlatformGroup, listBlogsByGroupId } from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { jsonError } from "@/lib/server/http";
import { parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { getBindChallengeTtlSeconds } from "@/lib/server/security";
import {
  normalizeQqNumber,
  normalizeSlug,
  normalizeText,
} from "@/lib/server/validators";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
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

  if (!qqNumber) {
    return jsonError(400, "Invalid qqNumber");
  }

  try {
    const env = getRuntimeEnv(locals);
    await ensureBlogSchema(env);
    let targetSlug = blogSlug;

    if (!targetSlug) {
      if (!groupId) {
        return jsonError(
          400,
          "Either blogSlug or groupId is required",
        );
      }

      const blog = platform
        ? await getBlogByPlatformGroup(env, platform, groupId)
        : null;

      if (blog) {
        targetSlug = blog.public_slug;
      } else if (!platform) {
        const candidates = await listBlogsByGroupId(env, groupId);
        if (candidates.length === 1) {
          targetSlug = candidates[0].public_slug;
        } else if (candidates.length > 1) {
          return jsonError(409, "Multiple blogs matched groupId", {
            hint: "Please specify platform or blogSlug because multiple blogs share this group ID.",
            candidates: candidates.map((item) => ({
              slug: item.public_slug,
              group_name: item.group_name,
              platform: item.platform,
              group_id: item.group_id,
            })),
          });
        }
      }

      if (!targetSlug) {
        return jsonError(404, "Blog not found", {
          hint: "Please upload at least one web report for this group before binding.",
        });
      }
    }

    const result = await createBindChallenge(env, targetSlug, qqNumber);

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
      return jsonError(404, message, {
        hint: "Please upload at least one web report for this platform/group before binding.",
      });
    }

    return jsonError(500, message);
  }
};
