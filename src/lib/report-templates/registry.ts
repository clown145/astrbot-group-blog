import manifest from "./vendor/_manifest.json";

const templateModules = import.meta.glob("./vendor/**/*.html", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

export interface TemplateRegistryEntry {
  templateName: string;
  relativePath: string;
  content: string;
}

export function listTemplateFiles(): TemplateRegistryEntry[] {
  return Object.entries(templateModules)
    .map(([modulePath, content]) => {
      const relativePath = modulePath.replace("./vendor/", "");
      const [templateName = "unknown"] = relativePath.split("/");

      return {
        templateName,
        relativePath,
        content,
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function listTemplateNames(): string[] {
  return [...new Set(listTemplateFiles().map((entry) => entry.templateName))];
}

export function listTemplateFilesForTemplate(
  templateName: string,
): TemplateRegistryEntry[] {
  return listTemplateFiles().filter((entry) => entry.templateName === templateName);
}

export function getTemplateFileContent(
  templateName: string,
  fileName: string,
): string | null {
  const entry = listTemplateFilesForTemplate(templateName).find((item) => {
    const parts = item.relativePath.split("/");
    return parts[1] === fileName;
  });

  return entry?.content ?? null;
}

export function getTemplateSyncManifest() {
  return manifest;
}
