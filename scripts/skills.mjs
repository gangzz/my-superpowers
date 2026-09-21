import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const developmentRoot = path.join(root, "my-skills");
const publishedRoot = path.join(root, "published-skills");
const validator = path.join(
  homedir(),
  ".codex/skills/.system/skill-creator/scripts/quick_validate.py",
);
const installationRoots = {
  codex: path.join(homedir(), ".agents/skills"),
  "claude-code": path.join(homedir(), ".claude/skills"),
};

function fail(message) {
  console.error(`错误：${message}`);
  process.exit(1);
}

function assertSkillName(name) {
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    fail("请提供合法的 Skill 名称，例如 brainstorming。");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) fail(result.error.message);
  return result.status ?? 1;
}

async function readKeyValues(file) {
  if (!existsSync(file)) return {};
  const entries = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) entries[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return entries;
}

async function readDescription(skillDirectory) {
  const content = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
  const match = content.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  const description = match?.[1]?.replace(/[\r\n=]+/g, " ").trim() ?? "";
  const firstSentence = description.match(/^.*?(?:[。！？]|[.!?](?=\s|$))/u);
  return firstSentence?.[0].trim() ?? description;
}

async function validate(skillDirectory) {
  if (!existsSync(path.join(skillDirectory, "SKILL.md"))) {
    fail(`找不到 ${path.relative(root, skillDirectory)}/SKILL.md`);
  }
  if (!existsSync(validator)) fail(`找不到结构验证器：${validator}`);
  const status = run("uv", ["run", "--with", "pyyaml", "python", validator, skillDirectory]);
  if (status !== 0) fail(`${path.relative(root, skillDirectory)} 验证失败。`);
}

async function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".release", ".source", ".DS_Store", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute));
  }
  return files.sort();
}

async function contentHash(directory) {
  const hash = createHash("sha256");
  for (const relative of await listFiles(directory)) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(directory, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function shanghaiParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return parts;
}

function nextVersion(previousVersion = "") {
  const { year, month, day } = shanghaiParts();
  const prefix = `${year}.${month}.${day}`;
  const match = previousVersion.match(new RegExp(`^${prefix.replaceAll(".", "\\.")}\\.(\\d+)$`));
  return `${prefix}.${match ? Number(match[1]) + 1 : 1}`;
}

function publishedAt() {
  const { year, month, day, hour, minute, second } = shanghaiParts();
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+0800`;
}

async function skillNames(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
    .filter((entry) => entry.isDirectory() && existsSync(path.join(directory, entry.name, "SKILL.md")))
    .map((entry) => entry.name);
}

async function managedInstallationNames() {
  const names = new Set();
  for (const installationRoot of Object.values(installationRoots)) {
    if (!existsSync(installationRoot)) continue;
    for (const entry of await readdir(installationRoot, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const destination = path.join(installationRoot, entry.name);
      const target = path.resolve(path.dirname(destination), await readlink(destination));
      const relative = path.relative(publishedRoot, target);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !relative.includes(path.sep)) {
        names.add(entry.name);
      }
    }
  }
  return names;
}

async function installationStatus(name, target) {
  const destination = path.join(installationRoots[target], name);
  const existing = await lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing) return null;
  if (!existing.isSymbolicLink()) return `${target}:conflict`;

  const linked = path.resolve(path.dirname(destination), await readlink(destination));
  const published = path.join(publishedRoot, name);
  if (linked !== published) return `${target}:conflict`;
  return existsSync(path.join(published, "SKILL.md")) ? target : `${target}:broken`;
}

async function listSkills() {
  const names = new Set([
    ...await skillNames(developmentRoot),
    ...await skillNames(publishedRoot),
    ...await managedInstallationNames(),
  ]);

  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  const rows = [];
  for (const name of sortedNames) {
    const development = path.join(developmentRoot, name);
    const published = path.join(publishedRoot, name);
    const hasDevelopment = existsSync(path.join(development, "SKILL.md"));
    const hasPublished = existsSync(path.join(published, "SKILL.md"));
    const release = hasPublished ? await readKeyValues(path.join(published, ".release")) : {};

    let draft = "-";
    if (hasDevelopment && !hasPublished) draft = "new";
    else if (!hasDevelopment && hasPublished) draft = "source-missing";
    else if (hasDevelopment && hasPublished) {
      const developmentHash = await contentHash(development);
      const publishedHash = await contentHash(published);
      if (developmentHash !== publishedHash || release.content_sha256 !== publishedHash) draft = "changed";
    }

    const installed = (await Promise.all(
      Object.keys(installationRoots).map((target) => installationStatus(name, target)),
    )).filter(Boolean);
    const descriptionDirectory = hasDevelopment ? development : published;
    const description = existsSync(path.join(descriptionDirectory, "SKILL.md"))
      ? await readDescription(descriptionDirectory)
      : "";
    const publishedVersion = hasPublished ? release.version ?? "invalid" : "-";
    rows.push({
      skill: name,
      draft,
      published: publishedVersion,
      installed: installed.join(", ") || "-",
      description,
    });
  }

  const headers = {
    skill: "SKILL",
    draft: "DRAFT",
    published: "PUBLISHED",
    installed: "INSTALLED",
    description: "DESCRIPTION",
  };
  const keys = ["skill", "draft", "published", "installed"];
  const widths = Object.fromEntries(keys.map((key) => [
    key,
    Math.max(headers[key].length, ...rows.map((row) => row[key].length)),
  ]));
  const formatColumns = (row) => keys
    .map((key) => row[key].padEnd(widths[key]))
    .join("   ");

  console.log(`${formatColumns(headers)}   ${headers.description}`);
  console.log(`${keys.map((key) => "-".repeat(widths[key])).join("   ")}   ${"-".repeat(headers.description.length)}`);
  for (const row of rows) console.log(`${formatColumns(row)}   ${row.description}`);
}

function showDiff(development, published) {
  if (!existsSync(published)) {
    console.log(`首次生成发布快照：${path.relative(root, development)} -> ${path.relative(root, published)}`);
    return true;
  }
  const result = spawnSync("diff", [
    "-ruN",
    "--exclude=.source",
    "--exclude=.release",
    "--exclude=.DS_Store",
    "--exclude=node_modules",
    published,
    development,
  ], { cwd: root, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) {
    console.log("开发版与发布版没有运行内容差异。");
    return false;
  }
  if (result.status !== 1) fail("无法比较开发版与发布版。");
  return true;
}

async function copyRuntimeFiles(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: (current) => ![".source", ".release", ".DS_Store", "node_modules"].includes(path.basename(current)),
  });
}

function prepareRuntimeDependencies(published) {
  const packageFile = path.join(published, "package.json");
  const npmLockFile = path.join(published, "package-lock.json");
  const pnpmLockFile = path.join(published, "pnpm-lock.yaml");
  const hasPackage = existsSync(packageFile);
  const hasNpmLock = existsSync(npmLockFile);
  const hasPnpmLock = existsSync(pnpmLockFile);
  if (!hasPackage && !hasNpmLock && !hasPnpmLock) return;
  if (!hasPackage || hasNpmLock === hasPnpmLock) {
    fail(`${path.relative(root, published)} 必须包含 package.json，且只能包含一种受支持的锁文件：package-lock.json 或 pnpm-lock.yaml。`);
  }

  const status = hasNpmLock
    ? run("npm", ["ci", "--omit=dev", "--prefix", published])
    : run("pnpm", ["--dir", published, "install", "--prod", "--frozen-lockfile"]);
  if (status !== 0) fail(`${path.relative(root, published)} 运行依赖准备失败。`);
}

async function preparePublishedSkill(name) {
  const development = path.join(developmentRoot, name);
  const published = path.join(publishedRoot, name);
  await validate(development);
  const contentChanged = showDiff(development, published);

  const previousRelease = await readKeyValues(path.join(published, ".release"));
  const source = await readKeyValues(path.join(development, ".source"));
  const expectedMetadata = {
    source: `my-skills/${name}`,
    upstream_source: source.source ?? "original",
    upstream_commit: source.commit ?? "none",
    content_summary: await readDescription(development),
    targets: source.targets ?? previousRelease.targets ?? "codex",
  };
  const publishedHash = existsSync(published) ? await contentHash(published) : "";
  const metadataChanged = !previousRelease.version
    || previousRelease.content_sha256 !== publishedHash
    || Object.entries(expectedMetadata).some(([key, value]) => previousRelease[key] !== value);
  if (!contentChanged && !metadataChanged) return published;
  if (!contentChanged && metadataChanged) console.log("运行内容未变化，发布元数据需要刷新。");

  await mkdir(publishedRoot, { recursive: true });
  const staging = path.join(publishedRoot, `.staging-${name}-${randomUUID()}`);
  const backup = path.join(publishedRoot, `.backup-${name}-${randomUUID()}`);

  try {
    await copyRuntimeFiles(development, staging);
    const release = [
      `version=${nextVersion(previousRelease.version)}`,
      `source=${expectedMetadata.source}`,
      `upstream_source=${expectedMetadata.upstream_source}`,
      `upstream_commit=${expectedMetadata.upstream_commit}`,
      `content_sha256=${await contentHash(staging)}`,
      `content_summary=${expectedMetadata.content_summary}`,
      `published_at=${publishedAt()}`,
      `targets=${expectedMetadata.targets}`,
      "",
    ].join("\n");
    await writeFile(path.join(staging, ".release"), release, "utf8");
    await validate(staging);

    if (existsSync(published)) await rename(published, backup);
    try {
      await rename(staging, published);
    } catch (error) {
      if (existsSync(backup)) await rename(backup, published);
      throw error;
    }
    if (existsSync(backup)) await rm(backup, { recursive: true });
    console.log(`已生成发布快照 ${name}：${release.split("\n", 1)[0].slice("version=".length)}`);
  } finally {
    if (existsSync(staging)) await rm(staging, { recursive: true });
  }
  return published;
}

function readOption(argv, option) {
  const index = argv.findIndex((item) => item === option || item.startsWith(`${option}=`));
  if (index === -1) return undefined;
  const item = argv[index];
  const value = item.includes("=") ? item.slice(item.indexOf("=") + 1) : argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${option} 需要一个值。`);
  return value;
}

function resolveTargets(releaseTargets, argv) {
  const override = readOption(argv, "--target");
  const source = override === undefined ? releaseTargets : override;
  const targets = [...new Set((source ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
  const available = Object.keys(installationRoots).join("、");
  if (!targets.length) {
    fail(`未指定安装目标。请在 .release 中设置 targets，或使用 --target=<平台>。可用目标：${available}。`);
  }
  const unknown = targets.filter((target) => !(target in installationRoots));
  if (unknown.length) fail(`未知安装目标：${unknown.join("、")}。可用目标：${available}。`);
  return targets;
}

async function installTarget(name, published, target) {
  const installationRoot = installationRoots[target];
  const destination = path.join(installationRoot, name);
  await mkdir(installationRoot, { recursive: true });

  const existing = await lstat(destination).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    const current = await realpath(destination).catch(() => null);
    if (current === await realpath(published)) {
      console.log(`${target}：${name} 已安装（${destination}）`);
      return;
    }
    fail(`${destination} 已存在，未覆盖。请先人工确认并处理该路径。`);
  }

  await symlink(published, destination, "dir");
  console.log(`${target}：已安装 ${name}（${destination} -> ${published}）`);
}

async function installSkill(name, argv) {
  assertSkillName(name);
  const development = path.join(developmentRoot, name);
  if (argv.includes("--dry-run")) {
    await validate(development);
    showDiff(development, path.join(publishedRoot, name));
    console.log("预览完成，未生成发布快照，也未安装。");
    return;
  }

  const published = await preparePublishedSkill(name);
  const release = await readKeyValues(path.join(published, ".release"));
  prepareRuntimeDependencies(published);
  for (const target of resolveTargets(release.targets, argv)) {
    await installTarget(name, published, target);
  }
}

function installSkillNames(argv) {
  const names = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument.startsWith("--target=")) continue;
    if (argument === "--target") {
      index += 1;
      if (!argv[index] || argv[index].startsWith("--")) fail("--target 需要一个值。");
      continue;
    }
    if (argument.startsWith("--")) fail(`未知选项：${argument}`);
    names.push(argument);
  }
  if (!names.length) fail("请至少提供一个 Skill 名称。");
  return names;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "list":
    await listSkills();
    break;
  case "install": {
    const names = installSkillNames(args);
    for (const [index, name] of names.entries()) {
      if (index > 0) console.log();
      await installSkill(name, args);
    }
    break;
  }
  default:
    console.log("可用命令：list、install <skill-name>... [--target=codex,claude-code] [--dry-run]");
    process.exit(command ? 1 : 0);
}
