import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface DocumentationSource {
  id: string;
  url: string;
  sha256: string;
}

export interface DocumentationSnapshotManifest {
  snapshot: string;
  capturedAt: string;
  strategy: "official-markdown-sha256";
  sources: DocumentationSource[];
}

export interface DocumentationCheckItem {
  id: string;
  url: string;
  expectedSha256: string;
  actualSha256?: string;
  status: "unchanged" | "changed" | "unavailable";
  message?: string;
}

export interface DocumentationCheckResult {
  ok: boolean;
  snapshot: string;
  checkedAt: string;
  items: DocumentationCheckItem[];
}

declare const __LARK_CARD_DOCUMENTATION_SNAPSHOT__:
  | DocumentationSnapshotManifest
  | undefined;

const embeddedDocumentationSnapshot =
  typeof __LARK_CARD_DOCUMENTATION_SNAPSHOT__ === "undefined"
    ? undefined
    : __LARK_CARD_DOCUMENTATION_SNAPSHOT__;

export async function loadDocumentationSnapshot(
  manifestUrl?: URL,
): Promise<DocumentationSnapshotManifest> {
  if (manifestUrl === undefined && embeddedDocumentationSnapshot !== undefined) {
    return structuredClone(embeddedDocumentationSnapshot);
  }
  const resolvedUrl = manifestUrl ?? new URL("../docs/snapshot.json", import.meta.url);
  const text = await readFile(fileURLToPath(resolvedUrl), "utf8");
  return JSON.parse(text) as DocumentationSnapshotManifest;
}

export async function checkDocumentationSnapshot(options: {
  fetchImpl?: typeof fetch;
  manifest?: DocumentationSnapshotManifest;
} = {}): Promise<DocumentationCheckResult> {
  const manifest = options.manifest ?? (await loadDocumentationSnapshot());
  const fetchImpl = options.fetchImpl ?? fetch;
  const items: DocumentationCheckItem[] = [];

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
    } catch (error) {
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
