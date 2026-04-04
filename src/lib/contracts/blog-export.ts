export interface ProducerMetadata {
  name: string;
  version?: string;
  instance_id?: string;
}

export interface BlogExportTarget {
  platform: string;
  group_id: string;
  group_name?: string;
  timezone?: string;
}

export interface BlogExportReportMeta {
  report_kind: string;
  source_mode: string;
  snapshot_date?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  generated_at?: string;
  requested_days?: number | null;
  publish_as_official_snapshot?: boolean;
}

export interface CoverageMetadata {
  coverage_status?: string;
  message_limit_hit?: boolean | null;
  fetched_message_count?: number | null;
  analyzed_message_count?: number | null;
  dropped_message_count?: number | null;
  notes?: string[];
}

export interface StatsPayload {
  message_count?: number;
  participant_count?: number;
  active_user_count?: number;
  total_characters?: number;
  emoji_count?: number;
  most_active_period?: string;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface HourlyBucket {
  hour: number;
  message_count: number;
}

export interface DailyBucket {
  date: string;
  message_count: number;
}

export interface TopUserPayload {
  user_hash: string;
  display_name: string;
  user_id: string;
  message_count: number;
  char_count: number;
  emoji_count: number;
  reply_count: number;
  most_active_hour?: number | null;
  night_ratio: number;
}

export interface PublishPayloadV1 {
  schema_version: "publish_payload_v1";
  producer?: ProducerMetadata;
  target: BlogExportTarget;
  report: BlogExportReportMeta;
  coverage: CoverageMetadata;
  stats: StatsPayload;
  activity: {
    hourly_buckets: HourlyBucket[];
    daily_buckets: DailyBucket[];
  };
  users: {
    top_users: TopUserPayload[];
  };
  topics: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  chat_quality_review?: Record<string, unknown> | null;
  raw_flags?: Record<string, boolean>;
}

export interface ReportRenderBundleV1 {
  schema_version: "report_render_bundle_v1";
  report_meta: {
    report_id?: string;
    platform?: string;
    group_id?: string;
    group_name?: string;
    report_kind?: string;
    source_mode?: string;
    snapshot_date?: string | null;
    template_name?: string;
    layout_template_name?: string;
    template_version?: string;
    timezone?: string;
    generated_at?: string;
  };
  render_context?: Record<string, unknown>;
  assets?: Record<string, unknown>;
}

export interface BlogExportPackageV1 {
  schema_version: "blog_export_package_v1";
  publish_payload: PublishPayloadV1;
  render_bundle: ReportRenderBundleV1;
}

export function isBlogExportPackageV1(
  input: unknown,
): input is BlogExportPackageV1 {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  const publishPayload = candidate.publish_payload as Record<string, unknown> | undefined;
  const target = publishPayload?.target as Record<string, unknown> | undefined;
  const report = publishPayload?.report as Record<string, unknown> | undefined;

  return (
    candidate.schema_version === "blog_export_package_v1" &&
    publishPayload?.schema_version === "publish_payload_v1" &&
    typeof target?.platform === "string" &&
    typeof target?.group_id === "string" &&
    typeof report?.report_kind === "string" &&
    typeof report?.source_mode === "string" &&
    (candidate.render_bundle as Record<string, unknown> | undefined)
      ?.schema_version === "report_render_bundle_v1" &&
    typeof (candidate.render_bundle as Record<string, unknown> | undefined)
      ?.report_meta === "object"
  );
}
