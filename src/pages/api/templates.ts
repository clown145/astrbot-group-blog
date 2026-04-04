import type { APIRoute } from "astro";

import {
  getTemplateSyncManifest,
  listTemplateFiles,
  listTemplateNames,
} from "@/lib/report-templates/registry";

export const prerender = false;

export const GET: APIRoute = async () => {
  const files = listTemplateFiles().map((entry) => ({
    templateName: entry.templateName,
    relativePath: entry.relativePath,
    size: entry.content.length,
  }));

  return Response.json({
    ok: true,
    templates: listTemplateNames(),
    files,
    templateSync: getTemplateSyncManifest(),
  });
};
