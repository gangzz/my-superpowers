import { OFFICIAL_LIMITS } from "./official-limits.js";
import { SNAPSHOT_ID } from "./snapshot.js";
import { BUILDER_VERSION } from "./version.js";
export const OFFICIAL_COMPONENT_CATALOG = [
    { tag: "markdown", status: "supported", specKind: "markdown" },
    { tag: "div", status: "supported", specKind: "div" },
    { tag: "hr", status: "supported", specKind: "hr" },
    { tag: "img", status: "supported", specKind: "image" },
    { tag: "button", status: "supported", specKind: "button" },
    { tag: "input", status: "supported", specKind: "input" },
    { tag: "select_static", status: "supported", specKind: "staticSelect" },
    { tag: "form", status: "supported", specKind: "form" },
    { tag: "table", status: "supported", specKind: "table" },
    { tag: "column", status: "supported", specKind: "column" },
    { tag: "column_set", status: "supported", specKind: "columnSet" },
    {
        tag: "collapsible_panel",
        status: "supported",
        specKind: "collapsiblePanel",
    },
    {
        tag: "interactive_container",
        status: "supported",
        specKind: "interactiveContainer",
    },
    { tag: "img_combination", status: "unsupported" },
    { tag: "person", status: "unsupported" },
    { tag: "person_list", status: "unsupported" },
    { tag: "chart", status: "unsupported" },
    { tag: "overflow", status: "unsupported" },
    { tag: "multi_select_static", status: "unsupported" },
    { tag: "select_person", status: "unsupported" },
    { tag: "multi_select_person", status: "unsupported" },
    { tag: "date_picker", status: "unsupported" },
    { tag: "picker_time", status: "unsupported" },
    { tag: "picker_datetime", status: "unsupported" },
    { tag: "select_img", status: "unsupported" },
    { tag: "checker", status: "unsupported" },
];
const supportedEntries = OFFICIAL_COMPONENT_CATALOG.filter((entry) => entry.status === "supported");
export const SUPPORTED_COMPONENT_KINDS = supportedEntries.map((entry) => entry.specKind);
export const SUPPORTED_SPEC_KINDS = SUPPORTED_COMPONENT_KINDS;
export const SUPPORTED_OFFICIAL_TAGS = supportedEntries.map((entry) => entry.tag);
export const UNSUPPORTED_OFFICIAL_TAGS = OFFICIAL_COMPONENT_CATALOG
    .filter((entry) => entry.status === "unsupported")
    .map((entry) => entry.tag);
export const OFFICIAL_COMPONENT_TAGS = OFFICIAL_COMPONENT_CATALOG.map((entry) => entry.tag);
export const SPEC_KIND_TO_OFFICIAL_TAG = Object.fromEntries(supportedEntries.map((entry) => [entry.specKind, entry.tag]));
/** @deprecated Use UNSUPPORTED_OFFICIAL_TAGS. */
export const UNSUPPORTED_COMPONENT_KINDS = UNSUPPORTED_OFFICIAL_TAGS;
export const BUILDER_CAPABILITIES = {
    capabilitiesVersion: 2,
    specVersion: 1,
    builderVersion: BUILDER_VERSION,
    rulesSnapshot: SNAPSHOT_ID,
    supportedSpecKinds: SUPPORTED_SPEC_KINDS,
    supportedOfficialTags: SUPPORTED_OFFICIAL_TAGS,
    unsupportedOfficialTags: UNSUPPORTED_OFFICIAL_TAGS,
    specKindToOfficialTag: SPEC_KIND_TO_OFFICIAL_TAG,
    officialComponentTags: OFFICIAL_COMPONENT_TAGS,
    /** @deprecated Use supportedSpecKinds. */
    supportedComponents: SUPPORTED_COMPONENT_KINDS,
    /** @deprecated Use unsupportedOfficialTags. */
    unsupportedComponents: UNSUPPORTED_OFFICIAL_TAGS,
    limits: Object.fromEntries(Object.entries(OFFICIAL_LIMITS).map(([key, rule]) => [key, rule.value])),
};
//# sourceMappingURL=capabilities.js.map