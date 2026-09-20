import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { checkDocumentationSnapshot } from "../src/index.js";

describe("documentation drift checking", () => {
  it("reports unchanged, changed, and unavailable sources without rewriting", async () => {
    const stableBody = "stable";
    const manifest = {
      snapshot: "test",
      capturedAt: "2026-09-20T00:00:00Z",
      strategy: "official-markdown-sha256" as const,
      sources: [
        {
          id: "same",
          url: "https://example.com/same",
          sha256: createHash("sha256").update(stableBody).digest("hex"),
        },
        {
          id: "changed",
          url: "https://example.com/changed",
          sha256: "0".repeat(64),
        },
        {
          id: "down",
          url: "https://example.com/down",
          sha256: "0".repeat(64),
        },
      ],
    };
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/down")) return new Response("down", { status: 503 });
      return new Response(url.endsWith("/same") ? stableBody : "new");
    };

    const result = await checkDocumentationSnapshot({ manifest, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.items.map((item) => item.status)).toEqual([
      "unchanged",
      "changed",
      "unavailable",
    ]);
  });
});
