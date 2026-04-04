import type { APIRoute } from "astro";

import { canViewBlog } from "@/lib/server/blog-access";
import {
  getBlogBySlug,
  getPublishPayloadForReport,
  getRenderBundleForReport,
  getReportByRouteKey,
} from "@/lib/server/blog-store";
import { ensureBlogSchema } from "@/lib/server/db-bootstrap";
import { getCurrentAuthSession } from "@/lib/server/request";
import { getRuntimeEnv } from "@/lib/server/runtime-env";
import { listTemplateNames } from "@/lib/report-templates/registry";
import { renderArchivedReportHtml } from "@/lib/report-templates/renderer";

export const prerender = false;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function renderReportViewerShell(input: {
  blogSlug: string;
  blogName: string;
  archiveUrl: string;
  reportPath: string;
  reportDate: string;
  reportKind: string;
  currentTemplate: string;
  templateNames: string[];
}): string {
  const templateButtons = input.templateNames
    .map((templateName) => {
      const isActive = templateName === input.currentTemplate;
      const href = `${input.reportPath}?template=${encodeURIComponent(templateName)}`;

      return `<a class="template-chip${isActive ? " active" : ""}" href="${escapeHtml(href)}">${escapeHtml(templateName)}</a>`;
    })
    .join("");

  const iframeSrc = `${input.reportPath}?raw=1&template=${encodeURIComponent(input.currentTemplate)}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(input.blogName)} · ${escapeHtml(input.reportDate)}</title>
  <style>
    :root {
      color-scheme: light;
      --paper: #f6f1e7;
      --paper-strong: #efe5d1;
      --white: rgba(255,255,255,0.88);
      --ink: #1f2a24;
      --ink-soft: #5f675f;
      --mint: #1e6f5c;
      --rust: #9d4b2e;
      --line: rgba(31,42,36,0.14);
      --shadow: 0 18px 40px rgba(31,42,36,0.08);
      font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(30,111,92,0.1), transparent 32%),
        linear-gradient(180deg, #fbf8f1 0%, var(--paper) 100%);
      color: var(--ink);
    }
    a { color: inherit; text-decoration: none; }
    .page {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
    }
    .toolbar {
      position: sticky;
      top: 16px;
      z-index: 10;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: rgba(255,255,255,0.9);
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .toolbar-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--rust);
    }
    h1 {
      margin: 10px 0 0;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.1;
      font-family: "Newsreader", "Noto Serif SC", serif;
    }
    .meta {
      margin-top: 10px;
      color: var(--ink-soft);
      line-height: 1.8;
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .action-link {
      border-radius: 999px;
      padding: 12px 16px;
      border: 1px solid var(--line);
      font-size: 14px;
      font-weight: 600;
      background: white;
    }
    .action-link.primary {
      background: var(--mint);
      border-color: var(--mint);
      color: white;
    }
    .templates {
      margin-top: 20px;
    }
    .templates-title {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 12px;
    }
    .template-list {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .template-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 10px 14px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--paper);
      font-size: 14px;
      color: var(--ink);
      transition: transform .15s ease, background .15s ease, border-color .15s ease;
    }
    .template-chip:hover {
      transform: translateY(-1px);
      background: white;
    }
    .template-chip.active {
      background: var(--mint);
      border-color: var(--mint);
      color: white;
    }
    .report-frame {
      width: 100%;
      min-height: calc(100vh - 240px);
      margin-top: 20px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: white;
      box-shadow: var(--shadow);
    }
    @media (max-width: 720px) {
      .page {
        padding: 16px;
      }
      .toolbar {
        top: 8px;
        padding: 18px;
      }
      .report-frame {
        min-height: calc(100vh - 220px);
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="toolbar">
      <div class="toolbar-head">
        <div>
          <div class="eyebrow">Report Viewer</div>
          <h1>${escapeHtml(input.blogName)}</h1>
          <div class="meta">
            日期：${escapeHtml(input.reportDate)}<br />
            报告类型：${escapeHtml(input.reportKind)}<br />
            当前模板：${escapeHtml(input.currentTemplate)}
          </div>
        </div>
        <div class="actions">
          <a class="action-link" href="${escapeHtml(`/g/${input.blogSlug}`)}">返回博客首页</a>
          <a class="action-link" href="${escapeHtml(input.archiveUrl)}">返回归档</a>
          <a class="action-link primary" href="${escapeHtml(iframeSrc)}" target="_blank" rel="noreferrer">新标签打开当前模板</a>
        </div>
      </div>

      <div class="templates">
        <div class="templates-title">切换模板</div>
        <div class="template-list">
          ${templateButtons}
        </div>
      </div>
    </section>

    <iframe
      class="report-frame"
      src="${escapeHtml(iframeSrc)}"
      title="${escapeHtml(input.blogName)} ${escapeHtml(input.reportDate)}"
    ></iframe>
  </main>
</body>
</html>`;
}

export const GET: APIRoute = async ({ params, request, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const slug = params.slug;
  const routeKey = params.date;
  const requestUrl = new URL(request.url);
  const rawMode = requestUrl.searchParams.get("raw") === "1";

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
    loginUrl.searchParams.set("next", new URL(request.url).pathname);
    return Response.redirect(loginUrl, 302);
  }

  const report = await getReportByRouteKey(env, blog.id, routeKey);
  if (!report) {
    return htmlMessage("未找到报告", "当前归档中没有对应日期或报告 ID 的记录。", 404);
  }

  const [publishPayload, renderBundle] = await Promise.all([
    getPublishPayloadForReport(env, report),
    getRenderBundleForReport(env, report),
  ]);

  if (!publishPayload || !renderBundle) {
    return htmlMessage("归档不完整", "找到了报告记录，但对应的归档对象缺失。", 500);
  }

  const availableTemplateNames = listTemplateNames();
  const requestedTemplateName = requestUrl.searchParams.get("template")?.trim() || "";
  const currentTemplateName =
    (requestedTemplateName &&
      availableTemplateNames.includes(requestedTemplateName) &&
      requestedTemplateName) ||
    report.template_name ||
    renderBundle.report_meta.template_name ||
    availableTemplateNames[0] ||
    "scrapbook";

  if (!rawMode) {
    const reportPath = `/g/${blog.public_slug}/reports/${encodeURIComponent(routeKey)}`;

    return new Response(
      renderReportViewerShell({
        blogSlug: blog.public_slug,
        blogName: blog.group_name || blog.public_slug,
        archiveUrl: `/g/${blog.public_slug}/archive`,
        reportPath,
        reportDate:
          report.snapshot_date || report.generated_at.slice(0, 10),
        reportKind: report.report_kind,
        currentTemplate: currentTemplateName,
        templateNames: availableTemplateNames,
      }),
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  }

  return new Response(
    renderArchivedReportHtml(publishPayload, renderBundle, {
      templateName: currentTemplateName,
    }),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
};
