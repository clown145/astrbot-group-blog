import type { APIRoute } from "astro";

import { canViewBlog } from "@/lib/server/blog-access";
import {
  getArchivedHtmlForReport,
  getBlogBySlug,
  getPublishPayloadForReport,
  getRenderBundleForReport,
  getReportByRouteKey,
} from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getCurrentAuthSession } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { renderArchivedReportHtml } from "@/lib/report-templates/renderer";

export const prerender = false;

function htmlMessage(title: string, message: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title><style>body{font-family:"IBM Plex Sans","Noto Sans SC",sans-serif;background:#f6f1e7;color:#1f2a24;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}.card{max-width:620px;background:rgba(255,255,255,.88);border:1px solid rgba(31,42,36,.12);border-radius:28px;padding:32px;box-shadow:0 18px 44px rgba(31,42,36,.08)}h1{font-family:"Newsreader","Noto Serif SC",serif;margin:0 0 14px;font-size:2.2rem}p{line-height:1.8;color:#5f675f}a{color:#1e6f5c}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export const GET: APIRoute = async ({ params, request, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const slug = params.slug;
  const routeKey = params.date;

  if (!slug || !routeKey) {
    return htmlMessage("参数错误", "缺少报告路由参数。", 400);
  }

  const blog = await getBlogBySlug(env, slug);
  if (!blog) {
    return htmlMessage("未找到博客", "当前 slug 没有关联的群博客。", 404);
  }

  const current = await getCurrentAuthSession(env, cookies);
  if (!canViewBlog(blog, current.authSession)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("blog", blog.public_slug);
    loginUrl.searchParams.set("next", new URL(request.url).pathname);
    return Response.redirect(loginUrl, 302);
  }

  const report = await getReportByRouteKey(env, blog.id, routeKey);
  if (!report) {
    return htmlMessage("未找到报告", "当前归档中没有对应日期或报告 ID 的记录。", 404);
  }

  const archivedHtml = await getArchivedHtmlForReport(env, report);
  if (archivedHtml) {
    return new Response(archivedHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const [publishPayload, renderBundle] = await Promise.all([
    getPublishPayloadForReport(env, report),
    getRenderBundleForReport(env, report),
  ]);

  if (!publishPayload || !renderBundle) {
    return htmlMessage("归档不完整", "找到了报告记录，但对应的归档对象缺失。", 500);
  }

  return new Response(renderArchivedReportHtml(publishPayload, renderBundle), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
};
