import type { SupportedIconToken } from "./snapshot.js";
import type { BaseComponentSpec, BlockSpec, BodyLayoutSpec, ButtonSpec, CardConfigSpec, CardLinkSpec, CardSpec, CollapsiblePanelSpec, ColumnSetSpec, ColumnSpec, CompileOptions, ComponentSpec, DivSpec, FormSpec, HeaderSpec, HrSpec, IconSpec, ImageSpec, InputSpec, InteractiveContainerSpec, JsonObject, MarkdownSpec, StaticSelectSpec, TableColumnSpec, TableHeaderStyleSpec, TableSpec, TextKind, TextSpec } from "./types.js";
export interface SpecBuilder<T> {
    toSpec(): T;
}
declare abstract class ComponentBuilder<T extends BaseComponentSpec> implements SpecBuilder<T> {
    protected readonly spec: T;
    protected constructor(spec: T);
    protected abstract recreate(spec: T): this;
    key(value: string): this;
    streamTarget(enabled?: boolean): this;
    margin(value: string): this;
    toSpec(): T;
}
export declare function plainText(content: string): TextSpec;
export declare function larkMd(content: string): TextSpec;
export declare function standardIcon(token: SupportedIconToken, options?: {
    color?: string;
    size?: string;
}): IconSpec;
export declare function customIcon(imageKey: string): IconSpec;
export declare class HeaderBuilder implements SpecBuilder<HeaderSpec> {
    private readonly spec;
    constructor(spec: HeaderSpec);
    theme(value: NonNullable<HeaderSpec["theme"]>): HeaderBuilder;
    subtitle(content: string, kind?: TextKind): HeaderBuilder;
    icon(value: IconSpec): HeaderBuilder;
    tag(text: string, color?: string): HeaderBuilder;
    padding(value: string): HeaderBuilder;
    titleKind(kind: TextKind): HeaderBuilder;
    toSpec(): HeaderSpec;
}
export declare function header(title: string): HeaderBuilder;
export declare class MarkdownBuilder extends ComponentBuilder<MarkdownSpec> {
    constructor(spec: MarkdownSpec);
    protected recreate(spec: MarkdownSpec): this;
    text(value: string): this;
    markdown(value: string): this;
    bold(value: string): this;
    link(label: string, url: string): this;
    lineBreak(): this;
    color(value: string): this;
    textSize(value: string): this;
    align(value: NonNullable<MarkdownSpec["textAlign"]>): this;
    icon(value: IconSpec): this;
}
export declare function markdown(content?: string): MarkdownBuilder;
export declare class DivBuilder extends ComponentBuilder<DivSpec> {
    constructor(spec: DivSpec);
    protected recreate(spec: DivSpec): this;
    text(content: string, kind?: TextKind): this;
    textStyle(options: Omit<TextSpec, "kind" | "content">): this;
    field(content: string, short?: boolean, kind?: TextKind): this;
    icon(value: IconSpec): this;
    width(value: string): this;
}
export declare function div(content?: string): DivBuilder;
export declare class HrBuilder extends ComponentBuilder<HrSpec> {
    constructor(spec?: HrSpec);
    protected recreate(spec: HrSpec): this;
}
export declare function hr(): HrBuilder;
export declare class ImageBuilder extends ComponentBuilder<ImageSpec> {
    constructor(spec: ImageSpec);
    protected recreate(spec: ImageSpec): this;
    title(value: string): this;
    scale(value: NonNullable<ImageSpec["scaleType"]>): this;
    size(value: string): this;
    cornerRadius(value: string): this;
    transparent(value?: boolean): this;
    preview(value?: boolean): this;
}
export declare function image(imageKey: string, alt?: string): ImageBuilder;
export declare class ButtonBuilder extends ComponentBuilder<ButtonSpec> {
    constructor(spec: ButtonSpec);
    protected recreate(spec: ButtonSpec): this;
    appearance(value: NonNullable<ButtonSpec["appearance"]>): this;
    size(value: NonNullable<ButtonSpec["size"]>): this;
    width(value: string): this;
    callback(value: JsonObject): this;
    openUrl(defaultUrl: string): this;
    icon(value: IconSpec): this;
    hoverTips(value: string): this;
    disabled(value?: boolean, tips?: string): this;
    confirm(title: string, text?: string): this;
    formAction(name: string, action: "submit" | "reset"): this;
}
export declare function button(text: string): ButtonBuilder;
export declare class InputBuilder extends ComponentBuilder<InputSpec> {
    constructor(spec: InputSpec);
    protected recreate(spec: InputSpec): this;
    name(value: string): this;
    required(value?: boolean): this;
    placeholder(value: string): this;
    defaultValue(value: string): this;
    label(value: string, position?: "top" | "left"): this;
    inputType(value: NonNullable<InputSpec["inputType"]>): this;
    rows(value: number): this;
    autoResize(maxRows?: number): this;
    maxLength(value: number): this;
    width(value: string): this;
    disabled(value?: boolean, tips?: string): this;
    callback(value: JsonObject): this;
}
export declare function input(name?: string): InputBuilder;
export declare class StaticSelectBuilder extends ComponentBuilder<StaticSelectSpec> {
    constructor(spec: StaticSelectSpec);
    protected recreate(spec: StaticSelectSpec): this;
    option(text: string, value: string, icon?: IconSpec): this;
    name(value: string): this;
    required(value?: boolean): this;
    appearance(value: "default" | "text"): this;
    placeholder(value: string): this;
    initialOption(value: string): this;
    initialIndex(value: number): this;
    width(value: string): this;
    disabled(value?: boolean, tips?: string): this;
    callback(value: JsonObject): this;
}
export declare function staticSelect(): StaticSelectBuilder;
export type AnyComponentBuilder = SpecBuilder<ComponentSpec>;
export type ComponentInput = ComponentSpec | AnyComponentBuilder;
export declare class FormBuilder extends ComponentBuilder<FormSpec> {
    constructor(spec: FormSpec);
    protected recreate(spec: FormSpec): this;
    add(value: ComponentInput): this;
    direction(value: "vertical" | "horizontal"): this;
    spacing(horizontal: string, vertical?: string): this;
    padding(value: string): this;
}
export declare function form(name: string): FormBuilder;
export declare class TableBuilder extends ComponentBuilder<TableSpec> {
    constructor(spec: TableSpec);
    protected recreate(spec: TableSpec): this;
    column(value: TableColumnSpec): this;
    row(value: JsonObject): this;
    pageSize(value: number): this;
    rowHeight(value: string, maxHeight?: string): this;
    freezeFirstColumn(value?: boolean): this;
    headerStyle(value: TableHeaderStyleSpec): this;
}
export declare function table(): TableBuilder;
export declare class ColumnBuilder extends ComponentBuilder<ColumnSpec> {
    constructor(spec: ColumnSpec);
    protected recreate(spec: ColumnSpec): this;
    add(value: ComponentInput): this;
    width(value: string, weight?: number): this;
    direction(value: "vertical" | "horizontal"): this;
    padding(value: string): this;
    background(value: string): this;
    cornerRadius(value: string): this;
    openUrl(value: string): this;
}
export declare function column(): ColumnBuilder;
export declare class ColumnSetBuilder extends ComponentBuilder<ColumnSetSpec> {
    constructor(spec: ColumnSetSpec);
    protected recreate(spec: ColumnSetSpec): this;
    add(value: ColumnBuilder | ColumnSpec): this;
    flex(value: NonNullable<ColumnSetSpec["flexMode"]>): this;
    spacing(value: string): this;
    background(value: string): this;
    openUrl(value: string): this;
}
export declare function columnSet(): ColumnSetBuilder;
export declare class CollapsiblePanelBuilder extends ComponentBuilder<CollapsiblePanelSpec> {
    constructor(spec: CollapsiblePanelSpec);
    protected recreate(spec: CollapsiblePanelSpec): this;
    add(value: ComponentInput): this;
    expanded(value?: boolean): this;
    background(value: string): this;
    border(color: string, cornerRadius?: string): this;
    padding(value: string): this;
}
export declare function collapsiblePanel(title: string): CollapsiblePanelBuilder;
export declare class InteractiveContainerBuilder extends ComponentBuilder<InteractiveContainerSpec> {
    constructor(spec: InteractiveContainerSpec);
    protected recreate(spec: InteractiveContainerSpec): this;
    add(value: ComponentInput): this;
    callback(value: JsonObject): this;
    openUrl(defaultUrl: string): this;
    private addBehavior;
    size(width: string, height?: string): this;
    background(value: string): this;
    border(color: string, cornerRadius?: string): this;
    padding(value: string): this;
}
export declare function interactiveContainer(): InteractiveContainerBuilder;
export declare class BlockBuilder implements SpecBuilder<BlockSpec> {
    private readonly spec;
    constructor(spec?: BlockSpec);
    add(value: ComponentInput): BlockBuilder;
    toSpec(): BlockSpec;
}
export declare function block(): BlockBuilder;
export declare class CardBuilder implements SpecBuilder<CardSpec> {
    private readonly spec;
    constructor(spec?: CardSpec);
    cardKey(value: string): CardBuilder;
    header(value: HeaderBuilder | HeaderSpec): CardBuilder;
    width(value: NonNullable<CardConfigSpec["widthMode"]>): CardBuilder;
    enableForward(value?: boolean): CardBuilder;
    summary(value: string): CardBuilder;
    streamingMode(value?: boolean): CardBuilder;
    streaming(value?: NonNullable<CardConfigSpec["streamingConfig"]>): CardBuilder;
    textStyle(name: string, value: {
        default: string;
        pc?: string;
        mobile?: string;
    }): CardBuilder;
    colorStyle(name: string, value: {
        lightMode: string;
        darkMode: string;
    }): CardBuilder;
    bodyLayout(value: BodyLayoutSpec): CardBuilder;
    cardLink(value: string | CardLinkSpec): CardBuilder;
    add(value: BlockBuilder | BlockSpec | ComponentInput): CardBuilder;
    compile(options?: CompileOptions): import("./types.js").CompiledCards;
    buildOrThrow(options?: CompileOptions): {
        ok: true;
        cards: import("./types.js").CompiledCardPart[];
        builderVersion: string;
        rulesSnapshot: string;
        specDigest: string;
        bundleDigest: string;
        snapshot: string;
        elementIndex: Record<string, import("./types.js").ElementIndexEntry>;
    };
    toSpec(): CardSpec;
    private withConfig;
}
export declare function card(): CardBuilder;
export {};
//# sourceMappingURL=builders.d.ts.map