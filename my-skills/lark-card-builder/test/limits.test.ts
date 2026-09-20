import { describe, expect, it } from "vitest";

import {
  BUILDER_CAPABILITIES,
  OFFICIAL_COMPONENT_LIMIT,
  OFFICIAL_LIMITS,
  block,
  card,
  compileCardSpec,
  header,
  hr,
  markdown,
} from "../src/index.js";

describe("official and consumer limits", () => {
  it("accepts 200 tagged nodes and rejects 201", () => {
    let exactBlock = block();
    for (let index = 0; index < OFFICIAL_COMPONENT_LIMIT - 1; index += 1) {
      exactBlock = exactBlock.add(hr());
    }
    expect(
      card()
        .header(header("Limit"))
        .add(exactBlock)
        .compile({ targetBudget: OFFICIAL_COMPONENT_LIMIT }).ok,
    ).toBe(true);

    const overLimit = card()
      .header(header("Limit"))
      .add(exactBlock.add(hr()))
      .compile({ targetBudget: OFFICIAL_COMPONENT_LIMIT });
    expect(overLimit).toMatchObject({
      ok: false,
      issues: [{ code: "atomic_block_exceeds_limit" }],
    });
  });

  it("does not let a legacy hardLimit override exceed the official 200 cap", () => {
    let logical = card().header(header("Locked"));
    for (let index = 0; index < OFFICIAL_COMPONENT_LIMIT; index += 1) {
      logical = logical.add(hr());
    }
    const result = logical.compile({ targetBudget: 300, hardLimit: 300 } as never);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_target_budget" }],
    });
  });

  it("measures UTF-8 bytes and applies a stricter consumer card limit", () => {
    const spec = card().add(markdown("中文🙂")).toSpec();
    const baseline = compileCardSpec(spec);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    expect(baseline.cards[0]?.serializedBytes).toBe(
      Buffer.byteLength(JSON.stringify(baseline.cards[0]?.card), "utf8"),
    );

    const limited = compileCardSpec(spec, {
      consumerLimits: { maxCardBytes: 1 },
    });
    expect(limited).toMatchObject({
      ok: false,
      issues: [{ code: "card_payload_too_large", path: "$.cards[0]" }],
    });
  });

  it("returns stable field and callback size issues", () => {
    const field = compileCardSpec({
      specVersion: 1,
      kind: "card",
      blocks: [{
        kind: "block",
        components: [{
          kind: "button",
          text: "x".repeat(OFFICIAL_LIMITS.buttonTextChars.value + 1),
          behaviors: [{ kind: "callback", value: {} }],
        }],
      }],
    });
    expect(field).toMatchObject({
      ok: false,
      issues: [{ code: "field_too_long", path: "$.blocks[0].components[0].text" }],
    });

    const callback = compileCardSpec(
      {
        specVersion: 1,
        kind: "card",
        blocks: [{
          kind: "block",
          components: [{
            kind: "button",
            text: "x",
            behaviors: [{ kind: "callback", value: { message: "中文🙂" } }],
          }],
        }],
      },
      { consumerLimits: { maxCallbackBytes: 1 } },
    );
    expect(callback).toMatchObject({
      ok: false,
      issues: [{
        code: "callback_value_too_large",
        path: "$.blocks[0].components[0].behaviors[0].value",
      }],
    });
  });

  it("exposes the same limit values used by schema and compiler guards", () => {
    expect(BUILDER_CAPABILITIES.limits).toEqual(
      Object.fromEntries(
        Object.entries(OFFICIAL_LIMITS).map(([key, rule]) => [key, rule.value]),
      ),
    );

    const placeholder = compileCardSpec({
      specVersion: 1,
      kind: "card",
      blocks: [{
        kind: "block",
        components: [{
          kind: "input",
          placeholder: "x".repeat(
            OFFICIAL_LIMITS.inputPlaceholderChars.value + 1,
          ),
        }],
      }],
    });
    expect(placeholder).toMatchObject({
      ok: false,
      issues: [{ code: "field_too_long" }],
    });
  });
});
