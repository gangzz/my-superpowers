import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { BUILDER_VERSION } from "./version.js";
function parseVersion(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
    if (!match)
        return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
function compareVersions(left, right) {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (!parsedLeft || !parsedRight)
        return null;
    for (let index = 0; index < 3; index += 1) {
        const difference = parsedLeft[index] - parsedRight[index];
        if (difference !== 0)
            return Math.sign(difference);
    }
    return 0;
}
async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function detectPackageManager(projectPath) {
    const candidates = [
        ["pnpm-lock.yaml", "pnpm"],
        ["yarn.lock", "yarn"],
        ["bun.lock", "bun"],
        ["bun.lockb", "bun"],
        ["package-lock.json", "npm"],
        ["npm-shrinkwrap.json", "npm"],
    ];
    for (const [file, manager] of candidates) {
        if (await exists(path.join(projectPath, file)))
            return manager;
    }
    try {
        const manifest = JSON.parse(await readFile(path.join(projectPath, "package.json"), "utf8"));
        if (typeof manifest.packageManager === "string") {
            const manager = manifest.packageManager.split("@", 1)[0];
            if (manager === "pnpm" || manager === "npm" || manager === "yarn" || manager === "bun") {
                return manager;
            }
        }
    }
    catch {
        // A missing or unreadable project manifest does not prevent a local check.
    }
    return "npm";
}
function shellQuote(value) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
async function installCommand(projectPath, packagePath) {
    const executable = await detectPackageManager(projectPath);
    const verb = executable === "npm" ? "install" : "add";
    const args = [verb, packagePath];
    return {
        executable,
        args,
        display: `${executable} ${verb} ${shellQuote(packagePath)}`,
    };
}
export async function checkProjectVersion(projectPathInput, packagePath) {
    const projectPath = path.resolve(projectPathInput);
    const installedManifest = path.join(projectPath, "node_modules", "lark-card-builder", "package.json");
    let installedVersion = null;
    try {
        const installed = JSON.parse(await readFile(installedManifest, "utf8"));
        if (typeof installed.version === "string")
            installedVersion = installed.version;
    }
    catch {
        installedVersion = null;
    }
    let status;
    if (installedVersion === null) {
        status = "missing";
    }
    else if (installedVersion === BUILDER_VERSION) {
        status = "current";
    }
    else {
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
        install: status === "missing" || status === "update_available"
            ? await installCommand(projectPath, packagePath)
            : null,
    };
}
//# sourceMappingURL=project-check.js.map