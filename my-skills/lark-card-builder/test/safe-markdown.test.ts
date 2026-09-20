import { describe, expect, it } from "vitest";

import { compileCardSpec } from "../src/index.js";

function compileMarkdown(component: Record<string, unknown>) {
  return compileCardSpec({
    specVersion: 1,
    kind: "card",
    blocks: [{ kind: "block", components: [{ kind: "markdown", ...component }] }],
  });
}

describe("safe Markdown fragments", () => {
  it("escapes untrusted text while preserving explicit raw Markdown", () => {
    const result = compileMarkdown({
      fragments: [
        { kind: "boldText", text: "标题[]" },
        { kind: "lineBreak" },
        { kind: "text", text: "_*[伪链接](https://bad.example)" },
        { kind: "rawMarkdown", markdown: "\n**trusted**" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.cards[0]?.card)).toContain(
      "**标题\\\\[\\\\]**\\n\\\\_\\\\*\\\\[伪链接\\\\]\\\\(https\\\\://bad\\\\.example\\\\)\\n**trusted**",
    );
  });

  it("rejects content and fragments together", () => {
    const result = compileMarkdown({
      content: "raw",
      fragments: [{ kind: "text", text: "safe" }],
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "conflicting_markdown_source" }],
    });
  });

  it("rejects unsafe fragment links", () => {
    const result = compileMarkdown({
      fragments: [{ kind: "link", label: "x", url: "javascript:alert(1)" }],
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_url" }],
    });
  });
});
