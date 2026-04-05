import * as nunjucks from "nunjucks";
import { sprintf } from "sprintf-js";

import type {
  PublishPayloadV1,
  ReportRenderBundleV1,
} from "@/lib/contracts/blog-export";
import { renderFallbackArchivedReportHtml } from "@/lib/server/report-archive";
import { precompiledTemplateGroups } from "@/lib/report-templates/precompiled.generated";

import {
  listTemplateNames,
} from "./registry";

type RenderContext = Record<string, unknown>;
export interface RenderArchivedReportOptions {
  templateName?: string;
}

export interface RenderArchivedReportResult {
  html: string;
  templateName: string;
  layoutTemplateName: string;
  usedFallback: boolean;
  renderError?: string;
}

interface NamespaceObject {
  [key: string]: unknown;
}

function toSafeString(value: unknown): nunjucks.runtime.SafeString {
  return new nunjucks.runtime.SafeString(String(value ?? ""));
}

function reviveSerializedMarkup(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (
    value.includes('class="user-capsule"') ||
    value.includes("class='user-capsule'") ||
    value.includes("<br>") ||
    value.includes("<br/>") ||
    value.includes("<br />")
  ) {
    return toSafeString(value);
  }

  return value;
}

function reviveTopicRecords(
  topics: Record<string, unknown>[],
): Record<string, unknown>[] {
  return topics.map((topic) => ({
    ...topic,
    detail: reviveSerializedMarkup(topic.detail),
  }));
}

function reviveQuoteRecords(
  quotes: Record<string, unknown>[],
): Record<string, unknown>[] {
  return quotes.map((quote) => ({
    ...quote,
    reason: reviveSerializedMarkup(quote.reason),
  }));
}

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

function toInteger(value: unknown, fallback = 0): number {
  const numeric = toFiniteNumber(value, fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return numeric < 0 ? Math.ceil(numeric) : Math.floor(numeric);
}

function roundNumber(
  value: unknown,
  precision = 0,
  method: "common" | "ceil" | "floor" = "common",
): number {
  const numeric = toFiniteNumber(value, 0);
  const digits = Math.max(0, toInteger(precision, 0));
  const factor = 10 ** digits;

  if (!Number.isFinite(factor) || factor <= 0) {
    return numeric;
  }

  if (method === "ceil") {
    return Math.ceil(numeric * factor) / factor;
  }

  if (method === "floor") {
    return Math.floor(numeric * factor) / factor;
  }

  return Math.round(numeric * factor) / factor;
}

function createNamespace(initial?: Record<string, unknown>): NamespaceObject {
  return { ...(initial ?? {}) };
}

function cycleByIndex(index: unknown, ...values: unknown[]): unknown {
  if (!values.length) {
    return "";
  }

  const normalizedIndex = Math.abs(toInteger(index, 0));
  return values[normalizedIndex % values.length];
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

function getPrecompiledTemplateGroup(
  templateName: string,
): Record<string, unknown> | null {
  return precompiledTemplateGroups[templateName] ?? null;
}

function createEnvironment(templateName: string): nunjucks.Environment | null {
  const precompiledGroup = getPrecompiledTemplateGroup(templateName);
  if (!precompiledGroup) {
    return null;
  }

  const environment = new nunjucks.Environment(
    new nunjucks.PrecompiledLoader(
      precompiledGroup as unknown as any[],
    ) as unknown as nunjucks.ILoaderAny,
    {
      autoescape: true,
      throwOnUndefined: false,
      trimBlocks: true,
      lstripBlocks: true,
    },
  );

  environment.addFilter("float", (value: unknown) => toFiniteNumber(value, 0));
  environment.addFilter(
    "int",
    (value: unknown, defaultValue?: unknown, base?: unknown) => {
      const fallback = toInteger(defaultValue, 0);
      if (typeof value === "string" && value.trim()) {
        const radix = toInteger(base, 10);
        if (radix >= 2 && radix <= 36) {
          const parsed = Number.parseInt(value, radix);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
      }

      return toInteger(value, fallback);
    },
  );
  environment.addFilter(
    "round",
    (
      value: unknown,
      precision?: unknown,
      method?: unknown,
    ) => roundNumber(
      value,
      toInteger(precision, 0),
      method === "ceil" || method === "floor" ? method : "common",
    ),
  );
  environment.addFilter("random", (value: unknown) => {
    if (typeof value === "string") {
      if (!value.length) {
        return "";
      }

      return value[Math.floor(Math.random() * value.length)];
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return null;
      }

      return value[Math.floor(Math.random() * value.length)];
    }

    return value ?? null;
  });
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
  environment.addGlobal("namespace", createNamespace);
  environment.addGlobal("jinja_loop_cycle", cycleByIndex);

  return environment;
}

function buildRenderData(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
  environment: nunjucks.Environment,
) {
  const renderContext = toRecord(renderBundle.render_context);
  const topics = reviveTopicRecords(
    toArray<Record<string, unknown>>(renderContext.topics),
  );
  const titles = toArray<Record<string, unknown>>(renderContext.titles);
  const quotes = reviveQuoteRecords(
    toArray<Record<string, unknown>>(renderContext.quotes),
  );
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

export function renderArchivedReport(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
  options: RenderArchivedReportOptions = {},
): RenderArchivedReportResult {
  const templateName = resolveTemplateName(
    options.templateName ?? renderBundle.report_meta.template_name,
  );
  const layoutTemplateName =
    renderBundle.report_meta.layout_template_name || "html_template.html";
  const precompiledGroup = getPrecompiledTemplateGroup(templateName);
  const layoutExists = Boolean(precompiledGroup?.[layoutTemplateName]);
  const effectiveRenderBundle =
    options.templateName && renderBundle.report_meta.template_name !== templateName
      ? {
          ...renderBundle,
          report_meta: {
            ...renderBundle.report_meta,
            template_name: templateName,
          },
        }
      : renderBundle;

  if (!layoutExists) {
    return {
      html: renderFallbackArchivedReportHtml(
        publishPayload,
        effectiveRenderBundle,
      ),
      templateName,
      layoutTemplateName,
      usedFallback: true,
      renderError: `Missing layout template: ${layoutTemplateName}`,
    };
  }

  try {
    const environment = createEnvironment(templateName);
    if (!environment) {
      return {
        html: renderFallbackArchivedReportHtml(
          publishPayload,
          effectiveRenderBundle,
        ),
        templateName,
        layoutTemplateName,
        usedFallback: true,
        renderError: `Missing precompiled template group: ${templateName}`,
      };
    }

    const renderData = buildRenderData(
      publishPayload,
      effectiveRenderBundle,
      environment,
    );
    const rendered = environment.render(layoutTemplateName, renderData);

    if (rendered.trim()) {
      return {
        html: rendered,
        templateName,
        layoutTemplateName,
        usedFallback: false,
      };
    }

    return {
      html: renderFallbackArchivedReportHtml(publishPayload, effectiveRenderBundle),
      templateName,
      layoutTemplateName,
      usedFallback: true,
      renderError: "Rendered template was empty",
    };
  } catch (error) {
    const renderError =
      error instanceof Error ? error.message : String(error);
    console.error("Template render failed", {
      templateName,
      layoutTemplateName,
      reportId: renderBundle.report_meta.report_id,
      error: renderError,
    });
    return {
      html: renderFallbackArchivedReportHtml(publishPayload, effectiveRenderBundle),
      templateName,
      layoutTemplateName,
      usedFallback: true,
      renderError,
    };
  }
}

export function renderArchivedReportHtml(
  publishPayload: PublishPayloadV1,
  renderBundle: ReportRenderBundleV1,
  options: RenderArchivedReportOptions = {},
): string {
  return renderArchivedReport(publishPayload, renderBundle, options).html;
}
