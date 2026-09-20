import { buildOrThrowCardSpec, compileCardSpec, } from "./compiler.js";
function clone(value) {
    return structuredClone(value);
}
function unwrap(input) {
    return "toSpec" in input
        ? input.toSpec()
        : clone(input);
}
function escapeMarkdownText(value) {
    return value.replace(/[\\`*{}\[\]()#+\-.!_~<>:|]/g, "\\$&");
}
class ComponentBuilder {
    spec;
    constructor(spec) {
        this.spec = spec;
    }
    key(value) {
        return this.recreate({ ...this.spec, key: value });
    }
    streamTarget(enabled = true) {
        return this.recreate({ ...this.spec, streamTarget: enabled });
    }
    margin(value) {
        return this.recreate({ ...this.spec, margin: value });
    }
    toSpec() {
        return clone(this.spec);
    }
}
export function plainText(content) {
    return { kind: "plainText", content };
}
export function larkMd(content) {
    return { kind: "larkMd", content };
}
export function standardIcon(token, options = {}) {
    return { kind: "standardIcon", token, ...options };
}
export function customIcon(imageKey) {
    return { kind: "customIcon", imageKey };
}
export class HeaderBuilder {
    spec;
    constructor(spec) {
        this.spec = spec;
    }
    theme(value) {
        return new HeaderBuilder({ ...this.spec, theme: value });
    }
    subtitle(content, kind = "plainText") {
        return new HeaderBuilder({
            ...this.spec,
            subtitle: { kind, content },
        });
    }
    icon(value) {
        return new HeaderBuilder({ ...this.spec, icon: clone(value) });
    }
    tag(text, color) {
        const tag = color === undefined ? { text } : { text, color };
        return new HeaderBuilder({
            ...this.spec,
            tags: [...(this.spec.tags ?? []), tag],
        });
    }
    padding(value) {
        return new HeaderBuilder({ ...this.spec, padding: value });
    }
    titleKind(kind) {
        return new HeaderBuilder({
            ...this.spec,
            title: { ...this.spec.title, kind },
        });
    }
    toSpec() {
        return clone(this.spec);
    }
}
export function header(title) {
    return new HeaderBuilder({ title: plainText(title) });
}
export class MarkdownBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new MarkdownBuilder(spec);
    }
    text(value) {
        return this.recreate({
            ...this.spec,
            content: (this.spec.content ?? "") + escapeMarkdownText(value),
        });
    }
    markdown(value) {
        return this.recreate({ ...this.spec, content: (this.spec.content ?? "") + value });
    }
    bold(value) {
        return this.recreate({
            ...this.spec,
            content: `${this.spec.content ?? ""}**${escapeMarkdownText(value)}**`,
        });
    }
    link(label, url) {
        return this.recreate({
            ...this.spec,
            content: `${this.spec.content ?? ""}[${escapeMarkdownText(label)}](${url})`,
        });
    }
    lineBreak() {
        return this.recreate({ ...this.spec, content: `${this.spec.content ?? ""}\n` });
    }
    color(value) {
        return this.recreate({ ...this.spec, color: value });
    }
    textSize(value) {
        return this.recreate({ ...this.spec, textSize: value });
    }
    align(value) {
        return this.recreate({ ...this.spec, textAlign: value });
    }
    icon(value) {
        return this.recreate({ ...this.spec, icon: clone(value) });
    }
}
export function markdown(content = "") {
    return new MarkdownBuilder({ kind: "markdown", content });
}
export class DivBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new DivBuilder(spec);
    }
    text(content, kind = "plainText") {
        return this.recreate({ ...this.spec, text: { kind, content } });
    }
    textStyle(options) {
        if (!this.spec.text)
            return this;
        return this.recreate({
            ...this.spec,
            text: { ...this.spec.text, ...options },
        });
    }
    field(content, short = false, kind = "larkMd") {
        return this.recreate({
            ...this.spec,
            fields: [
                ...(this.spec.fields ?? []),
                { short, text: { kind, content } },
            ],
        });
    }
    icon(value) {
        return this.recreate({ ...this.spec, icon: clone(value) });
    }
    width(value) {
        return this.recreate({ ...this.spec, width: value });
    }
}
export function div(content) {
    return new DivBuilder({
        kind: "div",
        ...(content === undefined ? {} : { text: plainText(content) }),
    });
}
export class HrBuilder extends ComponentBuilder {
    constructor(spec = { kind: "hr" }) {
        super(spec);
    }
    recreate(spec) {
        return new HrBuilder(spec);
    }
}
export function hr() {
    return new HrBuilder();
}
export class ImageBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new ImageBuilder(spec);
    }
    title(value) {
        return this.recreate({ ...this.spec, title: value });
    }
    scale(value) {
        return this.recreate({ ...this.spec, scaleType: value });
    }
    size(value) {
        return this.recreate({ ...this.spec, size: value });
    }
    cornerRadius(value) {
        return this.recreate({ ...this.spec, cornerRadius: value });
    }
    transparent(value = true) {
        return this.recreate({ ...this.spec, transparent: value });
    }
    preview(value = true) {
        return this.recreate({ ...this.spec, preview: value });
    }
}
export function image(imageKey, alt = "") {
    return new ImageBuilder({ kind: "image", imageKey, alt });
}
export class ButtonBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new ButtonBuilder(spec);
    }
    appearance(value) {
        return this.recreate({ ...this.spec, appearance: value });
    }
    size(value) {
        return this.recreate({ ...this.spec, size: value });
    }
    width(value) {
        return this.recreate({ ...this.spec, width: value });
    }
    callback(value) {
        return this.recreate({
            ...this.spec,
            behaviors: [
                ...(this.spec.behaviors ?? []),
                { kind: "callback", value: clone(value) },
            ],
        });
    }
    openUrl(defaultUrl) {
        return this.recreate({
            ...this.spec,
            behaviors: [
                ...(this.spec.behaviors ?? []),
                { kind: "openUrl", defaultUrl },
            ],
        });
    }
    icon(value) {
        return this.recreate({ ...this.spec, icon: clone(value) });
    }
    hoverTips(value) {
        return this.recreate({ ...this.spec, hoverTips: value });
    }
    disabled(value = true, tips) {
        return this.recreate({
            ...this.spec,
            disabled: value,
            ...(tips === undefined ? {} : { disabledTips: tips }),
        });
    }
    confirm(title, text) {
        const confirm = text === undefined ? { title } : { title, text };
        return this.recreate({ ...this.spec, confirm });
    }
    formAction(name, action) {
        const { behaviors: _behaviors, ...rest } = this.spec;
        return this.recreate({ ...rest, name, formAction: action });
    }
}
export function button(text) {
    return new ButtonBuilder({ kind: "button", text });
}
export class InputBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new InputBuilder(spec);
    }
    name(value) {
        return this.recreate({ ...this.spec, name: value });
    }
    required(value = true) {
        return this.recreate({ ...this.spec, required: value });
    }
    placeholder(value) {
        return this.recreate({ ...this.spec, placeholder: value });
    }
    defaultValue(value) {
        return this.recreate({ ...this.spec, defaultValue: value });
    }
    label(value, position = "top") {
        return this.recreate({ ...this.spec, label: value, labelPosition: position });
    }
    inputType(value) {
        return this.recreate({ ...this.spec, inputType: value });
    }
    rows(value) {
        return this.recreate({ ...this.spec, rows: value });
    }
    autoResize(maxRows) {
        return this.recreate({
            ...this.spec,
            autoResize: true,
            ...(maxRows === undefined ? {} : { maxRows }),
        });
    }
    maxLength(value) {
        return this.recreate({ ...this.spec, maxLength: value });
    }
    width(value) {
        return this.recreate({ ...this.spec, width: value });
    }
    disabled(value = true, tips) {
        return this.recreate({
            ...this.spec,
            disabled: value,
            ...(tips === undefined ? {} : { disabledTips: tips }),
        });
    }
    callback(value) {
        return this.recreate({
            ...this.spec,
            behaviors: [
                ...(this.spec.behaviors ?? []),
                { kind: "callback", value: clone(value) },
            ],
        });
    }
}
export function input(name) {
    return new InputBuilder({ kind: "input", ...(name === undefined ? {} : { name }) });
}
export class StaticSelectBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new StaticSelectBuilder(spec);
    }
    option(text, value, icon) {
        return this.recreate({
            ...this.spec,
            options: [
                ...this.spec.options,
                { text, value, ...(icon === undefined ? {} : { icon: clone(icon) }) },
            ],
        });
    }
    name(value) {
        return this.recreate({ ...this.spec, name: value });
    }
    required(value = true) {
        return this.recreate({ ...this.spec, required: value });
    }
    appearance(value) {
        return this.recreate({ ...this.spec, appearance: value });
    }
    placeholder(value) {
        return this.recreate({ ...this.spec, placeholder: value });
    }
    initialOption(value) {
        return this.recreate({ ...this.spec, initialOption: value });
    }
    initialIndex(value) {
        return this.recreate({ ...this.spec, initialIndex: value });
    }
    width(value) {
        return this.recreate({ ...this.spec, width: value });
    }
    disabled(value = true, tips) {
        return this.recreate({
            ...this.spec,
            disabled: value,
            ...(tips === undefined ? {} : { disabledTips: tips }),
        });
    }
    callback(value) {
        return this.recreate({
            ...this.spec,
            behaviors: [
                ...(this.spec.behaviors ?? []),
                { kind: "callback", value: clone(value) },
            ],
        });
    }
}
export function staticSelect() {
    return new StaticSelectBuilder({ kind: "staticSelect", options: [] });
}
function componentSpec(input) {
    return unwrap(input);
}
export class FormBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new FormBuilder(spec);
    }
    add(value) {
        return this.recreate({
            ...this.spec,
            components: [...this.spec.components, componentSpec(value)],
        });
    }
    direction(value) {
        return this.recreate({ ...this.spec, direction: value });
    }
    spacing(horizontal, vertical = horizontal) {
        return this.recreate({
            ...this.spec,
            horizontalSpacing: horizontal,
            verticalSpacing: vertical,
        });
    }
    padding(value) {
        return this.recreate({ ...this.spec, padding: value });
    }
}
export function form(name) {
    return new FormBuilder({ kind: "form", name, components: [] });
}
export class TableBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new TableBuilder(spec);
    }
    column(value) {
        return this.recreate({
            ...this.spec,
            columns: [...this.spec.columns, clone(value)],
        });
    }
    row(value) {
        return this.recreate({ ...this.spec, rows: [...this.spec.rows, clone(value)] });
    }
    pageSize(value) {
        return this.recreate({ ...this.spec, pageSize: value });
    }
    rowHeight(value, maxHeight) {
        return this.recreate({
            ...this.spec,
            rowHeight: value,
            ...(maxHeight === undefined ? {} : { rowMaxHeight: maxHeight }),
        });
    }
    freezeFirstColumn(value = true) {
        return this.recreate({ ...this.spec, freezeFirstColumn: value });
    }
    headerStyle(value) {
        return this.recreate({ ...this.spec, headerStyle: clone(value) });
    }
}
export function table() {
    return new TableBuilder({ kind: "table", columns: [], rows: [] });
}
export class ColumnBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new ColumnBuilder(spec);
    }
    add(value) {
        return this.recreate({
            ...this.spec,
            components: [...this.spec.components, componentSpec(value)],
        });
    }
    width(value, weight) {
        return this.recreate({
            ...this.spec,
            width: value,
            ...(weight === undefined ? {} : { weight }),
        });
    }
    direction(value) {
        return this.recreate({ ...this.spec, direction: value });
    }
    padding(value) {
        return this.recreate({ ...this.spec, padding: value });
    }
    background(value) {
        return this.recreate({ ...this.spec, backgroundStyle: value });
    }
    cornerRadius(value) {
        return this.recreate({ ...this.spec, cornerRadius: value });
    }
    openUrl(value) {
        return this.recreate({ ...this.spec, openUrl: value });
    }
}
export function column() {
    return new ColumnBuilder({ kind: "column", components: [] });
}
export class ColumnSetBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new ColumnSetBuilder(spec);
    }
    add(value) {
        return this.recreate({
            ...this.spec,
            columns: [...this.spec.columns, unwrap(value)],
        });
    }
    flex(value) {
        return this.recreate({ ...this.spec, flexMode: value });
    }
    spacing(value) {
        return this.recreate({ ...this.spec, horizontalSpacing: value });
    }
    background(value) {
        return this.recreate({ ...this.spec, backgroundStyle: value });
    }
    openUrl(value) {
        return this.recreate({ ...this.spec, openUrl: value });
    }
}
export function columnSet() {
    return new ColumnSetBuilder({ kind: "columnSet", columns: [] });
}
export class CollapsiblePanelBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new CollapsiblePanelBuilder(spec);
    }
    add(value) {
        return this.recreate({
            ...this.spec,
            components: [...this.spec.components, componentSpec(value)],
        });
    }
    expanded(value = true) {
        return this.recreate({ ...this.spec, expanded: value });
    }
    background(value) {
        return this.recreate({ ...this.spec, backgroundColor: value });
    }
    border(color, cornerRadius) {
        return this.recreate({
            ...this.spec,
            border: { color, ...(cornerRadius === undefined ? {} : { cornerRadius }) },
        });
    }
    padding(value) {
        return this.recreate({ ...this.spec, padding: value });
    }
}
export function collapsiblePanel(title) {
    return new CollapsiblePanelBuilder({
        kind: "collapsiblePanel",
        header: { title: plainText(title) },
        components: [],
    });
}
export class InteractiveContainerBuilder extends ComponentBuilder {
    constructor(spec) {
        super(spec);
    }
    recreate(spec) {
        return new InteractiveContainerBuilder(spec);
    }
    add(value) {
        return this.recreate({
            ...this.spec,
            components: [...this.spec.components, componentSpec(value)],
        });
    }
    callback(value) {
        return this.addBehavior({ kind: "callback", value: clone(value) });
    }
    openUrl(defaultUrl) {
        return this.addBehavior({ kind: "openUrl", defaultUrl });
    }
    addBehavior(value) {
        return this.recreate({
            ...this.spec,
            behaviors: [...this.spec.behaviors, value],
        });
    }
    size(width, height) {
        return this.recreate({
            ...this.spec,
            width,
            ...(height === undefined ? {} : { height }),
        });
    }
    background(value) {
        return this.recreate({ ...this.spec, backgroundStyle: value });
    }
    border(color, cornerRadius) {
        return this.recreate({
            ...this.spec,
            hasBorder: true,
            borderColor: color,
            ...(cornerRadius === undefined ? {} : { cornerRadius }),
        });
    }
    padding(value) {
        return this.recreate({ ...this.spec, padding: value });
    }
}
export function interactiveContainer() {
    return new InteractiveContainerBuilder({
        kind: "interactiveContainer",
        components: [],
        behaviors: [],
    });
}
export class BlockBuilder {
    spec;
    constructor(spec = { kind: "block", components: [] }) {
        this.spec = spec;
    }
    add(value) {
        return new BlockBuilder({
            ...this.spec,
            components: [...this.spec.components, componentSpec(value)],
        });
    }
    toSpec() {
        return clone(this.spec);
    }
}
export function block() {
    return new BlockBuilder();
}
export class CardBuilder {
    spec;
    constructor(spec = {
        specVersion: 1,
        kind: "card",
        blocks: [],
    }) {
        this.spec = spec;
    }
    cardKey(value) {
        return new CardBuilder({ ...this.spec, cardKey: value });
    }
    header(value) {
        return new CardBuilder({ ...this.spec, header: unwrap(value) });
    }
    width(value) {
        return this.withConfig({ widthMode: value });
    }
    enableForward(value = true) {
        return this.withConfig({ enableForward: value });
    }
    summary(value) {
        return this.withConfig({ summary: value });
    }
    streamingMode(value = true) {
        return this.withConfig({ streamingMode: value });
    }
    streaming(value = {}) {
        return this.withConfig({ streamingMode: true, streamingConfig: clone(value) });
    }
    textStyle(name, value) {
        return this.withConfig({
            textStyles: {
                ...(this.spec.config?.textStyles ?? {}),
                [name]: clone(value),
            },
        });
    }
    colorStyle(name, value) {
        return this.withConfig({
            colorStyles: {
                ...(this.spec.config?.colorStyles ?? {}),
                [name]: clone(value),
            },
        });
    }
    bodyLayout(value) {
        return new CardBuilder({ ...this.spec, body: clone(value) });
    }
    cardLink(value) {
        const link = typeof value === "string" ? { url: value } : clone(value);
        return new CardBuilder({ ...this.spec, cardLink: link });
    }
    add(value) {
        const nextBlock = isBlock(value)
            ? unwrap(value)
            : { kind: "block", components: [componentSpec(value)] };
        return new CardBuilder({
            ...this.spec,
            blocks: [...this.spec.blocks, nextBlock],
        });
    }
    compile(options = {}) {
        return compileCardSpec(this.spec, options);
    }
    buildOrThrow(options = {}) {
        return buildOrThrowCardSpec(this.spec, options);
    }
    toSpec() {
        return clone(this.spec);
    }
    withConfig(patch) {
        return new CardBuilder({
            ...this.spec,
            config: { updateMulti: true, ...this.spec.config, ...patch },
        });
    }
}
function isBlock(value) {
    if (value instanceof BlockBuilder)
        return true;
    if (typeof value !== "object" || value === null)
        return false;
    if ("kind" in value && value.kind === "block")
        return true;
    if ("toSpec" in value) {
        return value.toSpec().kind === "block";
    }
    return false;
}
export function card() {
    return new CardBuilder();
}
//# sourceMappingURL=builders.js.map