import type { APIRoute } from "astro";

import {
  isBlogExportPackageV1,
} from "@/lib/contracts/blog-export";
import { persistBlogExportPackage } from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { jsonError } from "@/lib/server/http";
import { extractBearerToken, parseJsonBody } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const expectedToken = env.INGEST_SHARED_TOKEN;

  if (!expectedToken) {
    return jsonError(500, "INGEST_SHARED_TOKEN is not configured");
  }

  const providedToken = extractBearerToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return jsonError(401, "Unauthorized");
  }

  const body = await parseJsonBody<Record<string, unknown>>(request);

  if (!body) {
    return jsonError(400, "Invalid JSON body");
  }

  if (!isBlogExportPackageV1(body)) {
    return jsonError(400, "Unsupported payload shape");
  }

  try {
    const result = await persistBlogExportPackage(env, request, body);
    return Response.json(
      {
        ok: true,
        ingested: {
          blog_id: result.blog.id,
          public_slug: result.blog.public_slug,
          platform: result.blog.platform,
          group_id: result.blog.group_id,
          report_id: result.report.id,
          report_kind: result.report.report_kind,
          snapshot_date: result.report.snapshot_date,
        },
        urls: result.urls,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to persist payload";
    return jsonError(500, message);
  }
};
