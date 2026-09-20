import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
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
  return match?.[1]?.replace(/[\r\n=]+/g, " ").trim() ?? "";
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

async function listSkills() {
  if (!existsSync(publishedRoot)) return;
  const entries = await readdir(publishedRoot, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = path.join(publishedRoot, entry.name);
    if (!existsSync(path.join(directory, "SKILL.md"))) continue;
    console.log(`${entry.name}\t${await readDescription(directory)}`);
  }
}

function showDiff(development, published) {
  if (!existsSync(published)) {
    console.log(`首次发布：${path.relative(root, development)} -> ${path.relative(root, published)}`);
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
    filter: (current) => ![".source", ".DS_Store", "node_modules"].includes(path.basename(current)),
  });
}

function prepareRuntimeDependencies(published) {
  const packageFile = path.join(published, "package.json");
  const lockFile = path.join(published, "package-lock.json");
  if (!existsSync(packageFile) && !existsSync(lockFile)) return;
  if (!existsSync(packageFile) || !existsSync(lockFile)) {
    fail(`${path.relative(root, published)} 必须同时包含 package.json 和 package-lock.json。`);
  }
  const status = run("npm", ["ci", "--omit=dev", "--prefix", published]);
  if (status !== 0) fail(`${path.relative(root, published)} 运行依赖准备失败。`);
}

async function publishSkill(name, flags) {
  assertSkillName(name);
  const development = path.join(developmentRoot, name);
  const published = path.join(publishedRoot, name);
  await validate(development);
  if (!showDiff(development, published)) return;

  if (flags.has("--dry-run")) {
    console.log("预览完成，未发布。");
    return;
  }

  if (!flags.has("--yes")) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`确认发布 ${name}？输入 yes 继续：`);
    prompt.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("已取消，未发布。");
      return;
    }
  }

  await mkdir(publishedRoot, { recursive: true });
  const staging = path.join(publishedRoot, `.staging-${name}-${randomUUID()}`);
  const backup = path.join(publishedRoot, `.backup-${name}-${randomUUID()}`);
  const previousRelease = await readKeyValues(path.join(published, ".release"));
  const source = await readKeyValues(path.join(development, ".source"));

  try {
    await copyRuntimeFiles(development, staging);
    const release = [
      `version=${nextVersion(previousRelease.version)}`,
      `source=my-skills/${name}`,
      `upstream_source=${source.source ?? "original"}`,
      `upstream_commit=${source.commit ?? "none"}`,
      `content_sha256=${await contentHash(staging)}`,
      `content_summary=${await readDescription(staging)}`,
      `published_at=${publishedAt()}`,
      `targets=${source.targets ?? previousRelease.targets ?? "codex"}`,
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
    console.log(`已发布 ${name}：${release.split("\n", 1)[0].slice("version=".length)}`);
  } finally {
    if (existsSync(staging)) await rm(staging, { recursive: true });
  }
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
  const published = path.join(publishedRoot, name);
  await validate(published);
  const release = await readKeyValues(path.join(published, ".release"));
  prepareRuntimeDependencies(published);
  for (const target of resolveTargets(release.targets, argv)) {
    await installTarget(name, published, target);
  }
}

const [command, name, ...rest] = process.argv.slice(2);
const flags = new Set(rest);

switch (command) {
  case "list":
    await listSkills();
    break;
  case "publish":
    await publishSkill(name, flags);
    break;
  case "install":
    await installSkill(name, rest);
    break;
  default:
    console.log("可用命令：list、publish <skill-name> [--dry-run|--yes]、install <skill-name> [--target=codex,claude-code]");
    process.exit(command ? 1 : 0);
}
