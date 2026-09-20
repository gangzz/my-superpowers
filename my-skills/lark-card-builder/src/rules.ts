import type {
  CardIssue,
  ComponentSpec,
  MarkdownFragmentSpec,
} from "./types.js";

export const SEMANTIC_RULES = {
  invalid_url: {
    code: "invalid_url",
    appliesTo: ["markdown.link"],
    evidence: {
      kind: "builder-policy",
      source: "CardSpec 只允许显式 http(s) 外链",
    },
  },
  conflicting_markdown_source: {
    code: "conflicting_markdown_source",
    appliesTo: ["markdown"],
    evidence: {
      kind: "cardspec-contract",
      source: "content 与 fragments 是互斥作者入口",
    },
  },
  markdown_source_required: {
    code: "markdown_source_required",
    appliesTo: ["markdown"],
    evidence: {
      kind: "cardspec-contract",
      source: "markdown 必须有且只有一个作者入口",
    },
  },
  required_disabled_conflict: {
    code: "required_disabled_conflict",
    appliesTo: ["input"],
    evidence: {
      kind: "live-feishu-openapi",
      fixture: "test/fixtures/regressions/feishu-230099-required-disabled.json",
      outerCode: 230099,
      innerCode: 10002,
    },
  },
} as const;

type SemanticRule = (typeof SEMANTIC_RULES)[keyof typeof SEMANTIC_RULES];

function addRule(
  issues: CardIssue[],
  rule: SemanticRule,
  path: string,
  message: string,
): void {
  issues.push({ code: rule.code, path, message });
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateMarkdownFragments(
  fragments: MarkdownFragmentSpec[] | undefined,
  path: string,
  issues: CardIssue[],
): void {
  fragments?.forEach((fragment, index) => {
    if (fragment.kind === "link" && !isValidUrl(fragment.url)) {
      addRule(
        issues,
        SEMANTIC_RULES.invalid_url,
        `${path}.fragments[${index}].url`,
        "Markdown 链接只接受 http(s) URL",
      );
    }
  });
}

export function validateComponentSemantics(
  component: ComponentSpec,
  path: string,
): CardIssue[] {
  const issues: CardIssue[] = [];

  if (component.kind === "markdown") {
    const hasContent = component.content !== undefined;
    const hasFragments = component.fragments !== undefined;
    if (hasContent === hasFragments) {
      addRule(
        issues,
        hasContent
          ? SEMANTIC_RULES.conflicting_markdown_source
          : SEMANTIC_RULES.markdown_source_required,
        path,
        hasContent
          ? "markdown 的 content 与 fragments 不能同时存在"
          : "markdown 必须提供 content 或 fragments",
      );
    }
    validateMarkdownFragments(component.fragments, path, issues);
  }

  if (
    component.kind === "input" &&
    component.required === true &&
    component.disabled === true
  ) {
    addRule(
      issues,
      SEMANTIC_RULES.required_disabled_conflict,
      `${path}.disabled`,
      "required 与 disabled 不能同时为 true",
    );
  }

  return issues;
}
