import type { PublishPayloadV1, ReportRenderBundleV1 } from "@/lib/contracts/blog-export";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
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

function renderChartBars(chartData: Record<string, unknown>[]): string {
  if (!chartData.length) {
    return '<p class="empty">当前归档里没有小时活跃图数据。</p>';
  }

  return chartData
    .map((item) => {
      const hour = toNumber(item.hour);
      const count = toNumber(item.count);
      const percentage = Math.max(4, Math.min(100, toNumber(item.percentage)));

      return `
        <div class="chart-col">
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="height:${percentage}%"></div>
          </div>
          <div class="chart-count">${count > 0 ? escapeHtml(count) : ""}</div>
          <div class="chart-label">${String(hour).padStart(2, "0")}</div>
        </div>
      `;
    })
    .join("");
}

function renderTopics(topics: Record<string, unknown>[]): string {
  if (!topics.length) {
    return '<p class="empty">今天没有提取到话题摘要。</p>';
  }

  return topics
    .map((topic) => {
      const topicMeta = toRecord(topic.topic);
      return `
        <article class="stack-card">
          <div class="stack-index">#${String(toNumber(topic.index)).padStart(2, "0")}</div>
          <h3>${escapeHtml(topicMeta.topic ?? topic.topic ?? "未命名话题")}</h3>
          <p class="muted">参与者：${escapeHtml(topic.contributors ?? "")}</p>
          <p>${escapeHtml(topic.detail ?? "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderTitles(titles: Record<string, unknown>[]): string {
  if (!titles.length) {
    return '<p class="empty">今天没有生成群友画像。</p>';
  }

  return titles
    .map((title) => {
      const avatarData = typeof title.avatar_data === "string" ? title.avatar_data : "";
      const avatarHtml = avatarData
        ? `<img src="${escapeHtml(avatarData)}" alt="" />`
        : `<div class="avatar-fallback">${escapeHtml(String(title.name ?? "?").slice(0, 1) || "?")}</div>`;

      return `
        <article class="portrait-card">
          <div class="portrait-header">
            <div class="avatar">${avatarHtml}</div>
            <div>
              <h3>${escapeHtml(title.name ?? "未知成员")}</h3>
              <div class="badges">
                <span>${escapeHtml(title.title ?? "称号")}</span>
                <span>${escapeHtml(title.mbti ?? "MBTI")}</span>
              </div>
            </div>
          </div>
          <p>${escapeHtml(title.reason ?? "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderQuotes(quotes: Record<string, unknown>[]): string {
  if (!quotes.length) {
    return '<p class="empty">今天没有归档到金句。</p>';
  }

  return quotes
    .map((quote) => {
      const avatarUrl = typeof quote.avatar_url === "string" ? quote.avatar_url : "";
      const avatarHtml = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" alt="" />`
        : `<div class="avatar-fallback">${escapeHtml(String(quote.sender ?? "?").slice(0, 1) || "?")}</div>`;

      return `
        <article class="quote-card">
          <div class="quote-author">
            <div class="avatar small">${avatarHtml}</div>
            <div>
              <div class="quote-sender">${escapeHtml(quote.sender ?? "未知成员")}</div>
            </div>
          </div>
          <blockquote>${escapeHtml(quote.content ?? "")}</blockquote>
          <p class="muted">AI 锐评：${escapeHtml(quote.reason ?? "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderChatQuality(chatQuality: Record<string, unknown>): string {
  if (!Object.keys(chatQuality).length) {
    return "";
  }

  const dimensions = toRecordArray(chatQuality.dimensions);
  const dimHtml = dimensions
    .map((dimension) => {
      const percentage = Math.max(0, Math.min(100, toNumber(dimension.percentage)));
      const color =
        typeof dimension.color === "string" && dimension.color.trim()
          ? dimension.color
          : "#2b7a5e";

      return `
        <div class="dimension">
          <div class="dimension-head">
            <span>${escapeHtml(dimension.name ?? "维度")}</span>
            <strong>${percentage}%</strong>
          </div>
          <div class="dimension-track">
            <div class="dimension-fill" style="width:${percentage}%;background:${escapeHtml(color)}"></div>
          </div>
          <p class="muted">${escapeHtml(dimension.comment ?? "")}</p>
        </div>
      `;
    })
    .join("");

  return `
    <section class="panel">
      <div class="section-kicker">Quality Review</div>
      <h2>${escapeHtml(chatQuality.title ?? "聊天质量锐评")}</h2>
      <p class="muted">${escapeHtml(chatQuality.subtitle ?? "")}</p>
      <div class="dimension-grid">${dimHtml}</div>
      <p class="summary">${escapeHtml(chatQuality.summary ?? "")}</p>
    </section>
  `;
}

export function renderFallbackArchivedReportHtml(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
): string {
  const renderContext = toRecord(renderBundle.render_context);
  const stats = publishPayload.stats;
  const topics = toRecordArray(renderContext.topics);
  const titles = toRecordArray(renderContext.titles);
  const quotes = toRecordArray(renderContext.quotes);
  const chartData = toRecordArray(renderContext.chart_data);
  const chatQuality =
    toRecord(renderContext.chat_quality_review).title ||
    toRecord(renderContext.chat_quality_review).summary
      ? toRecord(renderContext.chat_quality_review)
      : toRecord(publishPayload.chat_quality_review);
  const reportDate =
    renderBundle.report_meta.snapshot_date ??
    publishPayload.report.snapshot_date ??
    renderBundle.report_meta.generated_at ??
    publishPayload.report.generated_at ??
    "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(renderBundle.report_meta.group_name || publishPayload.target.group_name || publishPayload.target.group_id)} · ${escapeHtml(reportDate)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe4;
      --paper: rgba(255,255,255,0.88);
      --panel: #fff9f0;
      --ink: #1f2a24;
      --muted: #5e665e;
      --line: rgba(31,42,36,0.12);
      --accent: #1f6f57;
      --accent-soft: #d8ebe2;
      --warm: #9d4b2e;
      --shadow: 0 18px 44px rgba(31, 42, 36, 0.08);
      font-family: "IBM Plex Sans", "Noto Sans SC", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(31,111,87,0.09), transparent 30%),
        linear-gradient(180deg, #fbf8f1 0%, var(--bg) 100%);
      color: var(--ink);
      line-height: 1.6;
    }
    .page {
      max-width: 1080px;
      margin: 0 auto;
      padding: 40px 20px 80px;
    }
    .hero {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 32px;
      box-shadow: var(--shadow);
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--warm);
    }
    h1, h2, h3, .metric-value {
      font-family: "Newsreader", "Noto Serif SC", serif;
      margin: 0;
    }
    h1 { font-size: clamp(2.2rem, 5vw, 4rem); line-height: 1.05; margin-top: 12px; }
    h2 { font-size: 1.8rem; margin-top: 6px; }
    h3 { font-size: 1.15rem; }
    .hero-meta {
      margin-top: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .tag {
      padding: 6px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
    }
    .grid {
      display: grid;
      gap: 18px;
      margin-top: 22px;
    }
    .grid.metrics {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .grid.two {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: start;
    }
    .panel, .metric-card, .stack-card, .portrait-card, .quote-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
    }
    .metric-card, .panel { padding: 24px; }
    .metric-label, .muted, .section-kicker {
      color: var(--muted);
    }
    .metric-value {
      margin-top: 10px;
      font-size: 2.1rem;
      line-height: 1;
    }
    .section-kicker {
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 12px;
    }
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(24, minmax(0, 1fr));
      gap: 8px;
      align-items: end;
      margin-top: 24px;
      min-height: 220px;
    }
    .chart-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .chart-bar-wrap {
      width: 100%;
      min-height: 150px;
      display: flex;
      align-items: flex-end;
    }
    .chart-bar {
      width: 100%;
      min-height: 4px;
      border-radius: 999px 999px 0 0;
      background: linear-gradient(180deg, #2a8f71 0%, #1f6f57 100%);
    }
    .chart-count, .chart-label {
      font-size: 12px;
      color: var(--muted);
    }
    .stack-list, .portrait-grid, .quotes-list, .dimension-grid {
      display: grid;
      gap: 16px;
      margin-top: 20px;
    }
    .portrait-grid {
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    }
    .stack-card, .portrait-card, .quote-card {
      padding: 20px;
    }
    .stack-index {
      display: inline-flex;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      margin-bottom: 10px;
    }
    .portrait-header, .quote-author {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
    }
    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      overflow: hidden;
      background: #ecf0ec;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar.small {
      width: 44px;
      height: 44px;
      border-radius: 14px;
    }
    .avatar img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar-fallback {
      font-weight: 700;
      color: var(--accent);
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .badges span {
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 999px;
      background: #f3ead8;
      color: var(--warm);
    }
    blockquote {
      margin: 0;
      padding-left: 16px;
      border-left: 4px solid var(--accent-soft);
      font-size: 1.08rem;
    }
    .dimension-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .dimension {
      padding: 16px;
      border-radius: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
    }
    .dimension-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
    }
    .dimension-track {
      height: 10px;
      border-radius: 999px;
      background: #e9ece9;
      overflow: hidden;
    }
    .dimension-fill {
      height: 100%;
      border-radius: inherit;
    }
    .summary {
      margin-top: 18px;
      font-size: 1.02rem;
    }
    .footer {
      margin-top: 30px;
      color: var(--muted);
      font-size: 14px;
      text-align: center;
    }
    .empty {
      margin-top: 16px;
      color: var(--muted);
    }
    @media (max-width: 900px) {
      .grid.two {
        grid-template-columns: 1fr;
      }
      .chart-grid {
        gap: 5px;
      }
      .page {
        padding-inline: 14px;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="eyebrow">Daily Group Report</div>
      <h1>${escapeHtml(renderBundle.report_meta.group_name || publishPayload.target.group_name || publishPayload.target.group_id)}</h1>
      <p class="muted">${escapeHtml(renderContext.current_date ?? reportDate)}</p>
      <div class="hero-meta">
        <span class="tag">${escapeHtml(renderBundle.report_meta.template_name || "fallback")}</span>
        <span class="tag">${escapeHtml(publishPayload.report.report_kind)}</span>
        <span class="tag">${escapeHtml(publishPayload.coverage.coverage_status ?? "unknown")}</span>
      </div>
      <div class="grid metrics">
        <article class="metric-card"><div class="metric-label">消息数</div><div class="metric-value">${escapeHtml(stats.message_count ?? 0)}</div></article>
        <article class="metric-card"><div class="metric-label">参与人数</div><div class="metric-value">${escapeHtml(stats.participant_count ?? 0)}</div></article>
        <article class="metric-card"><div class="metric-label">总字数</div><div class="metric-value">${escapeHtml(stats.total_characters ?? 0)}</div></article>
        <article class="metric-card"><div class="metric-label">表情数</div><div class="metric-value">${escapeHtml(stats.emoji_count ?? 0)}</div></article>
      </div>
    </section>

    <section class="grid two">
      <section class="panel">
        <div class="section-kicker">Activity</div>
        <h2>24 小时活跃分布</h2>
        <div class="chart-grid">${renderChartBars(chartData)}</div>
      </section>
      <section class="panel">
        <div class="section-kicker">Overview</div>
        <h2>报告摘要</h2>
        <p class="muted">最活跃时段：${escapeHtml(stats.most_active_period ?? "未知")}</p>
        <p class="muted">生成时间：${escapeHtml(renderContext.current_datetime ?? renderBundle.report_meta.generated_at ?? "")}</p>
        <p class="muted">消息覆盖：${escapeHtml(publishPayload.coverage.coverage_status ?? "unknown")}</p>
        <p class="muted">分析消息数：${escapeHtml(publishPayload.coverage.analyzed_message_count ?? 0)}</p>
        <p class="muted">拉取消息数：${escapeHtml(publishPayload.coverage.fetched_message_count ?? 0)}</p>
      </section>
    </section>

    <section class="panel">
      <div class="section-kicker">Topics</div>
      <h2>今日话题</h2>
      <div class="stack-list">${renderTopics(topics)}</div>
    </section>

    <section class="panel">
      <div class="section-kicker">Portraits</div>
      <h2>群友画像</h2>
      <div class="portrait-grid">${renderTitles(titles)}</div>
    </section>

    <section class="panel">
      <div class="section-kicker">Quotes</div>
      <h2>群圣经</h2>
      <div class="quotes-list">${renderQuotes(quotes)}</div>
    </section>

    ${renderChatQuality(chatQuality)}

    <footer class="footer">
      该页面为归档 HTML，由 Worker 根据报告渲染包生成。
    </footer>
  </main>
</body>
</html>`;
}
