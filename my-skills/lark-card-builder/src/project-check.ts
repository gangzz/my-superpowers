import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { BUILDER_VERSION } from "./version.js";

export type ProjectVersionStatus =
  | "current"
  | "missing"
  | "update_available"
  | "newer"
  | "unknown";

export interface InstallCommand {
  executable: "pnpm" | "npm" | "yarn" | "bun";
  args: string[];
  display: string;
}

export interface ProjectVersionCheck {
  status: ProjectVersionStatus;
  projectPath: string;
  bundledVersion: string;
  installedVersion: string | null;
  packagePath: string;
  install: InstallCommand | null;
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number | null {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = parsedLeft[index]! - parsedRight[index]!;
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(
  projectPath: string,
): Promise<InstallCommand["executable"]> {
  const candidates: Array<[string, InstallCommand["executable"]]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
  ];
  for (const [file, manager] of candidates) {
    if (await exists(path.join(projectPath, file))) return manager;
  }

  try {
    const manifest = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf8"),
    ) as { packageManager?: unknown };
    if (typeof manifest.packageManager === "string") {
      const manager = manifest.packageManager.split("@", 1)[0];
      if (manager === "pnpm" || manager === "npm" || manager === "yarn" || manager === "bun") {
        return manager;
      }
    }
  } catch {
    // A missing or unreadable project manifest does not prevent a local check.
  }
  return "npm";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function installCommand(
  projectPath: string,
  packagePath: string,
): Promise<InstallCommand> {
  const executable = await detectPackageManager(projectPath);
  const verb = executable === "npm" ? "install" : "add";
  const args = [verb, packagePath];
  return {
    executable,
    args,
    display: `${executable} ${verb} ${shellQuote(packagePath)}`,
  };
}

export async function checkProjectVersion(
  projectPathInput: string,
  packagePath: string,
): Promise<ProjectVersionCheck> {
  const projectPath = path.resolve(projectPathInput);
  const installedManifest = path.join(
    projectPath,
    "node_modules",
    "lark-card-builder",
    "package.json",
  );

  let installedVersion: string | null = null;
  try {
    const installed = JSON.parse(await readFile(installedManifest, "utf8")) as {
      version?: unknown;
    };
    if (typeof installed.version === "string") installedVersion = installed.version;
  } catch {
    installedVersion = null;
  }

  let status: ProjectVersionStatus;
  if (installedVersion === null) {
    status = "missing";
  } else if (installedVersion === BUILDER_VERSION) {
    status = "current";
  } else {
    const comparison = compareVersions(installedVersion, BUILDER_VERSION);
    status = comparison === null
      ? "unknown"
      : comparison < 0
        ? "update_available"
        : "newer";
  }

  return {
    status,
    projectPath,
    bundledVersion: BUILDER_VERSION,
    installedVersion,
    packagePath,
    install:
      status === "missing" || status === "update_available"
        ? await installCommand(projectPath, packagePath)
        : null,
  };
}
