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
import { renderArchivedReport } from "@/lib/report-templates/renderer";

export const prerender = false;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeHeaderValue(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " | ")
    .replace(/[^\t\x20-\x7e]/g, "")
    .slice(0, 240);
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

function injectTemplateToolbar(
  html: string,
  input: {
  blogSlug: string;
  blogName: string;
  archiveUrl: string;
  reportPath: string;
  reportDate: string;
  reportKind: string;
  currentTemplate: string;
  templateNames: string[];
  renderMode: "template" | "fallback";
  renderError?: string;
  },
): string {
  const templateButtons = input.templateNames
    .map((templateName) => {
      const isActive = templateName === input.currentTemplate;
      const href = `${input.reportPath}?template=${encodeURIComponent(templateName)}`;

      return `<a class="blog-template-chip${isActive ? " active" : ""}" href="${escapeHtml(href)}">${escapeHtml(templateName)}</a>`;
    })
    .join("");

  const chromeStyle = `<style id="blog-template-switcher-style">
    :root {
      --blog-switcher-paper: rgba(255,255,255,0.92);
      --blog-switcher-paper-soft: #efe5d1;
      --blog-switcher-ink: #1f2a24;
      --blog-switcher-ink-soft: #5f675f;
      --blog-switcher-mint: #1e6f5c;
      --blog-switcher-rust: #9d4b2e;
      --blog-switcher-line: rgba(31,42,36,0.14);
      --blog-switcher-shadow: 0 18px 40px rgba(31,42,36,0.08);
    }
    .blog-template-switcher-spacer {
      height: 132px;
      width: 100%;
      pointer-events: none;
    }
    .blog-template-switcher {
      position: fixed;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 2147483000;
      border: 1px solid var(--blog-switcher-line);
      border-radius: 24px;
      background: var(--blog-switcher-paper);
      backdrop-filter: blur(14px);
      box-shadow: var(--blog-switcher-shadow);
      padding: 14px 16px;
      font-family: "IBM Plex Sans","Noto Sans SC",sans-serif;
      color: var(--blog-switcher-ink);
    }
    .blog-template-switcher a {
      text-decoration: none;
      color: inherit;
    }
    .blog-template-switcher-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }
    .blog-template-switcher-eyebrow {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--blog-switcher-rust);
    }
    .blog-template-switcher-title {
      margin-top: 6px;
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
    }
    .blog-template-switcher-meta {
      margin-top: 4px;
      font-size: 13px;
      line-height: 1.7;
      color: var(--blog-switcher-ink-soft);
    }
    .blog-template-switcher-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .blog-template-link,
    .blog-template-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--blog-switcher-line);
      background: white;
      font-size: 13px;
      font-weight: 600;
      transition: transform .15s ease, background .15s ease, border-color .15s ease;
    }
    .blog-template-link:hover,
    .blog-template-chip:hover {
      transform: translateY(-1px);
      background: var(--blog-switcher-paper-soft);
    }
    .blog-template-chip.active {
      background: var(--blog-switcher-mint);
      border-color: var(--blog-switcher-mint);
      color: white;
    }
    .blog-template-switcher-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    @media (max-width: 720px) {
      .blog-template-switcher-spacer {
        height: 176px;
      }
      .blog-template-switcher {
        top: 8px;
        left: 8px;
        right: 8px;
        padding: 12px;
      }
      .blog-template-switcher-title {
        font-size: 18px;
      }
    }
  </style>`;

  const chromeMarkup = `
    <div class="blog-template-switcher" data-blog-template-switcher>
      <div class="blog-template-switcher-head">
        <div>
          <div class="blog-template-switcher-eyebrow">Template Switcher</div>
          <div class="blog-template-switcher-title">${escapeHtml(input.blogName)}</div>
          <div class="blog-template-switcher-meta">
            日期：${escapeHtml(input.reportDate)} · 报告类型：${escapeHtml(input.reportKind)} · 当前模板：${escapeHtml(input.currentTemplate)} · 渲染模式：${escapeHtml(input.renderMode)}
          </div>
          ${
            input.renderError
              ? `<div class="blog-template-switcher-meta" style="color:#9d2e2e">模板渲染异常：${escapeHtml(input.renderError)}</div>`
              : ""
          }
        </div>
        <div class="blog-template-switcher-actions">
          <a class="blog-template-link" href="${escapeHtml(`/g/${input.blogSlug}`)}">返回博客首页</a>
          <a class="blog-template-link" href="${escapeHtml(input.archiveUrl)}">返回归档</a>
        </div>
      </div>
      <div class="blog-template-switcher-list">
        ${templateButtons}
      </div>
    </div>
    <div class="blog-template-switcher-spacer" aria-hidden="true"></div>
  `;

  let output = html;
  if (output.includes("</head>")) {
    output = output.replace("</head>", `${chromeStyle}</head>`);
  } else {
    output = `${chromeStyle}${output}`;
  }

  if (/<body[^>]*>/i.test(output)) {
    output = output.replace(/<body([^>]*)>/i, `<body$1>${chromeMarkup}`);
  } else {
    output = `${chromeMarkup}${output}`;
  }

  return output;
}

export const GET: APIRoute = async ({ params, request, locals, cookies }) => {
  const env = getRuntimeEnv(locals);
  await ensureBlogSchema(env);
  const slug = params.slug;
  const routeKey = params.date;
  const requestUrl = new URL(request.url);

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
    loginUrl.searchParams.set(
      "next",
      `${requestUrl.pathname}${requestUrl.search}`,
    );
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

  const reportPath = `/g/${blog.public_slug}/reports/${encodeURIComponent(routeKey)}`;
  const renderedReport = renderArchivedReport(publishPayload, renderBundle, {
    templateName: currentTemplateName,
  });
  const htmlWithTemplateToolbar = injectTemplateToolbar(renderedReport.html, {
    blogSlug: blog.public_slug,
    blogName: blog.group_name || blog.public_slug,
    archiveUrl: `/g/${blog.public_slug}/archive`,
    reportPath,
    reportDate:
      report.snapshot_date || report.generated_at.slice(0, 10),
    reportKind: report.report_kind,
    currentTemplate: currentTemplateName,
    templateNames: availableTemplateNames,
    renderMode: renderedReport.usedFallback ? "fallback" : "template",
    renderError: renderedReport.renderError,
  });

  return new Response(htmlWithTemplateToolbar, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-astrbot-report-template": sanitizeHeaderValue(
        renderedReport.templateName,
      ),
      "x-astrbot-report-layout-template": sanitizeHeaderValue(
        renderedReport.layoutTemplateName,
      ),
      "x-astrbot-report-render-mode": renderedReport.usedFallback
        ? "fallback"
        : "template",
      "x-astrbot-report-render-error": sanitizeHeaderValue(
        renderedReport.renderError,
      ),
      "x-astrbot-report-route-key": sanitizeHeaderValue(routeKey),
      "x-astrbot-report-blog-slug": sanitizeHeaderValue(blog.public_slug),
    },
  });
};
