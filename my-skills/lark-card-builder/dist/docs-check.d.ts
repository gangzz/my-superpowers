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
export declare function loadDocumentationSnapshot(manifestUrl?: URL): Promise<DocumentationSnapshotManifest>;
export declare function checkDocumentationSnapshot(options?: {
    fetchImpl?: typeof fetch;
    manifest?: DocumentationSnapshotManifest;
}): Promise<DocumentationCheckResult>;
//# sourceMappingURL=docs-check.d.ts.map