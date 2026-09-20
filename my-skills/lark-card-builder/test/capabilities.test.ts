import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  BUILDER_CAPABILITIES,
  BUILDER_VERSION,
  OFFICIAL_COMPONENT_TAGS,
  OFFICIAL_COMPONENT_LIMIT,
  OFFICIAL_LIMITS,
  SPEC_KIND_TO_OFFICIAL_TAG,
  SUPPORTED_OFFICIAL_TAGS,
  SUPPORTED_SPEC_KINDS,
  UNSUPPORTED_OFFICIAL_TAGS,
  loadDocumentationSnapshot,
} from "../src/index.js";

const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;
const standaloneCliPath = new URL("../scripts/lark-card.mjs", import.meta.url).pathname;

describe("machine-readable capabilities", () => {
  it("publishes the supported subset and official component cap", () => {
    expect(BUILDER_CAPABILITIES).toMatchObject({
      capabilitiesVersion: 2,
      specVersion: 1,
      builderVersion: BUILDER_VERSION,
      limits: { componentsPerCard: OFFICIAL_COMPONENT_LIMIT },
    });
    expect(BUILDER_CAPABILITIES.supportedSpecKinds).toContain("form");
    expect(BUILDER_CAPABILITIES.unsupportedOfficialTags).toContain("chart");
    expect(BUILDER_CAPABILITIES.unsupportedOfficialTags).toContain(
      "picker_datetime",
    );
    expect(SPEC_KIND_TO_OFFICIAL_TAG).toMatchObject({
      image: "img",
      staticSelect: "select_static",
      columnSet: "column_set",
    });
  });

  it("partitions the complete tracked official tag catalog exactly once", () => {
    expect(new Set(OFFICIAL_COMPONENT_TAGS).size).toBe(
      OFFICIAL_COMPONENT_TAGS.length,
    );
    expect(new Set(SUPPORTED_SPEC_KINDS).size).toBe(
      SUPPORTED_SPEC_KINDS.length,
    );
    expect(Object.keys(SPEC_KIND_TO_OFFICIAL_TAG).sort()).toEqual(
      [...SUPPORTED_SPEC_KINDS].sort(),
    );
    expect(Object.values(SPEC_KIND_TO_OFFICIAL_TAG).sort()).toEqual(
      [...SUPPORTED_OFFICIAL_TAGS].sort(),
    );
    expect(
      [...SUPPORTED_OFFICIAL_TAGS, ...UNSUPPORTED_OFFICIAL_TAGS].sort(),
    ).toEqual([...OFFICIAL_COMPONENT_TAGS].sort());
    expect(
      SUPPORTED_OFFICIAL_TAGS.filter((tag) =>
        UNSUPPORTED_OFFICIAL_TAGS.includes(tag as never),
      ),
    ).toEqual([]);
  });

  it("links every official limit to a tracked snapshot source", async () => {
    const manifest = await loadDocumentationSnapshot();
    const sourceIds = new Set(manifest.sources.map((source) => source.id));
    expect(
      Object.values(OFFICIAL_LIMITS).every((limit) =>
        sourceIds.has(limit.source),
      ),
    ).toBe(true);
  });

  it("keeps package and standalone CLI capabilities identical", () => {
    const run = (path: string) => JSON.parse(
      execFileSync(process.execPath, [path, "capabilities"], { encoding: "utf8" }),
    ) as { result: unknown };
    expect(run(cliPath).result).toEqual(run(standaloneCliPath).result);
  });
});
