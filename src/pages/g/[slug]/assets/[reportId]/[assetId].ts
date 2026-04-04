import type { APIRoute } from "astro";

import { canViewBlog } from "@/lib/server/blog-access";
import { getBlogBySlug } from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getCurrentAuthSession } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { getReportAssetRecord } from "@/lib/server/report-asset-store";
import { requireArchiveBucket, requireBlogDatabase } from "@/lib/server/storage";

export const prerender = false;

async function getReportBlogId(
  env: ReturnType<typeof getRuntimeEnv>,
  reportId: string,
): Promise<string | null> {
  const db = requireBlogDatabase(env);
  const row = await db
    .prepare(
      `SELECT blog_id
       FROM reports
       WHERE id = ?1
       LIMIT 1`,
    )
    .bind(reportId)
    .first<{ blog_id: string }>();

  return row?.blog_id ?? null;
}

export const GET: APIRoute = async ({ params, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const slug = params.slug;
  const reportId = params.reportId;
  const assetId = params.assetId;

  if (!slug || !reportId || !assetId) {
    return new Response("Missing asset route params", { status: 400 });
  }

  const blog = await getBlogBySlug(env, slug);
  if (!blog) {
    return new Response("Blog not found", { status: 404 });
  }

  const reportBlogId = await getReportBlogId(env, reportId);
  if (!reportBlogId || reportBlogId !== blog.id) {
    return new Response("Asset report not found", { status: 404 });
  }

  const current = await getCurrentAuthSession(env, cookies);
  if (!canViewBlog(blog, current.authSession)) {
    return new Response("Forbidden", { status: 403 });
  }

  const asset = await getReportAssetRecord(env, reportId, assetId);
  if (!asset) {
    return new Response("Asset not found", { status: 404 });
  }

  const archive = requireArchiveBucket(env);
  const object = await archive.get(asset.r2_key);
  if (!object) {
    return new Response("Asset archive missing", { status: 404 });
  }

  return new Response(await object.arrayBuffer(), {
    headers: {
      "content-type": asset.content_type,
      "cache-control":
        blog.visibility === "public"
          ? "public, max-age=31536000, immutable"
          : "private, max-age=86400",
    },
  });
};
