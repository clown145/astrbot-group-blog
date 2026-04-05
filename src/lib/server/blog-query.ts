import type {
  BlogRecord,
  ReportRecord,
  ReportTrendPoint,
  ReportViewPayload,
} from "./blog-store";
import {
  getLatestReportForBlog,
  getReportViewPayload,
  listDailySnapshotReportsForBlog,
  listReportsForBlog,
} from "./blog-store";
import { getCachedJson, putCachedJson } from "./cache";
import type { RuntimeEnv } from "./runtime-env";

const HOME_CACHE_TTL_SECONDS = 60 * 5;
const ARCHIVE_CACHE_TTL_SECONDS = 60 * 5;

export interface DerivedTrendPoint {
  snapshot_date: string;
  message_count: number;
  participant_count: number;
  active_user_count: number;
  chars_per_message: number;
  emoji_per_100_messages: number;
}

export interface HourlyAverageBucket {
  hour: number;
  average_message_count: number;
  total_message_count: number;
}

export interface HeatmapCell {
  date: string;
  hour: number;
  message_count: number;
}

export interface CoveragePoint {
  date: string;
  coverage_status: string;
  message_limit_hit: boolean;
  fetched_message_count: number | null;
  analyzed_message_count: number | null;
  dropped_message_count: number | null;
}

export interface CoverageSummary {
  full: number;
  partial: number;
  truncated: number;
  unknown: number;
}

export interface UserAppearancePoint {
  user_hash: string;
  display_name: string;
  appearance_count: number;
  total_message_count: number;
  total_char_count: number;
  total_emoji_count: number;
  total_reply_count: number;
  average_rank: number;
}

export interface TopicAggregatePoint {
  name: string;
  occurrence_count: number;
}

export interface BlogHomeModel {
  latestReport: ReportRecord | null;
  latestView: ReportViewPayload | null;
  trend: ReportTrendPoint[];
  derivedTrend: DerivedTrendPoint[];
  averagedHourly: HourlyAverageBucket[];
  heatmap: HeatmapCell[];
  coverageTimeline: CoveragePoint[];
  coverageSummary: CoverageSummary;
  recurringTopUsers: UserAppearancePoint[];
  recurringTopics: TopicAggregatePoint[];
  recentReports: ReportRecord[];
}

export interface BlogArchiveModel {
  reports: ReportRecord[];
}

type UnknownRecord = Record<string, unknown>;

function getHomeCacheKey(slug: string): string {
  return `blog:home:${slug}`;
}

function getArchiveCacheKey(slug: string): string {
  return `blog:archive:${slug}`;
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

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  return toNumber(value, 0);
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function toRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function normalizeCoverageStatus(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "full" ||
    normalized === "partial" ||
    normalized === "truncated"
  ) {
    return normalized;
  }

  return "unknown";
}

function normalizeTopicName(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCoverageSummary(points: CoveragePoint[]): CoverageSummary {
  return points.reduce<CoverageSummary>((accumulator, point) => {
    switch (point.coverage_status) {
      case "full":
        accumulator.full += 1;
        break;
      case "partial":
        accumulator.partial += 1;
        break;
      case "truncated":
        accumulator.truncated += 1;
        break;
      default:
        accumulator.unknown += 1;
        break;
    }
    return accumulator;
  }, {
    full: 0,
    partial: 0,
    truncated: 0,
    unknown: 0,
  });
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
  const dailyReportsDesc = await listDailySnapshotReportsForBlog(env, blog.id, 30);
  const dailyReports = dailyReportsDesc
    .slice()
    .reverse()
    .filter((report) => Boolean(report.snapshot_date));
  const [latestView, recentReports, dailyViews] = await Promise.all([
    latestReport ? getReportViewPayload(env, latestReport.id) : Promise.resolve(null),
    listReportsForBlog(env, blog.id, 8),
    Promise.all(dailyReports.map((report) => getReportViewPayload(env, report.id))),
  ]);

  const trend: ReportTrendPoint[] = dailyReports.map((report) => ({
    id: report.id,
    report_kind: report.report_kind,
    snapshot_date: report.snapshot_date,
    generated_at: report.generated_at,
    message_count: report.message_count,
    participant_count: report.participant_count,
    active_user_count: report.active_user_count,
  }));

  const derivedTrend: DerivedTrendPoint[] = dailyReports.map((report) => ({
    snapshot_date: report.snapshot_date ?? report.generated_at.slice(0, 10),
    message_count: report.message_count,
    participant_count: report.participant_count,
    active_user_count: report.active_user_count,
    chars_per_message:
      report.message_count > 0
        ? Number((report.total_characters / report.message_count).toFixed(2))
        : 0,
    emoji_per_100_messages:
      report.message_count > 0
        ? Number(((report.emoji_count / report.message_count) * 100).toFixed(2))
        : 0,
  }));

  const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total_message_count: 0,
  }));
  const heatmap: HeatmapCell[] = [];
  const coverageTimeline: CoveragePoint[] = [];
  const recurringTopUserMap = new Map<
    string,
    {
      user_hash: string;
      display_name: string;
      appearance_count: number;
      total_message_count: number;
      total_char_count: number;
      total_emoji_count: number;
      total_reply_count: number;
      total_rank_sum: number;
    }
  >();
  const topicMap = new Map<string, TopicAggregatePoint>();

  dailyReports.forEach((report, index) => {
    const view = dailyViews[index];
    const date = report.snapshot_date ?? report.generated_at.slice(0, 10);
    const coverage = toRecord(view?.coverage);
    coverageTimeline.push({
      date,
      coverage_status: normalizeCoverageStatus(coverage.coverage_status),
      message_limit_hit: toBoolean(coverage.message_limit_hit),
      fetched_message_count: toNullableNumber(coverage.fetched_message_count),
      analyzed_message_count: toNullableNumber(coverage.analyzed_message_count),
      dropped_message_count: toNullableNumber(coverage.dropped_message_count),
    });

    const hourlyBuckets = toRecordArray(view?.hourly_activity);
    hourlyBuckets.forEach((bucket) => {
      const hour = toNumber(bucket.hour, -1);
      if (hour < 0 || hour > 23) {
        return;
      }

      const messageCount = toNumber(bucket.message_count);
      hourlyTotals[hour].total_message_count += messageCount;
      heatmap.push({
        date,
        hour,
        message_count: messageCount,
      });
    });

    const topUsers = toRecordArray(view?.top_users);
    topUsers.forEach((user, userIndex) => {
      const userHash =
        String(user.user_hash ?? "").trim() ||
        String(user.user_id ?? "").trim() ||
        String(user.display_name ?? "").trim();
      if (!userHash) {
        return;
      }

      const existing = recurringTopUserMap.get(userHash) ?? {
        user_hash: userHash,
        display_name: String(user.display_name ?? "未知成员"),
        appearance_count: 0,
        total_message_count: 0,
        total_char_count: 0,
        total_emoji_count: 0,
        total_reply_count: 0,
        total_rank_sum: 0,
      };

      existing.display_name =
        String(user.display_name ?? "").trim() || existing.display_name;
      existing.appearance_count += 1;
      existing.total_message_count += toNumber(user.message_count);
      existing.total_char_count += toNumber(user.char_count);
      existing.total_emoji_count += toNumber(user.emoji_count);
      existing.total_reply_count += toNumber(user.reply_count);
      existing.total_rank_sum += userIndex + 1;
      recurringTopUserMap.set(userHash, existing);
    });

    const topics = toRecordArray(view?.topics);
    topics.forEach((topic) => {
      const topicName = normalizeTopicName(
        topic.name ?? toRecord(topic.topic).topic ?? toRecord(topic.topic).name,
      );
      if (!topicName) {
        return;
      }

      const current = topicMap.get(topicName) ?? {
        name: topicName,
        occurrence_count: 0,
      };
      current.occurrence_count += 1;
      topicMap.set(topicName, current);
    });
  });

  const dayCount = Math.max(dailyReports.length, 1);
  const averagedHourly: HourlyAverageBucket[] = hourlyTotals.map((bucket) => ({
    hour: bucket.hour,
    total_message_count: bucket.total_message_count,
    average_message_count: Number(
      (bucket.total_message_count / dayCount).toFixed(2),
    ),
  }));

  const recurringTopUsers = Array.from(recurringTopUserMap.values())
    .map<UserAppearancePoint>((entry) => ({
      user_hash: entry.user_hash,
      display_name: entry.display_name,
      appearance_count: entry.appearance_count,
      total_message_count: entry.total_message_count,
      total_char_count: entry.total_char_count,
      total_emoji_count: entry.total_emoji_count,
      total_reply_count: entry.total_reply_count,
      average_rank: Number((entry.total_rank_sum / entry.appearance_count).toFixed(2)),
    }))
    .sort((left, right) => {
      if (right.appearance_count !== left.appearance_count) {
        return right.appearance_count - left.appearance_count;
      }
      return right.total_message_count - left.total_message_count;
    })
    .slice(0, 10);

  const recurringTopics = Array.from(topicMap.values())
    .sort((left, right) => right.occurrence_count - left.occurrence_count)
    .slice(0, 12);

  const model: BlogHomeModel = {
    latestReport,
    latestView,
    trend,
    derivedTrend,
    averagedHourly,
    heatmap,
    coverageTimeline,
    coverageSummary: buildCoverageSummary(coverageTimeline),
    recurringTopUsers,
    recurringTopics,
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
