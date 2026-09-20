import type { CardIssue, ComponentSpec } from "./types.js";
export declare const SEMANTIC_RULES: {
    readonly invalid_url: {
        readonly code: "invalid_url";
        readonly appliesTo: readonly ["markdown.link"];
        readonly evidence: {
            readonly kind: "builder-policy";
            readonly source: "CardSpec 只允许显式 http(s) 外链";
        };
    };
    readonly conflicting_markdown_source: {
        readonly code: "conflicting_markdown_source";
        readonly appliesTo: readonly ["markdown"];
        readonly evidence: {
            readonly kind: "cardspec-contract";
            readonly source: "content 与 fragments 是互斥作者入口";
        };
    };
    readonly markdown_source_required: {
        readonly code: "markdown_source_required";
        readonly appliesTo: readonly ["markdown"];
        readonly evidence: {
            readonly kind: "cardspec-contract";
            readonly source: "markdown 必须有且只有一个作者入口";
        };
    };
    readonly required_disabled_conflict: {
        readonly code: "required_disabled_conflict";
        readonly appliesTo: readonly ["input"];
        readonly evidence: {
            readonly kind: "live-feishu-openapi";
            readonly fixture: "test/fixtures/regressions/feishu-230099-required-disabled.json";
            readonly outerCode: 230099;
            readonly innerCode: 10002;
        };
    };
};
export declare function validateComponentSemantics(component: ComponentSpec, path: string): CardIssue[];
//# sourceMappingURL=rules.d.ts.map