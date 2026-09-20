import { createHash } from "node:crypto";
import { jsonDigest } from "./canonical-json.js";
import { OFFICIAL_COMPONENT_LIMIT, OFFICIAL_LIMITS, } from "./official-limits.js";
import { validateComponentSemantics } from "./rules.js";
import { cardSpecSchema } from "./schema.js";
import { SNAPSHOT_ID, isBuiltInColor, isBuiltInTextSize, } from "./snapshot.js";
import { BUILDER_VERSION } from "./version.js";
const DEFAULT_TARGET_BUDGET = 160;
export class CardBuildError extends Error {
    issues;
    constructor(issues) {
        super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
        this.name = "CardBuildError";
        this.issues = issues;
    }
}
function pathFor(parts) {
    if (parts.length === 0)
        return "$";
    return parts.reduce((path, part) => {
        if (typeof part === "number")
            return `${path}[${part}]`;
        return path === "$" ? `$.${String(part)}` : `${path}.${String(part)}`;
    }, "$");
}
function issue(issues, code, path, message) {
    issues.push({ code, path, message });
}
function registerUnique(state, kind, value, path) {
    const registry = kind === "key" ? state.keys : state.names;
    const previous = registry.get(value);
    if (previous) {
        issue(state.issues, kind === "key" ? "duplicate_key" : "duplicate_name", path, `${kind} “${value}” 已在 ${previous} 使用`);
        return;
    }
    registry.set(value, path);
}
function isValidUrl(value) {
    if (value === "lark://msgcard/unsupported_action")
        return true;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    }
    catch {
        return false;
    }
}
function validateUrl(state, value, path) {
    if (value !== undefined && !isValidUrl(value)) {
        issue(state.issues, "invalid_url", path, "只接受 http(s) URL 或飞书禁用跳转地址");
    }
}
function validateColor(state, value, path, extras = []) {
    if (value !== undefined &&
        !isBuiltInColor(value) &&
        !state.customColors.has(value) &&
        !extras.includes(value)) {
        issue(state.issues, "unknown_color", path, `颜色 “${value}” 不在当前官方快照或 config.colorStyles 中`);
    }
}
function validateTextSize(state, value, path) {
    if (value !== undefined &&
        !isBuiltInTextSize(value) &&
        !state.customTextSizes.has(value)) {
        issue(state.issues, "unknown_text_size", path, `字号 “${value}” 不在当前官方快照或 config.textStyles 中`);
    }
}
function validateText(state, text, path) {
    if (!text)
        return;
    validateTextSize(state, text.textSize, `${path}.textSize`);
    validateColor(state, text.textColor, `${path}.textColor`, ["default"]);
}
function validateIcon(state, icon, path) {
    if (icon?.kind === "standardIcon") {
        validateColor(state, icon.color, `${path}.color`, ["default"]);
    }
}
function validateBehaviors(state, behaviors, path) {
    for (const [index, behavior] of (behaviors ?? []).entries()) {
        if (behavior.kind === "openUrl") {
            validateUrl(state, behavior.defaultUrl, `${path}[${index}].defaultUrl`);
            validateUrl(state, behavior.pcUrl, `${path}[${index}].pcUrl`);
            validateUrl(state, behavior.iosUrl, `${path}[${index}].iosUrl`);
            validateUrl(state, behavior.androidUrl, `${path}[${index}].androidUrl`);
        }
    }
}
function validateComponent(component, path, parent, depth, state) {
    state.issues.push(...validateComponentSemantics(component, path));
    if (depth > OFFICIAL_LIMITS.nestingDepth.value) {
        issue(state.issues, "nesting_too_deep", path, `飞书容器最多嵌套 ${OFFICIAL_LIMITS.nestingDepth.value} 层`);
    }
    if (component.key) {
        registerUnique(state, "key", component.key, `${path}.key`);
        state.sawAddressableElement = true;
    }
    if (component.streamTarget) {
        state.sawStreamTarget = true;
        if (!component.key) {
            issue(state.issues, "stream_target_missing_key", `${path}.streamTarget`, "streamTarget 必须同时声明稳定 key");
        }
        if (component.kind !== "markdown" && component.kind !== "div") {
            issue(state.issues, "unsupported_stream_target", `${path}.streamTarget`, "v1 仅允许 markdown 或 div 文本作为持续更新目标");
        }
    }
    switch (component.kind) {
        case "markdown":
            validateTextSize(state, component.textSize, `${path}.textSize`);
            validateColor(state, component.color, `${path}.color`, ["default"]);
            validateIcon(state, component.icon, `${path}.icon`);
            return;
        case "div":
            if (!component.text && (!component.fields || component.fields.length === 0)) {
                issue(state.issues, "empty_div", path, "div 至少需要 text 或 fields");
            }
            validateText(state, component.text, `${path}.text`);
            component.fields?.forEach((field, index) => validateText(state, field.text, `${path}.fields[${index}].text`));
            validateIcon(state, component.icon, `${path}.icon`);
            return;
        case "hr":
            return;
        case "image":
            return;
        case "button": {
            if (component.name) {
                registerUnique(state, "name", component.name, `${path}.name`);
            }
            validateIcon(state, component.icon, `${path}.icon`);
            validateBehaviors(state, component.behaviors, `${path}.behaviors`);
            if (parent === "form") {
                if (!component.name) {
                    issue(state.issues, "form_name_required", `${path}.name`, "表单内按钮必须声明 name");
                }
                if (!component.formAction) {
                    issue(state.issues, "form_action_required", `${path}.formAction`, "表单内按钮必须声明 submit 或 reset");
                }
                if (component.behaviors) {
                    issue(state.issues, "form_button_behaviors_forbidden", `${path}.behaviors`, "表单按钮使用 formAction，不能同时声明 behaviors");
                }
            }
            else {
                if (component.formAction) {
                    issue(state.issues, "form_action_outside_form", `${path}.formAction`, "formAction 只能用于 form 内按钮");
                }
                if (!component.behaviors || component.behaviors.length === 0) {
                    issue(state.issues, "button_behavior_required", `${path}.behaviors`, "非表单按钮必须至少声明一个 callback 或 openUrl 行为");
                }
            }
            return;
        }
        case "input":
            if (component.name) {
                registerUnique(state, "name", component.name, `${path}.name`);
            }
            if (parent === "form" && !component.name) {
                issue(state.issues, "form_name_required", `${path}.name`, "表单内 input 必须声明 name");
            }
            validateBehaviors(state, component.behaviors, `${path}.behaviors`);
            return;
        case "staticSelect": {
            if (component.name) {
                registerUnique(state, "name", component.name, `${path}.name`);
            }
            if (parent === "form" && !component.name) {
                issue(state.issues, "form_name_required", `${path}.name`, "表单内 staticSelect 必须声明 name");
            }
            const values = new Set();
            component.options.forEach((option, index) => {
                if (values.has(option.value)) {
                    issue(state.issues, "duplicate_option_value", `${path}.options[${index}].value`, `选项值 “${option.value}” 重复`);
                }
                values.add(option.value);
                validateIcon(state, option.icon, `${path}.options[${index}].icon`);
            });
            validateBehaviors(state, component.behaviors, `${path}.behaviors`);
            return;
        }
        case "form": {
            if (parent !== "root") {
                issue(state.issues, "invalid_nesting", path, "form 只能位于 body.elements 根层");
            }
            registerUnique(state, "name", component.name, `${path}.name`);
            let submitCount = 0;
            component.components.forEach((child, index) => {
                if (child.kind === "table" || child.kind === "form") {
                    issue(state.issues, "invalid_nesting", `${path}.components[${index}]`, "form 内不能包含 table 或 form");
                }
                if (child.kind === "button" && child.formAction === "submit")
                    submitCount += 1;
                validateComponent(child, `${path}.components[${index}]`, "form", depth + 1, state);
            });
            if (submitCount === 0) {
                issue(state.issues, "form_submit_required", `${path}.components`, "form 至少需要一个 formAction=submit 的按钮");
            }
            return;
        }
        case "table": {
            if (parent !== "root") {
                issue(state.issues, "invalid_nesting", path, "table 只能位于 body.elements 根层");
            }
            const columnNames = new Set(component.columns.map((column) => column.name));
            component.rows.forEach((row, rowIndex) => {
                for (const key of Object.keys(row)) {
                    if (!columnNames.has(key)) {
                        issue(state.issues, "unknown_table_column", `${path}.rows[${rowIndex}].${key}`, `行字段 “${key}” 没有对应列定义`);
                    }
                }
            });
            validateColor(state, component.headerStyle?.textColor, `${path}.headerStyle.textColor`, ["default"]);
            validateTextSize(state, component.headerStyle?.textSize, `${path}.headerStyle.textSize`);
            return;
        }
        case "column":
            if (parent !== "columnSet") {
                issue(state.issues, "invalid_nesting", path, "column 只能作为 columnSet 的直接子节点");
            }
            validateColor(state, component.backgroundStyle, `${path}.backgroundStyle`, ["default"]);
            validateUrl(state, component.openUrl, `${path}.openUrl`);
            component.components.forEach((child, index) => {
                if (child.kind === "form" || child.kind === "table") {
                    issue(state.issues, "invalid_nesting", `${path}.components[${index}]`, "column 内不能包含 form 或 table");
                }
                validateComponent(child, `${path}.components[${index}]`, "column", depth + 1, state);
            });
            return;
        case "columnSet":
            validateColor(state, component.backgroundStyle, `${path}.backgroundStyle`, ["default"]);
            validateUrl(state, component.openUrl, `${path}.openUrl`);
            component.columns.forEach((column, index) => {
                if (column.kind !== "column") {
                    issue(state.issues, "invalid_nesting", `${path}.columns[${index}]`, "columnSet 的直接子节点只能是 column");
                    return;
                }
                validateComponent(column, `${path}.columns[${index}]`, "columnSet", depth + 1, state);
            });
            return;
        case "collapsiblePanel":
            validateText(state, component.header.title, `${path}.header.title`);
            validateIcon(state, component.header.icon, `${path}.header.icon`);
            validateColor(state, component.header.backgroundColor, `${path}.header.backgroundColor`);
            validateColor(state, component.backgroundColor, `${path}.backgroundColor`);
            validateColor(state, component.border?.color, `${path}.border.color`);
            component.components.forEach((child, index) => {
                if (child.kind === "form") {
                    issue(state.issues, "invalid_nesting", `${path}.components[${index}]`, "collapsiblePanel 内不能包含 form");
                }
                validateComponent(child, `${path}.components[${index}]`, "collapsiblePanel", depth + 1, state);
            });
            return;
        case "interactiveContainer":
            validateBehaviors(state, component.behaviors, `${path}.behaviors`);
            validateColor(state, component.backgroundStyle, `${path}.backgroundStyle`, ["default", "laser"]);
            validateColor(state, component.borderColor, `${path}.borderColor`);
            component.components.forEach((child, index) => {
                if (child.kind === "form" || child.kind === "table") {
                    issue(state.issues, "invalid_nesting", `${path}.components[${index}]`, "interactiveContainer 内不能包含 form 或 table");
                }
                validateComponent(child, `${path}.components[${index}]`, "interactiveContainer", depth + 1, state);
            });
    }
}
function validateCardSpec(spec) {
    const state = {
        issues: [],
        keys: new Map(),
        names: new Map(),
        customColors: new Set(Object.keys(spec.config?.colorStyles ?? {})),
        customTextSizes: new Set(Object.keys(spec.config?.textStyles ?? {})),
        sawAddressableElement: false,
        sawStreamTarget: false,
    };
    validateText(state, spec.header?.title, "$.header.title");
    validateText(state, spec.header?.subtitle, "$.header.subtitle");
    validateIcon(state, spec.header?.icon, "$.header.icon");
    validateUrl(state, spec.cardLink?.url, "$.cardLink.url");
    validateUrl(state, spec.cardLink?.pcUrl, "$.cardLink.pcUrl");
    validateUrl(state, spec.cardLink?.iosUrl, "$.cardLink.iosUrl");
    validateUrl(state, spec.cardLink?.androidUrl, "$.cardLink.androidUrl");
    spec.blocks.forEach((block, blockIndex) => {
        block.components.forEach((component, componentIndex) => validateComponent(component, `$.blocks[${blockIndex}].components[${componentIndex}]`, "root", 0, state));
    });
    if (state.sawAddressableElement && !spec.cardKey) {
        issue(state.issues, "card_key_required", "$.cardKey", "存在 key 或 streamTarget 时必须声明 cardKey");
    }
    return state;
}
function put(target, key, value) {
    if (value !== undefined)
        target[key] = value;
}
function compileText(text) {
    const output = {
        tag: text.kind === "plainText" ? "plain_text" : "lark_md",
        content: text.content,
    };
    put(output, "text_size", text.textSize);
    put(output, "text_color", text.textColor);
    put(output, "text_align", text.textAlign);
    put(output, "lines", text.lines);
    return output;
}
function compileIcon(icon) {
    if (icon.kind === "customIcon") {
        return { tag: "custom_icon", img_key: icon.imageKey };
    }
    const output = { tag: "standard_icon", token: icon.token };
    put(output, "color", icon.color);
    put(output, "size", icon.size);
    return output;
}
function compileBehavior(behavior) {
    if (behavior.kind === "callback") {
        return { type: "callback", value: behavior.value };
    }
    const output = {
        type: "open_url",
        default_url: behavior.defaultUrl,
    };
    put(output, "pc_url", behavior.pcUrl);
    put(output, "ios_url", behavior.iosUrl);
    put(output, "android_url", behavior.androidUrl);
    return output;
}
function compileConfirm(confirm) {
    const output = {
        title: { tag: "plain_text", content: confirm.title },
    };
    if (confirm.text !== undefined) {
        output.text = { tag: "plain_text", content: confirm.text };
    }
    return output;
}
function stableElementId(cardKey, key) {
    const digest = createHash("sha256")
        .update(cardKey)
        .update("\0")
        .update(key)
        .digest("hex");
    return `e${digest.slice(0, 19)}`;
}
function applyAddressability(output, component, cardKey, refs) {
    if (!component.key || !cardKey)
        return;
    const elementId = stableElementId(cardKey, component.key);
    if (component.kind === "div" && component.streamTarget) {
        const text = output.text;
        if (typeof text === "object" && text !== null && !Array.isArray(text)) {
            text.element_id = elementId;
        }
    }
    else {
        output.element_id = elementId;
    }
    refs.push({
        key: component.key,
        elementId,
        kind: component.kind,
        streamable: component.streamTarget === true,
    });
}
function compileComponents(components, cardKey, refs) {
    return components.map((component) => compileComponent(component, cardKey, refs));
}
function escapeMarkdownText(value) {
    return value.replace(/[\\`*{}\[\]()#+\-.!_~<>:|]/g, "\\$&");
}
function compileMarkdownContent(component) {
    if (component.content !== undefined)
        return component.content;
    return (component.fragments ?? []).map((fragment) => {
        switch (fragment.kind) {
            case "text":
                return escapeMarkdownText(fragment.text);
            case "boldText":
                return `**${escapeMarkdownText(fragment.text)}**`;
            case "lineBreak":
                return "\n";
            case "link":
                return `[${escapeMarkdownText(fragment.label)}](${fragment.url})`;
            case "rawMarkdown":
                return fragment.markdown;
        }
    }).join("");
}
function compileComponent(component, cardKey, refs) {
    let output;
    switch (component.kind) {
        case "markdown": {
            const markdownContent = compileMarkdownContent(component);
            const content = component.color
                ? `<font color='${component.color}'>${markdownContent}</font>`
                : markdownContent;
            output = { tag: "markdown", content };
            put(output, "text_size", component.textSize);
            put(output, "text_align", component.textAlign);
            if (component.icon)
                output.icon = compileIcon(component.icon);
            break;
        }
        case "div":
            output = { tag: "div" };
            if (component.text)
                output.text = compileText(component.text);
            if (component.fields) {
                output.fields = component.fields.map((field) => ({
                    is_short: field.short ?? false,
                    text: compileText(field.text),
                }));
            }
            if (component.icon)
                output.icon = compileIcon(component.icon);
            put(output, "width", component.width);
            break;
        case "hr":
            output = { tag: "hr" };
            break;
        case "image":
            output = {
                tag: "img",
                img_key: component.imageKey,
                alt: { tag: "plain_text", content: component.alt },
            };
            if (component.title !== undefined) {
                output.title = { tag: "plain_text", content: component.title };
            }
            put(output, "scale_type", component.scaleType === "cropCenter"
                ? "crop_center"
                : component.scaleType === "cropTop"
                    ? "crop_top"
                    : component.scaleType === "fitHorizontal"
                        ? "fit_horizontal"
                        : undefined);
            put(output, "size", component.size);
            put(output, "corner_radius", component.cornerRadius);
            put(output, "transparent", component.transparent);
            put(output, "preview", component.preview);
            break;
        case "button": {
            const appearanceMap = {
                default: "default",
                primary: "primary",
                danger: "danger",
                text: "text",
                primaryText: "primary_text",
                dangerText: "danger_text",
                primaryFilled: "primary_filled",
                dangerFilled: "danger_filled",
                laser: "laser",
            };
            output = {
                tag: "button",
                text: { tag: "plain_text", content: component.text },
            };
            put(output, "type", component.appearance ? appearanceMap[component.appearance] : undefined);
            put(output, "size", component.size);
            put(output, "width", component.width);
            if (component.behaviors) {
                output.behaviors = component.behaviors.map(compileBehavior);
            }
            if (component.icon)
                output.icon = compileIcon(component.icon);
            if (component.hoverTips !== undefined) {
                output.hover_tips = { tag: "plain_text", content: component.hoverTips };
            }
            put(output, "disabled", component.disabled);
            if (component.disabledTips !== undefined) {
                output.disabled_tips = { tag: "plain_text", content: component.disabledTips };
            }
            if (component.confirm)
                output.confirm = compileConfirm(component.confirm);
            put(output, "name", component.name);
            put(output, "form_action_type", component.formAction);
            break;
        }
        case "input":
            output = { tag: "input" };
            put(output, "name", component.name);
            put(output, "required", component.required);
            if (component.placeholder !== undefined) {
                output.placeholder = { tag: "plain_text", content: component.placeholder };
            }
            put(output, "default_value", component.defaultValue);
            if (component.label !== undefined) {
                output.label = { tag: "plain_text", content: component.label };
            }
            put(output, "label_position", component.labelPosition);
            put(output, "input_type", component.inputType === "multilineText"
                ? "multiline_text"
                : component.inputType);
            put(output, "rows", component.rows);
            put(output, "auto_resize", component.autoResize);
            put(output, "max_rows", component.maxRows);
            put(output, "max_length", component.maxLength);
            put(output, "show_icon", component.showIcon);
            put(output, "width", component.width);
            put(output, "disabled", component.disabled);
            if (component.disabledTips !== undefined) {
                output.disabled_tips = { tag: "plain_text", content: component.disabledTips };
            }
            if (component.behaviors)
                output.behaviors = component.behaviors.map(compileBehavior);
            if (component.confirm)
                output.confirm = compileConfirm(component.confirm);
            break;
        case "staticSelect":
            output = {
                tag: "select_static",
                options: component.options.map((option) => {
                    const compiled = {
                        text: { tag: "plain_text", content: option.text },
                        value: option.value,
                    };
                    if (option.icon)
                        compiled.icon = compileIcon(option.icon);
                    return compiled;
                }),
            };
            put(output, "name", component.name);
            put(output, "required", component.required);
            put(output, "type", component.appearance);
            if (component.placeholder !== undefined) {
                output.placeholder = { tag: "plain_text", content: component.placeholder };
            }
            put(output, "initial_option", component.initialOption);
            put(output, "initial_index", component.initialIndex);
            put(output, "width", component.width);
            put(output, "disabled", component.disabled);
            if (component.disabledTips !== undefined) {
                output.disabled_tips = { tag: "plain_text", content: component.disabledTips };
            }
            if (component.behaviors)
                output.behaviors = component.behaviors.map(compileBehavior);
            if (component.confirm)
                output.confirm = compileConfirm(component.confirm);
            break;
        case "form":
            output = {
                tag: "form",
                name: component.name,
                elements: compileComponents(component.components, cardKey, refs),
            };
            put(output, "direction", component.direction);
            put(output, "horizontal_spacing", component.horizontalSpacing);
            put(output, "vertical_spacing", component.verticalSpacing);
            put(output, "horizontal_align", component.horizontalAlign);
            put(output, "vertical_align", component.verticalAlign);
            put(output, "padding", component.padding);
            break;
        case "table":
            output = {
                tag: "table",
                columns: component.columns.map((column) => {
                    const compiled = {
                        name: column.name,
                        data_type: column.dataType === "larkMd" ? "lark_md" : column.dataType,
                    };
                    put(compiled, "display_name", column.displayName);
                    put(compiled, "width", column.width);
                    put(compiled, "horizontal_align", column.horizontalAlign);
                    put(compiled, "vertical_align", column.verticalAlign);
                    put(compiled, "date_format", column.dateFormat);
                    if (column.numberFormat) {
                        const format = {};
                        put(format, "precision", column.numberFormat.precision);
                        put(format, "symbol", column.numberFormat.symbol);
                        put(format, "separator", column.numberFormat.separator);
                        compiled.format = format;
                    }
                    return compiled;
                }),
                rows: component.rows,
            };
            put(output, "page_size", component.pageSize);
            put(output, "row_height", component.rowHeight);
            put(output, "row_max_height", component.rowMaxHeight);
            put(output, "freeze_first_column", component.freezeFirstColumn);
            if (component.headerStyle) {
                const style = {};
                put(style, "text_align", component.headerStyle.textAlign);
                put(style, "text_size", component.headerStyle.textSize);
                put(style, "background_style", component.headerStyle.backgroundStyle);
                put(style, "text_color", component.headerStyle.textColor);
                put(style, "bold", component.headerStyle.bold);
                put(style, "lines", component.headerStyle.lines);
                output.header_style = style;
            }
            break;
        case "column":
            output = {
                tag: "column",
                elements: compileComponents(component.components, cardKey, refs),
            };
            put(output, "width", component.width);
            put(output, "weight", component.weight);
            put(output, "vertical_align", component.verticalAlign);
            put(output, "direction", component.direction);
            put(output, "horizontal_spacing", component.horizontalSpacing);
            put(output, "vertical_spacing", component.verticalSpacing);
            put(output, "padding", component.padding);
            put(output, "background_style", component.backgroundStyle);
            put(output, "corner_radius", component.cornerRadius);
            if (component.openUrl) {
                output.action = { multi_url: { url: component.openUrl } };
            }
            break;
        case "columnSet":
            output = {
                tag: "column_set",
                columns: component.columns.map((column) => compileComponent(column, cardKey, refs)),
            };
            put(output, "flex_mode", component.flexMode);
            put(output, "horizontal_spacing", component.horizontalSpacing);
            put(output, "horizontal_align", component.horizontalAlign);
            put(output, "background_style", component.backgroundStyle);
            if (component.openUrl) {
                output.action = { multi_url: { url: component.openUrl } };
            }
            break;
        case "collapsiblePanel": {
            const header = {};
            if (component.header.title)
                header.title = compileText(component.header.title);
            put(header, "background_color", component.header.backgroundColor);
            put(header, "width", component.header.width === "autoWhenFold"
                ? "auto_when_fold"
                : component.header.width);
            put(header, "vertical_align", component.header.verticalAlign);
            if (component.header.icon)
                header.icon = compileIcon(component.header.icon);
            put(header, "icon_position", component.header.iconPosition === "followText"
                ? "follow_text"
                : component.header.iconPosition);
            put(header, "icon_expanded_angle", component.header.iconExpandedAngle);
            output = {
                tag: "collapsible_panel",
                header,
                elements: compileComponents(component.components, cardKey, refs),
            };
            put(output, "expanded", component.expanded);
            put(output, "background_color", component.backgroundColor);
            if (component.border) {
                const border = {};
                put(border, "color", component.border.color);
                put(border, "corner_radius", component.border.cornerRadius);
                output.border = border;
            }
            put(output, "direction", component.direction);
            put(output, "vertical_spacing", component.verticalSpacing);
            put(output, "horizontal_spacing", component.horizontalSpacing);
            put(output, "padding", component.padding);
            break;
        }
        case "interactiveContainer":
            output = {
                tag: "interactive_container",
                elements: compileComponents(component.components, cardKey, refs),
                behaviors: component.behaviors.map(compileBehavior),
            };
            put(output, "width", component.width);
            put(output, "height", component.height);
            put(output, "direction", component.direction);
            put(output, "horizontal_align", component.horizontalAlign);
            put(output, "vertical_align", component.verticalAlign);
            put(output, "background_style", component.backgroundStyle);
            put(output, "has_border", component.hasBorder);
            put(output, "border_color", component.borderColor);
            put(output, "corner_radius", component.cornerRadius);
            put(output, "padding", component.padding);
            put(output, "disabled", component.disabled);
            if (component.disabledTips !== undefined) {
                output.disabled_tips = { tag: "plain_text", content: component.disabledTips };
            }
            if (component.hoverTips !== undefined) {
                output.hover_tips = { tag: "plain_text", content: component.hoverTips };
            }
            if (component.confirm)
                output.confirm = compileConfirm(component.confirm);
            break;
    }
    put(output, "margin", component.margin);
    applyAddressability(output, component, cardKey, refs);
    return output;
}
export function countTaggedNodes(value) {
    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + countTaggedNodes(item), 0);
    }
    if (typeof value !== "object" || value === null)
        return 0;
    const record = value;
    let count = typeof record.tag === "string" ? 1 : 0;
    for (const child of Object.values(record))
        count += countTaggedNodes(child);
    return count;
}
function compileHeader(header, suffix) {
    const title = compileText(header.title);
    if (suffix)
        title.content = `${header.title.content}${suffix}`;
    const output = { title };
    if (header.subtitle)
        output.subtitle = compileText(header.subtitle);
    put(output, "template", header.theme);
    if (header.tags) {
        output.text_tag_list = header.tags.map((tag) => {
            const compiled = {
                tag: "text_tag",
                text: { tag: "plain_text", content: tag.text },
            };
            put(compiled, "color", tag.color);
            return compiled;
        });
    }
    if (header.icon)
        output.icon = compileIcon(header.icon);
    put(output, "padding", header.padding);
    return output;
}
function compileCardLink(link) {
    const output = { url: link.url };
    put(output, "pc_url", link.pcUrl);
    put(output, "ios_url", link.iosUrl);
    put(output, "android_url", link.androidUrl);
    return output;
}
function compileConfig(spec, forceStreaming) {
    const config = { update_multi: true };
    put(config, "width_mode", spec.config?.widthMode);
    put(config, "enable_forward", spec.config?.enableForward);
    if (spec.config?.summary !== undefined) {
        config.summary = { content: spec.config.summary };
    }
    if (forceStreaming || spec.config?.streamingMode)
        config.streaming_mode = true;
    if (spec.config?.streamingConfig) {
        const streaming = {};
        if (spec.config.streamingConfig.printFrequencyMs) {
            const frequency = {};
            put(frequency, "default", spec.config.streamingConfig.printFrequencyMs.default);
            put(frequency, "android", spec.config.streamingConfig.printFrequencyMs.android);
            put(frequency, "ios", spec.config.streamingConfig.printFrequencyMs.ios);
            put(frequency, "pc", spec.config.streamingConfig.printFrequencyMs.pc);
            streaming.print_frequency_ms = frequency;
        }
        if (spec.config.streamingConfig.printStep) {
            const step = {};
            put(step, "default", spec.config.streamingConfig.printStep.default);
            put(step, "android", spec.config.streamingConfig.printStep.android);
            put(step, "ios", spec.config.streamingConfig.printStep.ios);
            put(step, "pc", spec.config.streamingConfig.printStep.pc);
            streaming.print_step = step;
        }
        put(streaming, "print_strategy", spec.config.streamingConfig.printStrategy);
        config.streaming_config = streaming;
    }
    const style = {};
    if (spec.config?.textStyles) {
        const textSize = {};
        for (const [name, token] of Object.entries(spec.config.textStyles)) {
            const compiled = { default: token.default };
            put(compiled, "pc", token.pc);
            put(compiled, "mobile", token.mobile);
            textSize[name] = compiled;
        }
        style.text_size = textSize;
    }
    if (spec.config?.colorStyles) {
        const color = {};
        for (const [name, token] of Object.entries(spec.config.colorStyles)) {
            color[name] = {
                light_mode: token.lightMode,
                dark_mode: token.darkMode,
            };
        }
        style.color = color;
    }
    if (Object.keys(style).length > 0)
        config.style = style;
    return config;
}
function compileBodyLayout(spec, elements) {
    const output = { elements };
    put(output, "direction", spec.body?.direction ?? "vertical");
    put(output, "padding", spec.body?.padding);
    put(output, "horizontal_spacing", spec.body?.horizontalSpacing);
    put(output, "vertical_spacing", spec.body?.verticalSpacing);
    put(output, "horizontal_align", spec.body?.horizontalAlign);
    put(output, "vertical_align", spec.body?.verticalAlign);
    return output;
}
function buildPhysicalCard(spec, blocks, part, total, forceStreaming) {
    const card = {
        schema: "2.0",
        config: compileConfig(spec, forceStreaming),
    };
    const suffix = total > 1 ? `（${part}/${total}）` : undefined;
    if (spec.header) {
        card.header = compileHeader(spec.header, suffix);
    }
    else if (suffix) {
        card.header = {
            title: { tag: "plain_text", content: suffix },
        };
    }
    card.body = compileBodyLayout(spec, blocks.flatMap((block) => block.elements));
    if (spec.cardLink)
        card.card_link = compileCardLink(spec.cardLink);
    return card;
}
function baseCount(spec, forceStreaming, syntheticHeader) {
    const card = buildPhysicalCard(spec, [], 1, syntheticHeader ? 2 : 1, forceStreaming);
    return countTaggedNodes(card);
}
function packBlocks(blocks, baseComponentCount, targetBudget, issues) {
    if (baseComponentCount > OFFICIAL_COMPONENT_LIMIT) {
        issue(issues, "card_base_exceeds_limit", "$", `公共卡片结构已有 ${baseComponentCount} 个组件，超过官方硬限制 ${OFFICIAL_COMPONENT_LIMIT}`);
        return [];
    }
    for (const block of blocks) {
        const total = baseComponentCount + block.componentCount;
        if (total > OFFICIAL_COMPONENT_LIMIT) {
            issue(issues, "atomic_block_exceeds_limit", `$.blocks[${block.sourceIndex}]`, `原子 block 加公共结构共有 ${total} 个组件，超过官方硬限制 ${OFFICIAL_COMPONENT_LIMIT}`);
        }
    }
    if (issues.length > 0)
        return [];
    const parts = [];
    let current = [];
    let currentCount = baseComponentCount;
    for (const block of blocks) {
        if (current.length > 0 && currentCount + block.componentCount > targetBudget) {
            parts.push(current);
            current = [];
            currentCount = baseComponentCount;
        }
        current.push(block);
        currentCount += block.componentCount;
    }
    if (current.length > 0)
        parts.push(current);
    return parts;
}
function compileBlocks(spec) {
    return spec.blocks.map((block, sourceIndex) => {
        const refs = [];
        const elements = compileComponents(block.components, spec.cardKey, refs);
        return {
            sourceIndex,
            elements,
            componentCount: countTaggedNodes(elements),
            refs,
        };
    });
}
function validateCallbackBytes(value, path, maxCallbackBytes, issues) {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => validateCallbackBytes(entry, `${path}[${index}]`, maxCallbackBytes, issues));
        return;
    }
    if (typeof value !== "object" || value === null)
        return;
    const record = value;
    if (record.kind === "callback" && record.value !== undefined) {
        const bytes = Buffer.byteLength(JSON.stringify(record.value), "utf8");
        if (bytes > maxCallbackBytes) {
            issue(issues, "callback_value_too_large", `${path}.value`, `callback value 为 ${bytes} UTF-8 字节，超过调用方限制 ${maxCallbackBytes}`);
        }
    }
    for (const [key, child] of Object.entries(record)) {
        validateCallbackBytes(child, `${path}.${key}`, maxCallbackBytes, issues);
    }
}
export function compileCardSpec(input, options = {}) {
    const parsed = cardSpecSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            issues: parsed.error.issues.map((zodIssue) => ({
                code: zodIssue.code === "too_big" && zodIssue.origin === "string"
                    ? "field_too_long"
                    : `schema_${zodIssue.code}`,
                path: pathFor(zodIssue.path),
                message: zodIssue.message,
            })),
        };
    }
    const spec = parsed.data;
    const validation = validateCardSpec(spec);
    if (validation.issues.length > 0)
        return { ok: false, issues: validation.issues };
    const specDigest = jsonDigest(spec);
    const targetBudget = options.targetBudget ?? DEFAULT_TARGET_BUDGET;
    if (!Number.isInteger(targetBudget) ||
        targetBudget <= 0 ||
        targetBudget > OFFICIAL_COMPONENT_LIMIT) {
        return {
            ok: false,
            issues: [
                {
                    code: "invalid_target_budget",
                    path: "$options.targetBudget",
                    message: `targetBudget 必须是 1–${OFFICIAL_COMPONENT_LIMIT} 的整数`,
                },
            ],
        };
    }
    const maxCardBytes = options.consumerLimits?.maxCardBytes;
    const maxCallbackBytes = options.consumerLimits?.maxCallbackBytes;
    const invalidConsumerLimit = [
        ["maxCardBytes", maxCardBytes],
        ["maxCallbackBytes", maxCallbackBytes],
    ].find(([, value]) => value !== undefined && (!Number.isInteger(value) || Number(value) <= 0));
    if (invalidConsumerLimit) {
        return {
            ok: false,
            issues: [
                {
                    code: "invalid_consumer_limit",
                    path: `$options.consumerLimits.${invalidConsumerLimit[0]}`,
                    message: `${invalidConsumerLimit[0]} 必须是正整数`,
                },
            ],
        };
    }
    if (maxCallbackBytes !== undefined) {
        const callbackIssues = [];
        validateCallbackBytes(spec, "$", maxCallbackBytes, callbackIssues);
        if (callbackIssues.length > 0)
            return { ok: false, issues: callbackIssues };
    }
    const blocks = compileBlocks(spec);
    let packingIssues = [];
    let parts = packBlocks(blocks, baseCount(spec, validation.sawStreamTarget, false), targetBudget, packingIssues);
    if (packingIssues.length > 0)
        return { ok: false, issues: packingIssues };
    if (parts.length > 1 && !spec.header) {
        packingIssues = [];
        parts = packBlocks(blocks, baseCount(spec, validation.sawStreamTarget, true), targetBudget, packingIssues);
        if (packingIssues.length > 0)
            return { ok: false, issues: packingIssues };
    }
    const total = parts.length;
    const elementIndex = {};
    const cards = parts.map((partBlocks, index) => {
        const part = index + 1;
        for (const block of partBlocks) {
            for (const ref of block.refs) {
                elementIndex[ref.key] = {
                    part,
                    elementId: ref.elementId,
                    kind: ref.kind,
                    streamable: ref.streamable,
                };
            }
        }
        const card = buildPhysicalCard(spec, partBlocks, part, total, validation.sawStreamTarget);
        return {
            part,
            total,
            componentCount: countTaggedNodes(card),
            serializedBytes: Buffer.byteLength(JSON.stringify(card), "utf8"),
            cardDigest: jsonDigest(card),
            card,
        };
    });
    const postIssues = [];
    cards.forEach((compiled, index) => {
        if (compiled.componentCount > OFFICIAL_COMPONENT_LIMIT) {
            issue(postIssues, "compiled_card_exceeds_official_limit", `$.cards[${index}]`, `编译结果包含 ${compiled.componentCount} 个组件，超过官方硬限制 ${OFFICIAL_COMPONENT_LIMIT}`);
        }
        if (maxCardBytes !== undefined && compiled.serializedBytes > maxCardBytes) {
            issue(postIssues, "card_payload_too_large", `$.cards[${index}]`, `编译结果为 ${compiled.serializedBytes} UTF-8 字节，超过调用方限制 ${maxCardBytes}`);
        }
        const tableCount = countTag(compiled.card, "table");
        if (tableCount > OFFICIAL_LIMITS.tablesPerCard.value) {
            issue(postIssues, "too_many_tables", `$.cards[${index}]`, `单卡最多 ${OFFICIAL_LIMITS.tablesPerCard.value} 个 table，当前为 ${tableCount}`);
        }
    });
    if (postIssues.length > 0)
        return { ok: false, issues: postIssues };
    const bundleDigest = jsonDigest({
        specDigest,
        compileOptions: { targetBudget },
        builderVersion: BUILDER_VERSION,
        rulesSnapshot: SNAPSHOT_ID,
        cardDigests: cards.map((card) => card.cardDigest),
    });
    return {
        ok: true,
        cards,
        builderVersion: BUILDER_VERSION,
        rulesSnapshot: SNAPSHOT_ID,
        specDigest,
        bundleDigest,
        snapshot: SNAPSHOT_ID,
        elementIndex,
    };
}
function countTag(value, tag) {
    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + countTag(item, tag), 0);
    }
    if (typeof value !== "object" || value === null)
        return 0;
    const record = value;
    let count = record.tag === tag ? 1 : 0;
    for (const child of Object.values(record))
        count += countTag(child, tag);
    return count;
}
export function buildOrThrowCardSpec(input, options = {}) {
    const result = compileCardSpec(input, options);
    if (!result.ok)
        throw new CardBuildError(result.issues);
    return result;
}
//# sourceMappingURL=compiler.js.map