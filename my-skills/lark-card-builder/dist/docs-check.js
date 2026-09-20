import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const embeddedDocumentationSnapshot = typeof __LARK_CARD_DOCUMENTATION_SNAPSHOT__ === "undefined"
    ? undefined
    : __LARK_CARD_DOCUMENTATION_SNAPSHOT__;
export async function loadDocumentationSnapshot(manifestUrl) {
    if (manifestUrl === undefined && embeddedDocumentationSnapshot !== undefined) {
        return structuredClone(embeddedDocumentationSnapshot);
    }
    const resolvedUrl = manifestUrl ?? new URL("../docs/snapshot.json", import.meta.url);
    const text = await readFile(fileURLToPath(resolvedUrl), "utf8");
    return JSON.parse(text);
}
export async function checkDocumentationSnapshot(options = {}) {
    const manifest = options.manifest ?? (await loadDocumentationSnapshot());
    const fetchImpl = options.fetchImpl ?? fetch;
    const items = [];
    for (const source of manifest.sources) {
        try {
            const response = await fetchImpl(source.url, {
                headers: { "user-agent": "lark-card-builder-docs-check/0.1" },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                items.push({
                    id: source.id,
                    url: source.url,
                    expectedSha256: source.sha256,
                    status: "unavailable",
                    message: `HTTP ${response.status}`,
                });
                continue;
            }
            const body = await response.text();
            const actualSha256 = createHash("sha256").update(body).digest("hex");
            items.push({
                id: source.id,
                url: source.url,
                expectedSha256: source.sha256,
                actualSha256,
                status: actualSha256 === source.sha256 ? "unchanged" : "changed",
            });
        }
        catch (error) {
            items.push({
                id: source.id,
                url: source.url,
                expectedSha256: source.sha256,
                status: "unavailable",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return {
        ok: items.every((item) => item.status === "unchanged"),
        snapshot: manifest.snapshot,
        checkedAt: new Date().toISOString(),
        items,
    };
}
//# sourceMappingURL=docs-check.js.map