import type { ReportRenderBundleV1 } from "@/lib/contracts/blog-export";

import { createId } from "./ids";
import { nowIso } from "./runtime-time";
import { requireArchiveBucket, requireBlogDatabase } from "./storage";
import type { RuntimeEnv } from "./runtime-env";
import { decodeDataUri, guessFileExtension } from "./data-uri";

export interface ReportAssetRecord {
  id: string;
  report_id: string;
  asset_id: string;
  asset_kind: string;
  user_id: string | null;
  content_type: string;
  byte_size: number;
  r2_key: string;
  created_at: string;
  updated_at: string;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function cloneRenderBundle(renderBundle: ReportRenderBundleV1): ReportRenderBundleV1 {
  return JSON.parse(JSON.stringify(renderBundle)) as ReportRenderBundleV1;
}

export async function storeReportAssets(
  env: RuntimeEnv,
  input: {
    blogSlug: string;
    reportId: string;
    origin: string;
    renderBundle: ReportRenderBundleV1;
  },
): Promise<{
  normalizedRenderBundle: ReportRenderBundleV1;
  assetRecords: ReportAssetRecord[];
}> {
  const archive = requireArchiveBucket(env);
  const normalizedRenderBundle = cloneRenderBundle(input.renderBundle);
  const normalizedAssets = toRecord(normalizedRenderBundle.assets);
  const avatars = toRecordArray(normalizedAssets.avatars);
  const assetUrlByDataUri = new Map<string, string>();
  const currentTime = nowIso();
  const assetRecords: ReportAssetRecord[] = [];

  for (const avatar of avatars) {
    const assetId =
      typeof avatar.asset_id === "string" && avatar.asset_id.trim()
        ? avatar.asset_id.trim()
        : null;
    const dataUri =
      typeof avatar.data_uri === "string" && avatar.data_uri.startsWith("data:")
        ? avatar.data_uri
        : null;

    if (!assetId || !dataUri) {
      continue;
    }

    const decoded = decodeDataUri(dataUri);
    if (!decoded) {
      continue;
    }

    const extension = guessFileExtension(decoded.contentType);
    const r2Key = `blogs/${input.blogSlug}/reports/${input.reportId}/assets/${assetId}.${extension}`;
    await archive.put(r2Key, decoded.bytes, {
      httpMetadata: {
        contentType: decoded.contentType,
      },
      customMetadata: {
        reportId: input.reportId,
        assetId,
        assetKind: "avatar",
      },
    });

    const assetUrl = `${input.origin}/g/${input.blogSlug}/assets/${input.reportId}/${assetId}`;
    assetUrlByDataUri.set(dataUri, assetUrl);

    const record: ReportAssetRecord = {
      id: createId("asset"),
      report_id: input.reportId,
      asset_id: assetId,
      asset_kind: "avatar",
      user_id:
        typeof avatar.user_id === "string" && avatar.user_id.trim()
          ? avatar.user_id.trim()
          : null,
      content_type: decoded.contentType,
      byte_size: decoded.bytes.byteLength,
      r2_key: r2Key,
      created_at: currentTime,
      updated_at: currentTime,
    };

    assetRecords.push(record);
  }

  const renderContext = toRecord(normalizedRenderBundle.render_context);
  const titles = toRecordArray(renderContext.titles).map((title) => {
    const avatarData =
      typeof title.avatar_data === "string" ? title.avatar_data : null;
    if (!avatarData || !assetUrlByDataUri.has(avatarData)) {
      return title;
    }

    return {
      ...title,
      avatar_data: assetUrlByDataUri.get(avatarData),
    };
  });

  const quotes = toRecordArray(renderContext.quotes).map((quote) => {
    const avatarUrl =
      typeof quote.avatar_url === "string" ? quote.avatar_url : null;
    if (!avatarUrl || !assetUrlByDataUri.has(avatarUrl)) {
      return quote;
    }

    return {
      ...quote,
      avatar_url: assetUrlByDataUri.get(avatarUrl),
    };
  });

  normalizedRenderBundle.render_context = {
    ...renderContext,
    titles,
    quotes,
  };

  normalizedRenderBundle.assets = {
    ...normalizedAssets,
    avatars: avatars.map((avatar) => {
      const dataUri =
        typeof avatar.data_uri === "string" ? avatar.data_uri : null;

      return {
        ...avatar,
        data_uri: undefined,
        asset_url: dataUri ? assetUrlByDataUri.get(dataUri) ?? null : null,
      };
    }),
  };

  return {
    normalizedRenderBundle,
    assetRecords,
  };
}

export async function replaceReportAssetRecords(
  env: RuntimeEnv,
  reportId: string,
  assetRecords: ReportAssetRecord[],
): Promise<void> {
  const db = requireBlogDatabase(env);

  await db
    .prepare(`DELETE FROM report_assets WHERE report_id = ?1`)
    .bind(reportId)
    .run();

  for (const record of assetRecords) {
    await db
      .prepare(
        `INSERT INTO report_assets (
           id, report_id, asset_id, asset_kind, user_id, content_type, byte_size, r2_key, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        record.id,
        record.report_id,
        record.asset_id,
        record.asset_kind,
        record.user_id,
        record.content_type,
        record.byte_size,
        record.r2_key,
        record.created_at,
        record.updated_at,
      )
      .run();
  }
}

export async function getReportAssetRecord(
  env: RuntimeEnv,
  reportId: string,
  assetId: string,
): Promise<ReportAssetRecord | null> {
  const db = requireBlogDatabase(env);
  return (await db
    .prepare(
      `SELECT id, report_id, asset_id, asset_kind, user_id, content_type, byte_size, r2_key, created_at, updated_at
       FROM report_assets
       WHERE report_id = ?1 AND asset_id = ?2
       LIMIT 1`,
    )
    .bind(reportId, assetId)
    .first<ReportAssetRecord>()) ?? null;
}
