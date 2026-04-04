import type { APIRoute } from "astro";

import { getTemplateSyncManifest, listTemplateNames } from "@/lib/report-templates/registry";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({
    ok: true,
    service: "astrbot-group-blog",
    availableTemplates: listTemplateNames(),
    templateSync: getTemplateSyncManifest(),
  });
};
