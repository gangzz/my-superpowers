import { describe, expect, it } from "vitest";

import {
  BUILDER_VERSION,
  CardBuildError,
  block,
  button,
  card,
  compileCardSpec,
  header,
  hr,
  markdown,
} from "../src/index.js";

function success<T extends { ok: boolean }>(value: T): asserts value is T & { ok: true } {
  expect(value.ok).toBe(true);
}

describe("component counting and automatic packing", () => {
  it("publishes the compiler version in successful results", () => {
    const result = card().add(markdown("versioned")).compile();
    success(result);
    expect(BUILDER_VERSION).toBe("0.2.1");
    expect(result.builderVersion).toBe(BUILDER_VERSION);
  });

  it("counts nested tagged text nodes", () => {
    const result = card()
      .header(header("Card"))
      .add(button("Open").openUrl("https://example.com"))
      .compile();

    success(result);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.componentCount).toBe(3);
  });

  it("keeps 160 components in one physical card and automatically splits the next", () => {
    let atTarget = card().header(header("Budget"));
    for (let index = 0; index < 159; index += 1) atTarget = atTarget.add(hr());
    const one = atTarget.compile();
    success(one);
    expect(one.cards).toHaveLength(1);
    expect(one.cards[0]?.componentCount).toBe(160);

    const two = atTarget.add(hr()).compile();
    success(two);
    expect(two.cards.map((part) => part.componentCount)).toEqual([160, 2]);
    expect(two.cards[0]?.card.header).toMatchObject({
      title: { content: "Budget（1/2）" },
    });
    expect(two.cards[1]?.card.header).toMatchObject({
      title: { content: "Budget（2/2）" },
    });
  });

  it("never splits an atomic block", () => {
    let large = block();
    for (let index = 0; index < 170; index += 1) large = large.add(hr());

    const result = card()
      .header(header("Atomic"))
      .add(hr())
      .add(large)
      .add(hr())
      .compile();

    success(result);
    expect(result.cards.map((part) => part.componentCount)).toEqual([2, 171, 2]);
  });

  it("rejects an atomic block that cannot fit under 200", () => {
    let oversized = block();
    for (let index = 0; index < 200; index += 1) oversized = oversized.add(hr());
    const result = card().header(header("Too large")).add(oversized).compile();

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "atomic_block_exceeds_limit", path: "$.blocks[0]" }],
    });
  });

  it("adds a minimal part header when an unheaded logical card splits", () => {
    let logical = card();
    for (let index = 0; index < 161; index += 1) logical = logical.add(hr());
    const result = logical.compile();

    success(result);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]?.card.header).toEqual({
      title: { tag: "plain_text", content: "（1/2）" },
    });
  });
});

describe("stable element identity", () => {
  it("indexes every keyed element and marks only stream targets as streamable", () => {
    const result = card()
      .cardKey("feiforge.addressable")
      .add(markdown("fixed").key("fixed"))
      .add(markdown("stream").key("stream").streamTarget())
      .compile();

    success(result);
    expect(result.elementIndex.fixed).toMatchObject({ streamable: false });
    expect(result.elementIndex.stream).toMatchObject({ streamable: true });
  });

  it("keeps the same element id after unrelated insertions", () => {
    const first = card()
      .cardKey("feiforge.answer")
      .add(markdown("initial").key("answer").streamTarget())
      .compile();
    const second = card()
      .cardKey("feiforge.answer")
      .add(hr())
      .add(markdown("changed").key("answer").streamTarget())
      .compile();

    success(first);
    success(second);
    expect(first.elementIndex.answer?.elementId).toMatch(/^e[a-f0-9]{19}$/);
    expect(second.elementIndex.answer?.elementId).toBe(
      first.elementIndex.answer?.elementId,
    );
    expect(second.cards[0]?.card.config).toMatchObject({ streaming_mode: true });
  });

  it("maps semantic streaming configuration to official snake_case fields", () => {
    const result = card()
      .streaming({
        printFrequencyMs: { default: 30, pc: 50 },
        printStep: { default: 2 },
        printStrategy: "fast",
      })
      .add(markdown("answer"))
      .compile();

    success(result);
    expect(result.cards[0]?.card.config).toMatchObject({
      streaming_mode: true,
      streaming_config: {
        print_frequency_ms: { default: 30, pc: 50 },
        print_step: { default: 2 },
        print_strategy: "fast",
      },
    });
  });

  it("requires cardKey, a stream key, and unique keys", () => {
    const result = card()
      .add(markdown("a").streamTarget())
      .add(markdown("b").key("same"))
      .add(markdown("c").key("same"))
      .compile();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((entry) => entry.code)).toEqual(
        expect.arrayContaining([
          "stream_target_missing_key",
          "duplicate_key",
          "card_key_required",
        ]),
      );
    }
  });
});

describe("strict semantic validation", () => {
  it("rejects legacy and unknown Card JSON fields instead of passing them through", () => {
    const result = compileCardSpec({
      specVersion: 1,
      kind: "card",
      config: { wideScreenMode: true },
      blocks: [
        {
          kind: "block",
          components: [{ kind: "markdown", content: "x", textColor: "grey" }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((entry) => entry.path)).toEqual(
        expect.arrayContaining(["$.config", "$.blocks[0].components[0]"]),
      );
    }
  });

  it("reports form and nesting violations together", () => {
    const result = compileCardSpec({
      specVersion: 1,
      kind: "card",
      blocks: [
        {
          kind: "block",
          components: [
            {
              kind: "form",
              name: "form1",
              components: [
                { kind: "input" },
                {
                  kind: "button",
                  text: "Wrong",
                  behaviors: [{ kind: "callback", value: { action: "x" } }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((entry) => entry.code)).toEqual(
        expect.arrayContaining([
          "form_name_required",
          "form_action_required",
          "form_button_behaviors_forbidden",
          "form_submit_required",
        ]),
      );
    }
  });

  it("throws the same structured issues through buildOrThrow", () => {
    expect(() => card().add(markdown("x").key("x")).buildOrThrow()).toThrow(
      CardBuildError,
    );
  });

  it("keeps builders immutable", () => {
    const base = markdown().text("first");
    const next = base.lineBreak().text("second");
    expect(base.toSpec().content).toBe("first");
    expect(next.toSpec().content).toBe("first\nsecond");
  });
});
