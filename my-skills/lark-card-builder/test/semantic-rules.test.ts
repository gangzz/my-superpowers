import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { compileCardSpec, SEMANTIC_RULES } from "../src/index.js";

function cardWith(component: unknown): unknown {
  return {
    specVersion: 1,
    kind: "card",
    blocks: [{ kind: "block", components: [component] }],
  };
}

function issueCodes(result: ReturnType<typeof compileCardSpec>): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((entry) => entry.code);
}

describe("cross-field semantic rules", () => {
  it("turns the real Feishu 230099 failure into a local deterministic issue", async () => {
    const fixtureUrl = new URL(
      "./fixtures/regressions/feishu-230099-required-disabled.json",
      import.meta.url,
    );
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
      spec: unknown;
      expectedIssue: { code: string; path: string };
    };
    const result = compileCardSpec(fixture.spec);
    expect(result).toMatchObject({ ok: false, issues: [fixture.expectedIssue] });
  });

  it("rejects required and disabled only for the evidenced input rule", () => {
    expect(
      issueCodes(
        compileCardSpec(
          cardWith({ kind: "input", required: true, disabled: true }),
        ),
      ),
    ).toContain(
      "required_disabled_conflict",
    );
  });

  it("does not turn undocumented static-select behavior into hard errors", () => {
    const result = compileCardSpec(
      cardWith({
        kind: "staticSelect",
        options: [
          { text: "A", value: "a" },
          { text: "B", value: "b" },
        ],
        required: true,
        disabled: true,
        disabledTips: "提示",
        initialOption: "B",
        initialIndex: 2,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards[0]?.card.body).toMatchObject({
      elements: [{
        tag: "select_static",
        initial_option: "B",
        initial_index: 2,
      }],
    });
  });

  it("allows documented no-op combinations that Feishu does not declare invalid", () => {
    expect(
      compileCardSpec(
        cardWith({ kind: "input", maxRows: 4, disabledTips: "提示" }),
      ).ok,
    ).toBe(true);
  });

  it("publishes provenance for every rule implemented by rules.ts", () => {
    expect(Object.values(SEMANTIC_RULES)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required_disabled_conflict",
          appliesTo: ["input"],
          evidence: expect.objectContaining({ kind: "live-feishu-openapi" }),
        }),
      ]),
    );
    expect(
      Object.values(SEMANTIC_RULES).every(
        (rule) => rule.evidence.kind.length > 0,
      ),
    ).toBe(true);
  });
});
