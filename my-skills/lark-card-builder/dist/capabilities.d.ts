import { OFFICIAL_LIMITS } from "./official-limits.js";
export declare const OFFICIAL_COMPONENT_CATALOG: readonly [{
    readonly tag: "markdown";
    readonly status: "supported";
    readonly specKind: "markdown";
}, {
    readonly tag: "div";
    readonly status: "supported";
    readonly specKind: "div";
}, {
    readonly tag: "hr";
    readonly status: "supported";
    readonly specKind: "hr";
}, {
    readonly tag: "img";
    readonly status: "supported";
    readonly specKind: "image";
}, {
    readonly tag: "button";
    readonly status: "supported";
    readonly specKind: "button";
}, {
    readonly tag: "input";
    readonly status: "supported";
    readonly specKind: "input";
}, {
    readonly tag: "select_static";
    readonly status: "supported";
    readonly specKind: "staticSelect";
}, {
    readonly tag: "form";
    readonly status: "supported";
    readonly specKind: "form";
}, {
    readonly tag: "table";
    readonly status: "supported";
    readonly specKind: "table";
}, {
    readonly tag: "column";
    readonly status: "supported";
    readonly specKind: "column";
}, {
    readonly tag: "column_set";
    readonly status: "supported";
    readonly specKind: "columnSet";
}, {
    readonly tag: "collapsible_panel";
    readonly status: "supported";
    readonly specKind: "collapsiblePanel";
}, {
    readonly tag: "interactive_container";
    readonly status: "supported";
    readonly specKind: "interactiveContainer";
}, {
    readonly tag: "img_combination";
    readonly status: "unsupported";
}, {
    readonly tag: "person";
    readonly status: "unsupported";
}, {
    readonly tag: "person_list";
    readonly status: "unsupported";
}, {
    readonly tag: "chart";
    readonly status: "unsupported";
}, {
    readonly tag: "overflow";
    readonly status: "unsupported";
}, {
    readonly tag: "multi_select_static";
    readonly status: "unsupported";
}, {
    readonly tag: "select_person";
    readonly status: "unsupported";
}, {
    readonly tag: "multi_select_person";
    readonly status: "unsupported";
}, {
    readonly tag: "date_picker";
    readonly status: "unsupported";
}, {
    readonly tag: "picker_time";
    readonly status: "unsupported";
}, {
    readonly tag: "picker_datetime";
    readonly status: "unsupported";
}, {
    readonly tag: "select_img";
    readonly status: "unsupported";
}, {
    readonly tag: "checker";
    readonly status: "unsupported";
}];
type SupportedCatalogEntry = Extract<(typeof OFFICIAL_COMPONENT_CATALOG)[number], {
    status: "supported";
}>;
export type SupportedSpecKind = SupportedCatalogEntry["specKind"];
export type SupportedOfficialTag = SupportedCatalogEntry["tag"];
export type OfficialComponentTag = (typeof OFFICIAL_COMPONENT_CATALOG)[number]["tag"];
export declare const SUPPORTED_COMPONENT_KINDS: SupportedSpecKind[];
export declare const SUPPORTED_SPEC_KINDS: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "image" | "staticSelect" | "column" | "columnSet" | "collapsiblePanel" | "interactiveContainer")[];
export declare const SUPPORTED_OFFICIAL_TAGS: SupportedOfficialTag[];
export declare const UNSUPPORTED_OFFICIAL_TAGS: ("img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
export declare const OFFICIAL_COMPONENT_TAGS: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "column" | "img" | "select_static" | "column_set" | "collapsible_panel" | "interactive_container" | "img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
export declare const SPEC_KIND_TO_OFFICIAL_TAG: Record<SupportedSpecKind, SupportedOfficialTag>;
/** @deprecated Use UNSUPPORTED_OFFICIAL_TAGS. */
export declare const UNSUPPORTED_COMPONENT_KINDS: ("img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
export declare const BUILDER_CAPABILITIES: {
    readonly capabilitiesVersion: 2;
    readonly specVersion: 1;
    readonly builderVersion: "0.2.1";
    readonly rulesSnapshot: "feishu-card-json-v2-2026-09-20-r2";
    readonly supportedSpecKinds: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "image" | "staticSelect" | "column" | "columnSet" | "collapsiblePanel" | "interactiveContainer")[];
    readonly supportedOfficialTags: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "column" | "img" | "select_static" | "column_set" | "collapsible_panel" | "interactive_container")[];
    readonly unsupportedOfficialTags: ("img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
    readonly specKindToOfficialTag: Record<"form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "image" | "staticSelect" | "column" | "columnSet" | "collapsiblePanel" | "interactiveContainer", "form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "column" | "img" | "select_static" | "column_set" | "collapsible_panel" | "interactive_container">;
    readonly officialComponentTags: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "column" | "img" | "select_static" | "column_set" | "collapsible_panel" | "interactive_container" | "img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
    /** @deprecated Use supportedSpecKinds. */
    readonly supportedComponents: ("form" | "table" | "button" | "input" | "markdown" | "div" | "hr" | "image" | "staticSelect" | "column" | "columnSet" | "collapsiblePanel" | "interactiveContainer")[];
    /** @deprecated Use unsupportedOfficialTags. */
    readonly unsupportedComponents: ("img_combination" | "person" | "person_list" | "chart" | "overflow" | "multi_select_static" | "select_person" | "multi_select_person" | "date_picker" | "picker_time" | "picker_datetime" | "select_img" | "checker")[];
    readonly limits: { [K in keyof typeof OFFICIAL_LIMITS]: (typeof OFFICIAL_LIMITS)[K]["value"]; };
};
export {};
//# sourceMappingURL=capabilities.d.ts.map