import type { CardIssue, CompileOptions, CompiledCards } from "./types.js";
export declare class CardBuildError extends Error {
    readonly issues: CardIssue[];
    constructor(issues: CardIssue[]);
}
export declare function countTaggedNodes(value: unknown): number;
export declare function compileCardSpec(input: unknown, options?: CompileOptions): CompiledCards;
export declare function buildOrThrowCardSpec(input: unknown, options?: CompileOptions): Extract<CompiledCards, {
    ok: true;
}>;
//# sourceMappingURL=compiler.d.ts.map