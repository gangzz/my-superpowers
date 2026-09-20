#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { BUILDER_CAPABILITIES } from "./capabilities.js";
import { compileCardSpec } from "./compiler.js";
import { checkDocumentationSnapshot } from "./docs-check.js";
import { checkProjectVersion } from "./project-check.js";
import { cardSpecJsonSchema } from "./schema.js";
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8");
}
function write(value, pretty) {
    process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}
async function readJsonInput(path) {
    const content = path === undefined || path === "-" ? await readStdin() : await readFile(path, "utf8");
    return JSON.parse(content);
}
async function main() {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            input: { type: "string", short: "i" },
            project: { type: "string" },
            "target-budget": { type: "string" },
            "max-card-bytes": { type: "string" },
            "max-callback-bytes": { type: "string" },
            pretty: { type: "boolean", default: false },
        },
        allowPositionals: true,
        strict: true,
    });
    const pretty = values.pretty ?? false;
    const command = positionals.join(" ");
    if (command === "schema") {
        write({ ok: true, command, result: cardSpecJsonSchema() }, pretty);
        return;
    }
    if (command === "capabilities") {
        write({ ok: true, command, result: BUILDER_CAPABILITIES }, pretty);
        return;
    }
    if (command === "docs check") {
        const result = await checkDocumentationSnapshot();
        write({ ok: result.ok, command, result }, pretty);
        if (!result.ok)
            process.exitCode = 1;
        return;
    }
    if (command === "check-project") {
        const projectPath = values.project ?? process.cwd();
        const packagePath = fileURLToPath(new URL("../packages/lark-card-builder.tgz", import.meta.url));
        await access(packagePath);
        const result = await checkProjectVersion(projectPath, packagePath);
        write({ ok: true, command, result }, pretty);
        return;
    }
    if (command !== "compile" && command !== "validate") {
        write({
            ok: false,
            command: command || "unknown",
            error: {
                code: "usage",
                message: "用法：lark-card <validate|compile|schema|capabilities|docs check|check-project> [--input file|-] [--project dir] [--target-budget n] [--max-card-bytes n] [--max-callback-bytes n] [--pretty]",
            },
        }, pretty);
        process.exitCode = 2;
        return;
    }
    const input = await readJsonInput(values.input);
    const targetBudget = values["target-budget"] === undefined
        ? undefined
        : Number(values["target-budget"]);
    const maxCardBytes = values["max-card-bytes"] === undefined
        ? undefined
        : Number(values["max-card-bytes"]);
    const maxCallbackBytes = values["max-callback-bytes"] === undefined
        ? undefined
        : Number(values["max-callback-bytes"]);
    const compileOptions = {};
    if (targetBudget !== undefined)
        compileOptions.targetBudget = targetBudget;
    if (maxCardBytes !== undefined || maxCallbackBytes !== undefined) {
        compileOptions.consumerLimits = {};
        if (maxCardBytes !== undefined) {
            compileOptions.consumerLimits.maxCardBytes = maxCardBytes;
        }
        if (maxCallbackBytes !== undefined) {
            compileOptions.consumerLimits.maxCallbackBytes = maxCallbackBytes;
        }
    }
    const compiled = compileCardSpec(input, compileOptions);
    if (!compiled.ok) {
        write({ ok: false, command, result: compiled }, pretty);
        process.exitCode = 1;
        return;
    }
    if (command === "validate") {
        write({
            ok: true,
            command,
            result: {
                builderVersion: compiled.builderVersion,
                rulesSnapshot: compiled.rulesSnapshot,
                specDigest: compiled.specDigest,
                bundleDigest: compiled.bundleDigest,
                snapshot: compiled.snapshot,
                cardCount: compiled.cards.length,
                componentCounts: compiled.cards.map((card) => card.componentCount),
                serializedBytes: compiled.cards.map((card) => card.serializedBytes),
                cardDigests: compiled.cards.map((card) => card.cardDigest),
                elementIndex: compiled.elementIndex,
            },
        }, pretty);
        return;
    }
    write({ ok: true, command, result: compiled }, pretty);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    write({
        ok: false,
        command: process.argv.slice(2).join(" ") || "unknown",
        error: { code: "cli_error", message },
    }, process.argv.includes("--pretty"));
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map