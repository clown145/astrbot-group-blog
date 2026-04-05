import type {
  BlogExportPackageV1,
  PublishPayloadV1,
  ReportRenderBundleV1,
} from "@/lib/contracts/blog-export";
import { renderArchivedReportHtml } from "@/lib/report-templates/renderer";

import { createId, createPublicSlug } from "./ids";
import { parseJsonObject, stableJsonStringify } from "./json";
import { nowIso } from "./runtime-time";
import { deleteCachedKeys, getBlogCacheKeys } from "./cache";
import {
  replaceReportAssetRecords,
  storeReportAssets,
} from "./report-asset-store";
import { requireArchiveBucket, requireBlogDatabase } from "./storage";
import type { RuntimeEnv } from "./runtime-env";

export interface BlogRecord {
  id: string;
  platform: string;
  group_id: string;
  group_name: string;
  public_slug: string;
  visibility: string;
  timezone: string;
  latest_report_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRecord {
  id: string;
  blog_id: string;
  report_kind: string;
  source_mode: string;
  snapshot_date: string | null;
  generated_at: string;
  template_name: string | null;
  template_version: string | null;
  coverage_status: string | null;
  message_limit_hit: number | null;
  message_count: number;
  participant_count: number;
  active_user_count: number;
  total_characters: number;
  emoji_count: number;
  most_active_period: string;
  publish_payload_r2_key: string;
  render_bundle_r2_key: string;
  package_r2_key: string;
  render_html_r2_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipView {
  blog_id: string;
  public_slug: string;
  platform: string;
  group_id: string;
  group_name: string;
  visibility: string;
  role: string;
  bound_at: string;
}

export interface ReportViewPayload {
  coverage: Record<string, unknown>;
  stats: Record<string, unknown>;
  hourly_activity: unknown[];
  daily_activity: unknown[];
  top_users: unknown[];
  topics: unknown[];
  quotes: unknown[];
  chat_quality: Record<string, unknown> | null;
}

export interface IngestResult {
  blog: BlogRecord;
  report: ReportRecord;
  urls: {
    blog_url: string;
    archive_url: string;
    report_url: string;
  };
}

export interface ReportTrendPoint {
  id: string;
  report_kind: string;
  snapshot_date: string | null;
  generated_at: string;
  message_count: number;
  participant_count: number;
  active_user_count: number;
}

function toBooleanInteger(value: boolean | null | undefined): number | null {
  if (typeof value !== "boolean") {
    return null;
  }

  return value ? 1 : 0;
}

function normalizeGroupName(input: string | undefined): string {
  return (input ?? "").trim();
}

function resolveTemplateName(payload: BlogExportPackageV1): string | null {
  return (
    payload.render_bundle.report_meta?.template_name ??
    null
  );
}

function resolveTemplateVersion(payload: BlogExportPackageV1): string | null {
  return payload.render_bundle.report_meta?.template_version ?? null;
}

function buildArchiveKeys(blogSlug: string, reportId: string) {
  const baseKey = `blogs/${blogSlug}/reports/${reportId}`;
  return {
    packageKey: `${baseKey}/blog-export-package.json`,
    publishPayloadKey: `${baseKey}/publish-payload.json`,
    renderBundleKey: `${baseKey}/render-bundle.json`,
    htmlKey: `${baseKey}/report.html`,
  };
}

export function getReportRouteKey(
  report: Pick<ReportRecord, "report_kind" | "snapshot_date" | "id">,
): string {
  if (report.report_kind === "daily_snapshot" && report.snapshot_date) {
    return report.snapshot_date;
  }

  return report.id;
}

export async function getBlogBySlug(
  env: RuntimeEnv,
  slug: string,
): Promise<BlogRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT id, platform, group_id, group_name, public_slug, visibility, timezone, latest_report_id, created_at, updated_at
       FROM blogs
       WHERE public_slug = ?1
       LIMIT 1`,
    )
    .bind(slug)
    .first<BlogRecord>()) ?? null;
}

export async function getBlogByPlatformGroup(
  env: RuntimeEnv,
  platform: string,
  groupId: string,
): Promise<BlogRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT id, platform, group_id, group_name, public_slug, visibility, timezone, latest_report_id, created_at, updated_at
       FROM blogs
       WHERE platform = ?1 AND group_id = ?2
       LIMIT 1`,
    )
    .bind(platform, groupId)
    .first<BlogRecord>()) ?? null;
}

export async function listBlogsByGroupId(
  env: RuntimeEnv,
  groupId: string,
): Promise<BlogRecord[]> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(
      `SELECT id, platform, group_id, group_name, public_slug, visibility, timezone, latest_report_id, created_at, updated_at
       FROM blogs
       WHERE group_id = ?1
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(groupId)
    .all<BlogRecord>();

  return result.results;
}

export async function getReportViewPayload(
  env: RuntimeEnv,
  reportId: string,
): Promise<ReportViewPayload | null> {
  const db = requireBlogDatabase(env);
  const row = await db
    .prepare(
      `SELECT coverage_json, stats_json, hourly_activity_json, daily_activity_json, top_users_json, topics_json, quotes_json, chat_quality_json
       FROM report_views
       WHERE report_id = ?1
       LIMIT 1`,
    )
    .bind(reportId)
    .first<Record<string, string>>();

  if (!row) {
    return null;
  }

  return {
    coverage: parseJsonObject(row.coverage_json, {}),
    stats: parseJsonObject(row.stats_json, {}),
    hourly_activity: parseJsonObject(row.hourly_activity_json, []),
    daily_activity: parseJsonObject(row.daily_activity_json, []),
    top_users: parseJsonObject(row.top_users_json, []),
    topics: parseJsonObject(row.topics_json, []),
    quotes: parseJsonObject(row.quotes_json, []),
    chat_quality: parseJsonObject(row.chat_quality_json, null),
  };
}

export async function getLatestReportForBlog(
  env: RuntimeEnv,
  blogId: string,
): Promise<ReportRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
       ORDER BY generated_at DESC
       LIMIT 1`,
    )
    .bind(blogId)
    .first<ReportRecord>()) ?? null;
}

export async function listReportsForBlog(
  env: RuntimeEnv,
  blogId: string,
  limit = 30,
): Promise<ReportRecord[]> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
       ORDER BY COALESCE(snapshot_date, generated_at) DESC, generated_at DESC
       LIMIT ?2`,
    )
    .bind(blogId, limit)
    .all<ReportRecord>();

  return result.results;
}

export async function listDailySnapshotTrendForBlog(
  env: RuntimeEnv,
  blogId: string,
  limit = 30,
): Promise<ReportTrendPoint[]> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(
      `SELECT id, report_kind, snapshot_date, generated_at, message_count, participant_count, active_user_count
       FROM reports
       WHERE blog_id = ?1
         AND report_kind = 'daily_snapshot'
       ORDER BY snapshot_date DESC, generated_at DESC
       LIMIT ?2`,
    )
    .bind(blogId, limit)
    .all<ReportTrendPoint>();

  return result.results;
}

export async function listDailySnapshotReportsForBlog(
  env: RuntimeEnv,
  blogId: string,
  limit = 30,
): Promise<ReportRecord[]> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
         AND report_kind = 'daily_snapshot'
       ORDER BY snapshot_date DESC, generated_at DESC
       LIMIT ?2`,
    )
    .bind(blogId, limit)
    .all<ReportRecord>();

  return result.results;
}

export async function getReportByRouteKey(
  env: RuntimeEnv,
  blogId: string,
  routeKey: string,
): Promise<ReportRecord | null> {
  const db = requireBlogDatabase(env);

  if (routeKey === "latest") {
    return getLatestReportForBlog(env, blogId);
  }

  const bySnapshot = await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
         AND snapshot_date = ?2
       ORDER BY generated_at DESC
       LIMIT 1`,
    )
    .bind(blogId, routeKey)
    .first<ReportRecord>();

  if (bySnapshot) {
    return bySnapshot;
  }

  return (await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
         AND id = ?2
       LIMIT 1`,
    )
    .bind(blogId, routeKey)
    .first<ReportRecord>()) ?? null;
}

export async function listMembershipsForAccount(
  env: RuntimeEnv,
  accountId: string,
): Promise<MembershipView[]> {
  const db = requireBlogDatabase(env);
  const result = await db
    .prepare(
      `SELECT
         memberships.blog_id,
         blogs.public_slug,
         blogs.platform,
         blogs.group_id,
         blogs.group_name,
         blogs.visibility,
         memberships.role,
         memberships.bound_at
       FROM memberships
       INNER JOIN blogs ON blogs.id = memberships.blog_id
       WHERE memberships.account_id = ?1
       ORDER BY memberships.bound_at DESC`,
    )
    .bind(accountId)
    .all<MembershipView>();

  return result.results;
}

async function ensureBlog(
  env: RuntimeEnv,
  payload: BlogExportPackageV1,
): Promise<BlogRecord> {
  const db = requireBlogDatabase(env);
  const target = payload.publish_payload.target;
  const existing = await getBlogByPlatformGroup(env, target.platform, target.group_id);
  const currentTime = nowIso();
  const groupName = normalizeGroupName(target.group_name);
  const timezone = target.timezone || "UTC";

  if (existing) {
    await db
      .prepare(
        `UPDATE blogs
         SET group_name = ?1,
             timezone = ?2,
             updated_at = ?3
         WHERE id = ?4`,
      )
      .bind(groupName, timezone, currentTime, existing.id)
      .run();

    return {
      ...existing,
      group_name: groupName,
      timezone,
      updated_at: currentTime,
    };
  }

  const blog: BlogRecord = {
    id: createId("blog"),
    platform: target.platform,
    group_id: target.group_id,
    group_name: groupName,
    public_slug: createPublicSlug(),
    visibility: "unlisted",
    timezone,
    latest_report_id: null,
    created_at: currentTime,
    updated_at: currentTime,
  };

  await db
    .prepare(
      `INSERT INTO blogs (
         id, platform, group_id, group_name, public_slug, visibility, timezone, latest_report_id, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      blog.id,
      blog.platform,
      blog.group_id,
      blog.group_name,
      blog.public_slug,
      blog.visibility,
      blog.timezone,
      blog.latest_report_id,
      blog.created_at,
      blog.updated_at,
    )
    .run();

  return blog;
}

async function findExistingDailySnapshotReport(
  env: RuntimeEnv,
  blogId: string,
  snapshotDate: string,
): Promise<ReportRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT *
       FROM reports
       WHERE blog_id = ?1
         AND report_kind = 'daily_snapshot'
         AND snapshot_date = ?2
       LIMIT 1`,
    )
    .bind(blogId, snapshotDate)
    .first<ReportRecord>()) ?? null;
}

async function putJsonObject(
  env: RuntimeEnv,
  key: string,
  value: unknown,
  customMetadata: Record<string, string>,
) {
  const archive = requireArchiveBucket(env);
  await archive.put(key, stableJsonStringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
    customMetadata,
  });
}

async function putHtmlObject(
  env: RuntimeEnv,
  key: string,
  html: string,
  customMetadata: Record<string, string>,
) {
  const archive = requireArchiveBucket(env);
  await archive.put(key, html, {
    httpMetadata: {
      contentType: "text/html; charset=utf-8",
    },
    customMetadata,
  });
}

async function getJsonObjectFromArchive<T>(
  env: RuntimeEnv,
  key: string | null,
): Promise<T | null> {
  if (!key) {
    return null;
  }

  const archive = requireArchiveBucket(env);
  const object = await archive.get(key);
  if (!object) {
    return null;
  }

  try {
    return await object.json<T>();
  } catch {
    try {
      return JSON.parse(await object.text()) as T;
    } catch {
      return null;
    }
  }
}

export async function getPublishPayloadForReport(
  env: RuntimeEnv,
  report: Pick<ReportRecord, "publish_payload_r2_key">,
): Promise<PublishPayloadV1 | null> {
  return getJsonObjectFromArchive<PublishPayloadV1>(
    env,
    report.publish_payload_r2_key,
  );
}

export async function getRenderBundleForReport(
  env: RuntimeEnv,
  report: Pick<ReportRecord, "render_bundle_r2_key">,
): Promise<ReportRenderBundleV1 | null> {
  return getJsonObjectFromArchive<ReportRenderBundleV1>(
    env,
    report.render_bundle_r2_key,
  );
}

export async function getArchivedHtmlForReport(
  env: RuntimeEnv,
  report: Pick<ReportRecord, "render_html_r2_key">,
): Promise<string | null> {
  if (!report.render_html_r2_key) {
    return null;
  }

  const archive = requireArchiveBucket(env);
  const object = await archive.get(report.render_html_r2_key);
  if (!object) {
    return null;
  }

  return object.text();
}

export async function persistBlogExportPackage(
  env: RuntimeEnv,
  request: Request,
  payload: BlogExportPackageV1,
): Promise<IngestResult> {
  const db = requireBlogDatabase(env);
  const blog = await ensureBlog(env, payload);
  const reportMeta = payload.publish_payload.report;
  const currentTime = nowIso();
  const existingDailySnapshot =
    reportMeta.report_kind === "daily_snapshot" && reportMeta.snapshot_date
      ? await findExistingDailySnapshotReport(
          env,
          blog.id,
          reportMeta.snapshot_date,
        )
      : null;

  const reportId =
    existingDailySnapshot?.id ??
    payload.render_bundle.report_meta?.report_id ??
    createId("report");

  const archiveKeys = buildArchiveKeys(blog.public_slug, reportId);
  const customMetadata = {
    blogSlug: blog.public_slug,
    reportId,
    platform: blog.platform,
    groupId: blog.group_id,
  };
  const origin = new URL(request.url).origin;
  const { normalizedRenderBundle, assetRecords } = await storeReportAssets(env, {
    blogSlug: blog.public_slug,
    reportId,
    origin,
    renderBundle: payload.render_bundle,
  });

  await putJsonObject(env, archiveKeys.packageKey, payload, customMetadata);
  await putJsonObject(
    env,
    archiveKeys.publishPayloadKey,
    payload.publish_payload,
    customMetadata,
  );
  await putJsonObject(
    env,
    archiveKeys.renderBundleKey,
    normalizedRenderBundle,
    customMetadata,
  );
  const archivedHtml = renderArchivedReportHtml(
    payload.publish_payload,
    normalizedRenderBundle,
  );
  await putHtmlObject(env, archiveKeys.htmlKey, archivedHtml, customMetadata);

  const stats = payload.publish_payload.stats;
  const report: ReportRecord = {
    id: reportId,
    blog_id: blog.id,
    report_kind: reportMeta.report_kind,
    source_mode: reportMeta.source_mode,
    snapshot_date: reportMeta.snapshot_date ?? null,
    generated_at:
      reportMeta.generated_at ??
      payload.render_bundle.report_meta?.generated_at ??
      currentTime,
    template_name: resolveTemplateName(payload),
    template_version: resolveTemplateVersion(payload),
    coverage_status: payload.publish_payload.coverage.coverage_status ?? null,
    message_limit_hit: toBooleanInteger(
      payload.publish_payload.coverage.message_limit_hit,
    ),
    message_count: stats.message_count ?? 0,
    participant_count: stats.participant_count ?? 0,
    active_user_count: stats.active_user_count ?? 0,
    total_characters: stats.total_characters ?? 0,
    emoji_count: stats.emoji_count ?? 0,
    most_active_period: stats.most_active_period ?? "",
    publish_payload_r2_key: archiveKeys.publishPayloadKey,
    render_bundle_r2_key: archiveKeys.renderBundleKey,
    package_r2_key: archiveKeys.packageKey,
    render_html_r2_key: archiveKeys.htmlKey,
    created_at: existingDailySnapshot?.created_at ?? currentTime,
    updated_at: currentTime,
  };

  if (existingDailySnapshot) {
    await db
      .prepare(
        `UPDATE reports
         SET source_mode = ?1,
             generated_at = ?2,
             template_name = ?3,
             template_version = ?4,
             coverage_status = ?5,
             message_limit_hit = ?6,
             message_count = ?7,
             participant_count = ?8,
             active_user_count = ?9,
             total_characters = ?10,
             emoji_count = ?11,
             most_active_period = ?12,
             publish_payload_r2_key = ?13,
             render_bundle_r2_key = ?14,
             package_r2_key = ?15,
             render_html_r2_key = ?16,
             updated_at = ?17
         WHERE id = ?18`,
      )
      .bind(
        report.source_mode,
        report.generated_at,
        report.template_name,
        report.template_version,
        report.coverage_status,
        report.message_limit_hit,
        report.message_count,
        report.participant_count,
        report.active_user_count,
        report.total_characters,
        report.emoji_count,
        report.most_active_period,
        report.publish_payload_r2_key,
        report.render_bundle_r2_key,
        report.package_r2_key,
        report.render_html_r2_key,
        report.updated_at,
        report.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO reports (
           id, blog_id, report_kind, source_mode, snapshot_date, generated_at, template_name, template_version,
           coverage_status, message_limit_hit, message_count, participant_count, active_user_count, total_characters,
           emoji_count, most_active_period, publish_payload_r2_key, render_bundle_r2_key, package_r2_key,
           render_html_r2_key, created_at, updated_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
           ?9, ?10, ?11, ?12, ?13, ?14,
           ?15, ?16, ?17, ?18, ?19,
           ?20, ?21, ?22
         )`,
      )
      .bind(
        report.id,
        report.blog_id,
        report.report_kind,
        report.source_mode,
        report.snapshot_date,
        report.generated_at,
        report.template_name,
        report.template_version,
        report.coverage_status,
        report.message_limit_hit,
        report.message_count,
        report.participant_count,
        report.active_user_count,
        report.total_characters,
        report.emoji_count,
        report.most_active_period,
        report.publish_payload_r2_key,
        report.render_bundle_r2_key,
        report.package_r2_key,
        report.render_html_r2_key,
        report.created_at,
        report.updated_at,
      )
      .run();
  }

  await replaceReportAssetRecords(env, report.id, assetRecords);

  const reportViewPayload = {
    coverage_json: stableJsonStringify(payload.publish_payload.coverage),
    stats_json: stableJsonStringify(payload.publish_payload.stats),
    hourly_activity_json: stableJsonStringify(
      payload.publish_payload.activity.hourly_buckets ?? [],
    ),
    daily_activity_json: stableJsonStringify(
      payload.publish_payload.activity.daily_buckets ?? [],
    ),
    top_users_json: stableJsonStringify(
      payload.publish_payload.users.top_users ?? [],
    ),
    topics_json: stableJsonStringify(payload.publish_payload.topics ?? []),
    quotes_json: stableJsonStringify(payload.publish_payload.quotes ?? []),
    chat_quality_json: stableJsonStringify(
      payload.publish_payload.chat_quality_review ?? null,
    ),
  };

  await db
    .prepare(
      `INSERT INTO report_views (
         report_id, coverage_json, stats_json, hourly_activity_json, daily_activity_json, top_users_json,
         topics_json, quotes_json, chat_quality_json, created_at, updated_at
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6,
         ?7, ?8, ?9, ?10, ?11
       )
       ON CONFLICT(report_id) DO UPDATE SET
         coverage_json = excluded.coverage_json,
         stats_json = excluded.stats_json,
         hourly_activity_json = excluded.hourly_activity_json,
         daily_activity_json = excluded.daily_activity_json,
         top_users_json = excluded.top_users_json,
         topics_json = excluded.topics_json,
         quotes_json = excluded.quotes_json,
         chat_quality_json = excluded.chat_quality_json,
         updated_at = excluded.updated_at`,
    )
    .bind(
      report.id,
      reportViewPayload.coverage_json,
      reportViewPayload.stats_json,
      reportViewPayload.hourly_activity_json,
      reportViewPayload.daily_activity_json,
      reportViewPayload.top_users_json,
      reportViewPayload.topics_json,
      reportViewPayload.quotes_json,
      reportViewPayload.chat_quality_json,
      existingDailySnapshot ? existingDailySnapshot.created_at : currentTime,
      currentTime,
    )
    .run();

  await db
    .prepare(
      `UPDATE blogs
       SET latest_report_id = ?1,
           updated_at = ?2
       WHERE id = ?3`,
    )
    .bind(report.id, currentTime, blog.id)
    .run();

  await deleteCachedKeys(env, getBlogCacheKeys(blog.public_slug));

  return {
    blog: {
      ...blog,
      latest_report_id: report.id,
      updated_at: currentTime,
    },
    report,
    urls: {
      blog_url: `${origin}/g/${blog.public_slug}`,
      archive_url: `${origin}/g/${blog.public_slug}/archive`,
      report_url: `${origin}/g/${blog.public_slug}/reports/${getReportRouteKey(report)}`,
    },
  };
}
