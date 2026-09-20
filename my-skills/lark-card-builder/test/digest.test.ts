import { describe, expect, it } from "vitest";

import { compileCardSpec } from "../src/index.js";

describe("deterministic result metadata", () => {
  it("keeps spec digests stable across object property order", () => {
    const first = compileCardSpec({
      specVersion: 1,
      kind: "card",
      blocks: [{ kind: "block", components: [{ kind: "markdown", content: "x" }] }],
    });
    const second = compileCardSpec({
      blocks: [{ components: [{ content: "x", kind: "markdown" }], kind: "block" }],
      kind: "card",
      specVersion: 1,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.specDigest).toBe(second.specDigest);
    expect(first.bundleDigest).toBe(second.bundleDigest);
    expect(first.cards[0]?.cardDigest).toBe(second.cards[0]?.cardDigest);
    expect(first.rulesSnapshot).toBe(first.snapshot);
  });

  it("distinguishes physical bundles compiled with different target budgets", () => {
    const spec = {
      specVersion: 1,
      kind: "card",
      blocks: [
        { kind: "block", components: [{ kind: "markdown", content: "a" }] },
        { kind: "block", components: [{ kind: "markdown", content: "b" }] },
      ],
    };
    const first = compileCardSpec(spec, { targetBudget: 4 });
    const second = compileCardSpec(spec, { targetBudget: 5 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.specDigest).toBe(second.specDigest);
    expect(first.bundleDigest).not.toBe(second.bundleDigest);
  });

  it("changes content digests when card content changes", () => {
    const compile = (content: string) => compileCardSpec({
      specVersion: 1,
      kind: "card",
      blocks: [{ kind: "block", components: [{ kind: "markdown", content }] }],
    });
    const first = compile("a");
    const second = compile("b");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.specDigest).not.toBe(second.specDigest);
    expect(first.cards[0]?.cardDigest).not.toBe(second.cards[0]?.cardDigest);
  });
});
