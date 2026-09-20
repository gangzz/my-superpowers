import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { compileCardSpec } from "../src/index.js";

async function fixture(name: string): Promise<unknown> {
  const path = new URL(`./fixtures/${name}.spec.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("representative consumer fixtures", () => {
  it("compiles the AI morning brief into legal v2 fields", async () => {
    const result = compileCardSpec(await fixture("ai-morning-brief"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.card).toMatchObject({
      schema: "2.0",
      config: { update_multi: true, width_mode: "fill" },
      header: { template: "blue" },
    });
    const serialized = JSON.stringify(result.cards[0]?.card);
    expect(serialized).toContain("<font color='grey'>入围理由：来自一手来源。</font>");
    expect(serialized).not.toContain("text_color");
    expect(serialized).not.toContain("wide_screen_mode");
  });

  it("compiles a FeiForge form with official form_action_type", async () => {
    const result = compileCardSpec(await fixture("feiforge-form"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.cards[0]?.card);
    expect(serialized).toContain('"form_action_type":"submit"');
    expect(serialized).not.toContain('"action_type"');
    expect(serialized).not.toContain('"wide_screen_mode"');
  });

  it("keeps FeiForge tables at the root", async () => {
    const result = compileCardSpec(await fixture("feiforge-table"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.cards[0]?.card.body as { elements?: unknown[] };
    expect(body.elements).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: "table" })]),
    );
  });

  it("emits a stable streaming index for FeiForge progress", async () => {
    const result = compileCardSpec(await fixture("feiforge-progress"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elementIndex.answer).toMatchObject({
      part: 1,
      kind: "markdown",
      streamable: true,
    });
    expect(result.cards[0]?.card.config).toMatchObject({ streaming_mode: true });
  });
});
