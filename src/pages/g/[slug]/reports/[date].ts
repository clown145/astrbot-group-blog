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
const VIEWPORT_TAG_PATTERN = /<meta\s+name=["']viewport["'][^>]*>/i;
const DESKTOP_VIEWPORT_TAG =
  '<meta name="viewport" content="width=1280, initial-scale=1, viewport-fit=cover">';

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

function isProbablyMobileRequest(userAgent: string | null): boolean {
  const ua = String(userAgent ?? "").toLowerCase();
  return /android|iphone|ipad|ipod|mobile|phone|wechat|micromessenger|qqbrowser|mqqbrowser|ucbrowser/.test(
    ua,
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function renderMobileReader(
  publishPayload: Record<string, unknown>,
  renderBundle: Record<string, unknown>,
  input: {
    blogName: string;
    reportDate: string;
    reportKind: string;
  },
): string {
  const stats = toRecord(publishPayload.stats);
  const users = toRecord(toRecord(publishPayload.users));
  const activity = toRecord(publishPayload.activity);
  const renderContext = toRecord(renderBundle.render_context);
  const topics = toRecordArray(renderContext.topics);
  const quotes = toRecordArray(renderContext.quotes);
  const topUsers = toRecordArray(users.top_users).slice(0, 6);
  const chatQuality = toRecord(
    renderContext.chat_quality_review || publishPayload.chat_quality_review,
  );
  const hourlyBuckets = toRecordArray(activity.hourly_buckets)
    .filter((item) => toNumber(item.message_count) > 0)
    .sort((left, right) => toNumber(right.message_count) - toNumber(left.message_count))
    .slice(0, 6);
  const maxHourlyCount = Math.max(
    1,
    ...hourlyBuckets.map((item) => toNumber(item.message_count)),
  );
  const topicCards = topics.length
    ? topics
        .slice(0, 5)
        .map((topic, index) => {
          const topicMeta = toRecord(topic.topic);
          const topicTitle = String(
            topicMeta.topic ?? topicMeta.name ?? topic.topic ?? "未命名话题",
          );
          return `
            <article class="blog-reader-card">
              <div class="blog-reader-eyebrow">Topic ${index + 1}</div>
              <h3>${escapeHtml(topicTitle)}</h3>
              <div class="blog-reader-richtext">${String(topic.detail ?? "")}</div>
            </article>
          `;
        })
        .join("")
    : '<p class="blog-reader-empty">这份日报没有提取到话题摘要。</p>';
  const quoteCards = quotes.length
    ? quotes
        .slice(0, 4)
        .map((quote) => `
          <article class="blog-reader-card">
            <div class="blog-reader-eyebrow">Quote</div>
            <h3>${escapeHtml(String(quote.sender ?? "未知成员"))}</h3>
            <p class="blog-reader-quote">“${escapeHtml(String(quote.content ?? ""))}”</p>
            <div class="blog-reader-richtext">${String(quote.reason ?? "")}</div>
          </article>
        `)
        .join("")
    : '<p class="blog-reader-empty">这份日报没有归档金句。</p>';
  const userCards = topUsers.length
    ? topUsers
        .map((user, index) => `
          <article class="blog-reader-mini-card">
            <div class="blog-reader-rank">#${index + 1}</div>
            <div>
              <div class="blog-reader-name">${escapeHtml(String(user.display_name ?? "未知成员"))}</div>
              <div class="blog-reader-meta">发言 ${toNumber(user.message_count)} · 字符 ${toNumber(user.char_count)} · 表情 ${toNumber(user.emoji_count)}</div>
            </div>
          </article>
        `)
        .join("")
    : '<p class="blog-reader-empty">这份日报没有成员榜单数据。</p>';
  const hourlyCards = hourlyBuckets.length
    ? hourlyBuckets
        .map((bucket) => {
          const count = toNumber(bucket.message_count);
          const width = Math.max(8, Math.round((count / maxHourlyCount) * 100));
          return `
            <div class="blog-reader-hour">
              <div class="blog-reader-hour-head">
                <span>${String(toNumber(bucket.hour)).padStart(2, "0")}:00</span>
                <strong>${count}</strong>
              </div>
              <div class="blog-reader-hour-track">
                <div class="blog-reader-hour-fill" style="width:${width}%"></div>
              </div>
            </div>
          `;
        })
        .join("")
    : '<p class="blog-reader-empty">这份日报没有小时活跃分布。</p>';
  const chatQualityHtml = Object.keys(chatQuality).length
    ? `
      <article class="blog-reader-card">
        <div class="blog-reader-eyebrow">Review</div>
        <h3>${escapeHtml(String(chatQuality.title ?? "聊天质量锐评"))}</h3>
        <p class="blog-reader-subtitle">${escapeHtml(String(chatQuality.subtitle ?? ""))}</p>
        <p class="blog-reader-summary">${escapeHtml(String(chatQuality.summary ?? ""))}</p>
      </article>
    `
    : "";

  return `
    <section class="blog-report-reader" data-blog-report-reader>
      <div class="blog-reader-hero">
        <div class="blog-reader-eyebrow">Mobile Reader</div>
        <h1>${escapeHtml(input.blogName)}</h1>
        <p class="blog-reader-subtitle">${escapeHtml(input.reportDate)} · ${escapeHtml(input.reportKind)} · 适合手机阅读</p>
      </div>

      <section class="blog-reader-stats">
        <article class="blog-reader-stat"><span>消息数</span><strong>${toNumber(stats.message_count)}</strong></article>
        <article class="blog-reader-stat"><span>参与人数</span><strong>${toNumber(stats.participant_count)}</strong></article>
        <article class="blog-reader-stat"><span>活跃用户</span><strong>${toNumber(stats.active_user_count)}</strong></article>
        <article class="blog-reader-stat"><span>表情数</span><strong>${toNumber(stats.emoji_count)}</strong></article>
      </section>

      <section class="blog-reader-section">
        <div class="blog-reader-section-head">
          <div class="blog-reader-eyebrow">Activity</div>
          <h2>高峰时段</h2>
        </div>
        <div class="blog-reader-hour-list">${hourlyCards}</div>
      </section>

      <section class="blog-reader-section">
        <div class="blog-reader-section-head">
          <div class="blog-reader-eyebrow">Members</div>
          <h2>活跃成员</h2>
        </div>
        <div class="blog-reader-mini-grid">${userCards}</div>
      </section>

      <section class="blog-reader-section">
        <div class="blog-reader-section-head">
          <div class="blog-reader-eyebrow">Topics</div>
          <h2>话题摘要</h2>
        </div>
        <div class="blog-reader-grid">${topicCards}</div>
      </section>

      <section class="blog-reader-section">
        <div class="blog-reader-section-head">
          <div class="blog-reader-eyebrow">Quotes</div>
          <h2>群圣经</h2>
        </div>
        <div class="blog-reader-grid">${quoteCards}</div>
      </section>

      ${
        chatQualityHtml
          ? `<section class="blog-reader-section">
              <div class="blog-reader-section-head">
                <div class="blog-reader-eyebrow">Quality</div>
                <h2>聊天质量</h2>
              </div>
              <div class="blog-reader-grid">${chatQualityHtml}</div>
            </section>`
          : ""
      }
    </section>
  `;
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

function ensureDesktopViewport(html: string): string {
  if (VIEWPORT_TAG_PATTERN.test(html)) {
    return html.replace(VIEWPORT_TAG_PATTERN, DESKTOP_VIEWPORT_TAG);
  }

  if (html.includes("</head>")) {
    return html.replace("</head>", `${DESKTOP_VIEWPORT_TAG}</head>`);
  }

  return `${DESKTOP_VIEWPORT_TAG}${html}`;
}

function wrapReportStage(html: string): string {
  const bodyOpenPattern = /<body([^>]*)>/i;
  const bodyClosePattern = /<\/body>/i;
  const bodyWrapped = bodyOpenPattern.test(html)
    ? html.replace(
        bodyOpenPattern,
        `<body$1><div class="blog-report-stage-wrap"><div class="blog-report-stage" data-blog-report-stage>`,
      )
    : `<div class="blog-report-stage-wrap"><div class="blog-report-stage" data-blog-report-stage>${html}`;

  if (bodyClosePattern.test(bodyWrapped)) {
    return bodyWrapped.replace(bodyClosePattern, "</div></div></body>");
  }

  return `${bodyWrapped}</div></div>`;
}

function applyReportViewAttribute(
  html: string,
  view: "template" | "reader",
  mobileShell: boolean,
): string {
  if (/<html\b/i.test(html)) {
    return html.replace(
      /<html\b([^>]*)>/i,
      `<html$1 data-report-view="${view}" data-mobile-shell="${mobileShell ? "true" : "false"}">`,
    );
  }

  return html;
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
  currentView: "template" | "reader";
  readerHtml: string;
  mobileShell: boolean;
  },
): string {
  const templateButtons = input.templateNames
    .map((templateName) => {
      const isActive = templateName === input.currentTemplate;
      const href = `${input.reportPath}?template=${encodeURIComponent(templateName)}&view=${encodeURIComponent(input.currentView)}`;

      return `<a class="blog-template-chip${isActive ? " active" : ""}" href="${escapeHtml(href)}">${escapeHtml(templateName)}</a>`;
    })
    .join("");
  const templateViewHref = `${input.reportPath}?template=${encodeURIComponent(input.currentTemplate)}&view=template`;
  const readerViewHref = `${input.reportPath}?template=${encodeURIComponent(input.currentTemplate)}&view=reader`;

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
    .blog-template-link.active {
      background: var(--blog-switcher-rust);
      border-color: var(--blog-switcher-rust);
      color: white;
    }
    .blog-template-switcher-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .blog-reader-view-switch {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    html[data-mobile-shell="true"] .blog-template-switcher-spacer {
      height: 44px;
    }
    html[data-mobile-shell="true"] .blog-template-switcher {
      top: 8px;
      left: 8px;
      right: 8px;
      padding: 6px 8px;
      border-radius: 14px;
    }
    html[data-mobile-shell="true"] .blog-template-switcher-head {
      display: none;
    }
    html[data-mobile-shell="true"] .blog-template-switcher-list {
      margin-top: 0;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    html[data-mobile-shell="true"] .blog-template-switcher-list::-webkit-scrollbar {
      display: none;
    }
    html[data-mobile-shell="true"] .blog-reader-view-switch {
      display: none;
    }
    html[data-mobile-shell="true"] .blog-template-link,
    html[data-mobile-shell="true"] .blog-template-chip {
      min-height: 28px;
      padding: 4px 9px;
      font-size: 11px;
      white-space: nowrap;
    }
    @media (max-width: 720px) {
      .blog-template-switcher-spacer {
        height: 56px;
      }
      .blog-template-switcher {
        top: 8px;
        left: 8px;
        right: 8px;
        padding: 8px 10px;
        border-radius: 18px;
      }
      .blog-template-switcher-head {
        display: none;
      }
      .blog-template-switcher-list,
      .blog-reader-view-switch {
        margin-top: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .blog-template-switcher-list::-webkit-scrollbar,
      .blog-reader-view-switch::-webkit-scrollbar {
        display: none;
      }
      .blog-template-switcher-list {
        margin-bottom: 0;
      }
      .blog-reader-view-switch {
        display: none;
      }
      .blog-template-link,
      .blog-template-chip {
        min-height: 32px;
        padding: 6px 10px;
        font-size: 12px;
        white-space: nowrap;
      }
    }
  </style>`;
  const reportResponsiveStyle = `<style id="blog-report-mobile-fixes">
    html, body {
      max-width: 100%;
      overflow-x: auto;
    }
    body {
      min-width: 0 !important;
      -webkit-text-size-adjust: 100%;
    }
    .blog-report-stage-wrap {
      width: 100%;
      overflow: visible;
      padding: 0 0 24px;
    }
    .blog-report-reader {
      display: none;
      max-width: 860px;
      margin: 0 auto;
      padding: 0 16px 28px;
      font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
      color: #1f2a24;
    }
    .blog-reader-hero,
    .blog-reader-section,
    .blog-reader-stat,
    .blog-reader-card,
    .blog-reader-mini-card {
      border: 1px solid rgba(31,42,36,0.12);
      background: rgba(255,255,255,0.92);
      box-shadow: 0 18px 40px rgba(31,42,36,0.08);
    }
    .blog-reader-hero,
    .blog-reader-section {
      border-radius: 24px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .blog-reader-hero h1,
    .blog-reader-section h2,
    .blog-reader-card h3 {
      margin: 0;
      font-family: "Newsreader", "Noto Serif SC", serif;
    }
    .blog-reader-hero h1 {
      margin-top: 8px;
      font-size: clamp(2rem, 7vw, 3rem);
      line-height: 1.05;
    }
    .blog-reader-subtitle,
    .blog-reader-summary,
    .blog-reader-meta,
    .blog-reader-empty {
      margin-top: 10px;
      color: #5f675f;
      line-height: 1.75;
    }
    .blog-reader-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .blog-reader-stat {
      border-radius: 20px;
      padding: 14px 16px;
    }
    .blog-reader-stat span,
    .blog-reader-eyebrow,
    .blog-reader-rank {
      display: block;
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #9d4b2e;
    }
    .blog-reader-stat strong {
      display: block;
      margin-top: 10px;
      font-size: 28px;
      line-height: 1;
      font-family: "Newsreader", "Noto Serif SC", serif;
    }
    .blog-reader-section-head {
      margin-bottom: 14px;
    }
    .blog-reader-section-head h2 {
      margin-top: 8px;
      font-size: 1.6rem;
    }
    .blog-reader-grid,
    .blog-reader-mini-grid {
      display: grid;
      gap: 12px;
    }
    .blog-reader-card,
    .blog-reader-mini-card {
      border-radius: 20px;
      padding: 16px;
    }
    .blog-reader-card h3 {
      margin-top: 10px;
      font-size: 1.2rem;
    }
    .blog-reader-richtext,
    .blog-reader-quote {
      margin-top: 10px;
      line-height: 1.8;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .blog-reader-richtext .user-capsule {
      display: inline-flex !important;
      max-width: 100%;
      flex-wrap: wrap;
      white-space: normal !important;
      vertical-align: middle;
    }
    .blog-reader-hour-list {
      display: grid;
      gap: 12px;
    }
    .blog-reader-hour-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      font-size: 14px;
      color: #5f675f;
    }
    .blog-reader-hour-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(31,42,36,0.08);
      overflow: hidden;
    }
    .blog-reader-hour-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #1e6f5c 0%, #9d4b2e 100%);
    }
    .blog-reader-mini-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: start;
    }
    .blog-reader-name {
      font-weight: 700;
      color: #1f2a24;
    }
    .blog-report-stage {
      width: auto;
      max-width: none !important;
      margin: 0 auto;
      transform: none;
    }
    .blog-report-stage img,
    .blog-report-stage svg,
    .blog-report-stage canvas,
    .blog-report-stage video,
    .blog-report-stage iframe {
      max-width: 100%;
      height: auto;
    }
    .blog-report-stage .user-capsule,
    .blog-report-stage .user-capsule *,
    .blog-report-stage .quote-content,
    .blog-report-stage .quote-reason,
    .blog-report-stage .q-content,
    .blog-report-stage .q-analysis-note,
    .blog-report-stage .q-bubble,
    .blog-report-stage .quote-card,
    .blog-report-stage .quote-item,
    .blog-report-stage .quote-author,
    .blog-report-stage blockquote,
    .blog-report-stage p,
    .blog-report-stage li,
    .blog-report-stage dd,
    .blog-report-stage dt {
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .blog-report-stage .user-capsule {
      display: inline-flex !important;
      max-width: 100%;
      flex-wrap: wrap;
      white-space: normal !important;
      vertical-align: middle;
    }
    .blog-report-stage .user-capsule img {
      flex: 0 0 auto;
    }
    html[data-report-view="reader"] .blog-report-reader {
      display: block;
    }
    html[data-report-view="reader"] .blog-report-stage-wrap {
      display: none;
    }
    html[data-report-view="template"] .blog-report-reader {
      display: none;
    }
    @media (max-width: 720px) {
      .blog-reader-stats {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 560px) {
      .blog-reader-stats {
        grid-template-columns: 1fr;
      }
    }
  </style>`;
  const reportScaleScript = `<script id="blog-report-mobile-script">
    (() => {
      const params = new URLSearchParams(window.location.search);
      const explicitView = params.get("view");
      const defaultView =
        explicitView === "template" || explicitView === "reader"
          ? explicitView
          : document.documentElement.getAttribute("data-report-view") || "template";
      document.documentElement.setAttribute("data-report-view", defaultView);
    })();
  </script>`;

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
      <div class="blog-reader-view-switch">
        <a class="blog-template-link${input.currentView === "reader" ? " active" : ""}" href="${escapeHtml(readerViewHref)}">移动阅读</a>
        <a class="blog-template-link${input.currentView === "template" ? " active" : ""}" href="${escapeHtml(templateViewHref)}">原模板</a>
      </div>
    </div>
    <div class="blog-template-switcher-spacer" aria-hidden="true"></div>
    ${input.readerHtml}
  `;

  let output = applyReportViewAttribute(
    wrapReportStage(ensureDesktopViewport(html)),
    input.currentView,
    input.mobileShell,
  );
  if (output.includes("</head>")) {
    output = output.replace(
      "</head>",
      `${chromeStyle}${reportResponsiveStyle}${reportScaleScript}</head>`,
    );
  } else {
    output = `${chromeStyle}${reportResponsiveStyle}${reportScaleScript}${output}`;
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
  const mobileShell = isProbablyMobileRequest(
    request.headers.get("user-agent"),
  );

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
  const requestedView = requestUrl.searchParams.get("view")?.trim();
  const currentView =
    requestedView === "reader" || requestedView === "template"
      ? requestedView
      : "template";
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
  const readerHtml = renderMobileReader(
    publishPayload as unknown as Record<string, unknown>,
    renderBundle as unknown as Record<string, unknown>,
    {
      blogName: blog.group_name || blog.public_slug,
      reportDate: report.snapshot_date || report.generated_at.slice(0, 10),
      reportKind: report.report_kind,
    },
  );
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
    currentView,
    readerHtml,
    mobileShell,
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
      "x-astrbot-report-view": sanitizeHeaderValue(currentView),
      "x-astrbot-report-mobile-shell": mobileShell ? "true" : "false",
    },
  });
};
