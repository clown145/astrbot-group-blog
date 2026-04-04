import { mkdtemp, mkdir, readFile, rm, writeFile, cp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const configPath = path.join(projectRoot, "template-source.config.json");

async function readConfig() {
  const raw = await readFile(configPath, "utf8");
  const config = JSON.parse(raw);

  return {
    repoUrl:
      process.env.TEMPLATE_REPO_URL ||
      config.repoUrl ||
      "https://github.com/clown145/astrbot_plugin_qq_group_daily_analysis.git",
    branch: process.env.TEMPLATE_REPO_BRANCH || config.branch || "main",
    subdir:
      process.env.TEMPLATE_REPO_SUBDIR ||
      config.subdir ||
      "src/infrastructure/reporting/templates",
    targetDir:
      process.env.TEMPLATE_TARGET_DIR ||
      config.targetDir ||
      "src/lib/report-templates/vendor",
  };
}

async function ensureGitAvailable() {
  await execFileAsync("git", ["--version"], {
    cwd: projectRoot,
  });
}

async function countFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(absolutePath);
    } else {
      total += 1;
    }
  }

  return total;
}

async function main() {
  const config = await readConfig();
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "astrbot-group-blog-templates-"),
  );
  const checkoutDir = path.join(tempRoot, "source");
  const absoluteTargetDir = path.join(projectRoot, config.targetDir);

  try {
    await ensureGitAvailable();

    console.log(`[sync:templates] cloning ${config.repoUrl}#${config.branch}`);
    await execFileAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        config.branch,
        config.repoUrl,
        checkoutDir,
      ],
      { cwd: projectRoot },
    );

    console.log(`[sync:templates] sparse checkout ${config.subdir}`);
    await execFileAsync(
      "git",
      ["-C", checkoutDir, "sparse-checkout", "set", config.subdir],
      { cwd: projectRoot },
    );

    const sourceDir = path.join(checkoutDir, config.subdir);

    await rm(absoluteTargetDir, { recursive: true, force: true });
    await mkdir(absoluteTargetDir, { recursive: true });
    await cp(sourceDir, absoluteTargetDir, { recursive: true });

    const manifestPath = path.join(absoluteTargetDir, "_manifest.json");
    const fileCount = await countFiles(absoluteTargetDir);

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          repoUrl: config.repoUrl,
          branch: config.branch,
          subdir: config.subdir,
          syncedAt: new Date().toISOString(),
          fileCount,
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      `[sync:templates] synced ${fileCount} files into ${config.targetDir}`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[sync:templates] failed");
  console.error(error);
  process.exitCode = 1;
});
