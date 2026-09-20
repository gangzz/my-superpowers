import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compileCardSpec } from "../src/index.js";

const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;
const standaloneCliPath = new URL("../scripts/lark-card.mjs", import.meta.url).pathname;
const fixturePath = new URL(
  "./fixtures/ai-morning-brief.spec.json",
  import.meta.url,
).pathname;

describe("CLI", () => {
  it("compiles a CardSpec file to a structured envelope", () => {
    const stdout = execFileSync(
      process.execPath,
      [cliPath, "compile", "--input", fixturePath],
      { encoding: "utf8" },
    );
    const output = JSON.parse(stdout) as {
      ok: boolean;
      result: { builderVersion: string; cards: unknown[] };
    };
    expect(output.ok).toBe(true);
    expect(output.result.builderVersion).toBe("0.2.1");
    expect(output.result.cards).toHaveLength(1);
  });

  it("reads stdin and reports strict validation errors", () => {
    const run = spawnSync(process.execPath, [cliPath, "validate", "--input", "-"], {
      input: JSON.stringify({ specVersion: 1, kind: "card", blocks: [] }),
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    const output = JSON.parse(run.stdout) as { ok: boolean };
    expect(output.ok).toBe(false);
  });

  it("prints the strict CardSpec JSON Schema", () => {
    const stdout = execFileSync(process.execPath, [cliPath, "schema"], {
      encoding: "utf8",
    });
    const output = JSON.parse(stdout) as {
      ok: boolean;
      result: { additionalProperties?: boolean };
    };
    expect(output.ok).toBe(true);
    expect(output.result.additionalProperties).toBe(false);
  });

  it("runs the bundled Skill CLI without a global lark-card binary", () => {
    const stdout = execFileSync(process.execPath, [standaloneCliPath, "schema"], {
      encoding: "utf8",
    });
    const output = JSON.parse(stdout) as {
      ok: boolean;
      result: { additionalProperties?: boolean };
    };
    expect(output.ok).toBe(true);
    expect(output.result.additionalProperties).toBe(false);
  });

  it("keeps API, package CLI, and standalone CLI compile results identical", async () => {
    const spec = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const apiResult = compileCardSpec(spec);
    const run = (path: string) => JSON.parse(
      execFileSync(process.execPath, [path, "compile", "--input", fixturePath], {
        encoding: "utf8",
      }),
    ) as { result: unknown };
    expect(run(cliPath).result).toEqual(apiResult);
    expect(run(standaloneCliPath).result).toEqual(apiResult);
  });

  it("passes compile options identically through package and standalone CLI", async () => {
    const spec = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const options = {
      targetBudget: 10,
      consumerLimits: {
        maxCardBytes: 10_000,
        maxCallbackBytes: 1_000,
      },
    };
    const apiResult = compileCardSpec(spec, options);
    const args = [
      "compile",
      "--input",
      fixturePath,
      "--target-budget",
      String(options.targetBudget),
      "--max-card-bytes",
      String(options.consumerLimits.maxCardBytes),
      "--max-callback-bytes",
      String(options.consumerLimits.maxCallbackBytes),
    ];
    const run = (cli: string) => JSON.parse(
      execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" }),
    ) as { result: unknown };
    expect(run(cliPath).result).toEqual(apiResult);
    expect(run(standaloneCliPath).result).toEqual(apiResult);
  });

  it("enforces CLI consumer byte limits", () => {
    for (const cli of [cliPath, standaloneCliPath]) {
      const run = spawnSync(
        process.execPath,
        [cli, "compile", "--input", fixturePath, "--max-card-bytes", "1"],
        { encoding: "utf8" },
      );
      expect(run.status).toBe(1);
      expect(JSON.parse(run.stdout)).toMatchObject({
        ok: false,
        result: { issues: [{ code: "card_payload_too_large" }] },
      });
    }
  });

  it("checks an installed project package against the bundled local version", async () => {
    const projectPath = await mkdtemp(path.join(tmpdir(), "lark-card-project-"));
    try {
      await writeFile(path.join(projectPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      const packagePath = path.join(
        projectPath,
        "node_modules",
        "lark-card-builder",
      );
      await mkdir(packagePath, { recursive: true });
      await writeFile(
        path.join(packagePath, "package.json"),
        JSON.stringify({ name: "lark-card-builder", version: "0.1.1" }),
      );

      const stdout = execFileSync(
        process.execPath,
        [standaloneCliPath, "check-project", "--project", projectPath],
        { encoding: "utf8" },
      );
      const output = JSON.parse(stdout) as {
        ok: boolean;
        result: {
          status: string;
          bundledVersion: string;
          installedVersion: string;
          install: { executable: string; args: string[] };
        };
      };
      expect(output).toMatchObject({
        ok: true,
        result: {
          status: "update_available",
          bundledVersion: "0.2.1",
          installedVersion: "0.1.1",
          install: { executable: "pnpm" },
        },
      });
      expect(output.result.install.args).toEqual([
        "add",
        expect.stringMatching(/packages\/lark-card-builder\.tgz$/),
      ]);
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });

  it("does not offer to downgrade a project with a newer package", async () => {
    const projectPath = await mkdtemp(path.join(tmpdir(), "lark-card-project-"));
    try {
      const packagePath = path.join(
        projectPath,
        "node_modules",
        "lark-card-builder",
      );
      await mkdir(packagePath, { recursive: true });
      await writeFile(
        path.join(packagePath, "package.json"),
        JSON.stringify({ name: "lark-card-builder", version: "0.3.0" }),
      );

      const stdout = execFileSync(
        process.execPath,
        [standaloneCliPath, "check-project", "--project", projectPath],
        { encoding: "utf8" },
      );
      const output = JSON.parse(stdout) as {
        result: { status: string; install: unknown };
      };
      expect(output.result).toMatchObject({ status: "newer", install: null });
    } finally {
      await rm(projectPath, { recursive: true, force: true });
    }
  });
});
