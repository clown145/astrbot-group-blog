import * as nunjucks from "nunjucks";
import { sprintf } from "sprintf-js";

import type {
  PublishPayloadV1,
  ReportRenderBundleV1,
} from "@/lib/contracts/blog-export";
import { renderFallbackArchivedReportHtml } from "@/lib/server/report-archive";

import {
  getTemplateFileContent,
  listTemplateFilesForTemplate,
  listTemplateNames,
} from "./registry";

type RenderContext = Record<string, unknown>;

function toRecord(value: unknown): RenderContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as RenderContext;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toFiniteNumber(value: unknown, fallback = 0): number {
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

function resolveTemplateName(candidate: string | undefined): string {
  const availableTemplates = listTemplateNames();
  if (candidate && availableTemplates.includes(candidate)) {
    return candidate;
  }

  return availableTemplates.includes("scrapbook")
    ? "scrapbook"
    : availableTemplates[0] || "scrapbook";
}

class TemplateMemoryLoader extends nunjucks.Loader {
  public readonly async = false;

  constructor(private readonly templateMap: Map<string, string>) {
    super();
  }

  getSource(name: string) {
    const src = this.templateMap.get(name);
    if (!src) {
      return null;
    }

    return {
      src,
      path: name,
      noCache: true,
    };
  }
}

function createEnvironment(templateName: string): nunjucks.Environment {
  const templateMap = new Map<string, string>();
  for (const entry of listTemplateFilesForTemplate(templateName)) {
    const parts = entry.relativePath.split("/");
    const fileName = parts[1];
    if (fileName) {
      templateMap.set(fileName, entry.content);
    }
  }

  const environment = new nunjucks.Environment(
    new TemplateMemoryLoader(templateMap) as unknown as nunjucks.ILoaderAny,
    {
      autoescape: true,
      throwOnUndefined: false,
      trimBlocks: true,
      lstripBlocks: true,
    },
  );

  environment.addFilter("float", (value: unknown) => toFiniteNumber(value, 0));
  environment.addFilter(
    "format",
    (pattern: unknown, ...values: unknown[]) => {
      if (typeof pattern !== "string") {
        return String(pattern ?? "");
      }

      try {
        return sprintf(pattern, ...values);
      } catch {
        return values.length ? String(values[0] ?? "") : pattern;
      }
    },
  );

  return environment;
}

function buildRenderData(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
  environment: nunjucks.Environment,
) {
  const renderContext = toRecord(renderBundle.render_context);
  const topics = toArray<Record<string, unknown>>(renderContext.topics);
  const titles = toArray<Record<string, unknown>>(renderContext.titles);
  const quotes = toArray<Record<string, unknown>>(renderContext.quotes);
  const chartData = toArray<Record<string, unknown>>(renderContext.chart_data);
  const chatQualityReview = toRecord(renderContext.chat_quality_review);
  const tokenUsage = toRecord(renderContext.token_usage);

  const topicsHtml = environment.render("topic_item.html", {
    topics,
  });
  const titlesHtml = environment.render("user_title_item.html", {
    titles,
  });
  const quotesHtml = environment.render("quote_item.html", {
    quotes,
  });
  const hourlyChartHtml = environment.render("activity_chart.html", {
    chart_data: chartData,
  });
  const chatQualityHtml =
    Object.keys(chatQualityReview).length > 0
      ? environment.render("chat_quality_item.html", chatQualityReview)
      : "";

  return {
    ...renderContext,
    current_date:
      renderContext.current_date ??
      renderBundle.report_meta.snapshot_date ??
      publishPayload.report.snapshot_date ??
      "",
    current_datetime:
      renderContext.current_datetime ??
      renderBundle.report_meta.generated_at ??
      publishPayload.report.generated_at ??
      "",
    message_count:
      renderContext.message_count ?? publishPayload.stats.message_count ?? 0,
    participant_count:
      renderContext.participant_count ??
      publishPayload.stats.participant_count ??
      0,
    total_characters:
      renderContext.total_characters ??
      publishPayload.stats.total_characters ??
      0,
    emoji_count: renderContext.emoji_count ?? publishPayload.stats.emoji_count ?? 0,
    most_active_period:
      renderContext.most_active_period ??
      publishPayload.stats.most_active_period ??
      "",
    topics_html: topicsHtml,
    titles_html: titlesHtml,
    quotes_html: quotesHtml,
    hourly_chart_html: hourlyChartHtml,
    chat_quality_html: chatQualityHtml,
    total_tokens: tokenUsage.total_tokens ?? publishPayload.stats.total_tokens ?? 0,
    prompt_tokens:
      tokenUsage.prompt_tokens ?? publishPayload.stats.prompt_tokens ?? 0,
    completion_tokens:
      tokenUsage.completion_tokens ??
      publishPayload.stats.completion_tokens ??
      0,
  };
}

export function renderArchivedReportHtml(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
): string {
  const templateName = resolveTemplateName(renderBundle.report_meta.template_name);
  const layoutTemplateName =
    renderBundle.report_meta.layout_template_name || "html_template.html";
  const layoutExists = getTemplateFileContent(templateName, layoutTemplateName);

  if (!layoutExists) {
    return renderFallbackArchivedReportHtml(publishPayload, renderBundle);
  }

  try {
    const environment = createEnvironment(templateName);
    const renderData = buildRenderData(publishPayload, renderBundle, environment);
    const rendered = environment.render(layoutTemplateName, renderData);

    return rendered.trim()
      ? rendered
      : renderFallbackArchivedReportHtml(publishPayload, renderBundle);
  } catch {
    return renderFallbackArchivedReportHtml(publishPayload, renderBundle);
  }
}
