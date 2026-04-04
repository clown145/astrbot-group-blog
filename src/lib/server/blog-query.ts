import type { BlogRecord, ReportRecord, ReportTrendPoint, ReportViewPayload } from "./blog-store";
import {
  getLatestReportForBlog,
  getReportViewPayload,
  listDailySnapshotTrendForBlog,
  listReportsForBlog,
} from "./blog-store";
import { getCachedJson, putCachedJson } from "./cache";
import type { RuntimeEnv } from "./runtime-env";

const HOME_CACHE_TTL_SECONDS = 60 * 5;
const ARCHIVE_CACHE_TTL_SECONDS = 60 * 5;

export interface BlogHomeModel {
  latestReport: ReportRecord | null;
  latestView: ReportViewPayload | null;
  trend: ReportTrendPoint[];
  recentReports: ReportRecord[];
}

export interface BlogArchiveModel {
  reports: ReportRecord[];
}

function getHomeCacheKey(slug: string): string {
  return `blog:home:${slug}`;
}

function getArchiveCacheKey(slug: string): string {
  return `blog:archive:${slug}`;
}

export async function getBlogHomeModel(
  env: RuntimeEnv,
  blog: Pick<BlogRecord, "id" | "public_slug">,
): Promise<BlogHomeModel> {
  const cacheKey = getHomeCacheKey(blog.public_slug);
  const cached = await getCachedJson<BlogHomeModel>(env, cacheKey);
  if (cached) {
    return cached;
  }

  const latestReport = await getLatestReportForBlog(env, blog.id);
  const [latestView, trend, recentReports] = await Promise.all([
    latestReport ? getReportViewPayload(env, latestReport.id) : Promise.resolve(null),
    listDailySnapshotTrendForBlog(env, blog.id, 30),
    listReportsForBlog(env, blog.id, 8),
  ]);

  const model: BlogHomeModel = {
    latestReport,
    latestView,
    trend,
    recentReports,
  };

  await putCachedJson(env, cacheKey, model, HOME_CACHE_TTL_SECONDS);
  return model;
}

export async function getBlogArchiveModel(
  env: RuntimeEnv,
  blog: Pick<BlogRecord, "id" | "public_slug">,
): Promise<BlogArchiveModel> {
  const cacheKey = getArchiveCacheKey(blog.public_slug);
  const cached = await getCachedJson<BlogArchiveModel>(env, cacheKey);
  if (cached) {
    return cached;
  }

  const model: BlogArchiveModel = {
    reports: await listReportsForBlog(env, blog.id, 60),
  };

  await putCachedJson(env, cacheKey, model, ARCHIVE_CACHE_TTL_SECONDS);
  return model;
}
